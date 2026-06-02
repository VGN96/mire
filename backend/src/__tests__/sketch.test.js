import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import sketchRoutes from '../routes/sketch.js';
import { authenticate } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';

vi.mock('../config/db.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    stitchBrief: { update: vi.fn() },
  },
}));

import { prisma } from '../config/db.js';

const testUser = {
  id: 'user-1', email: 'test@test.com', name: 'Test', city: 'Rajkot',
  stylePersona: [], bust: null, waist: null, hip: null, shoulder: null, sleeveLength: null,
};

const app = express();
app.use(express.json());
app.use('/api/sketch', authenticate, sketchRoutes);
app.use(errorHandler);

function authHeader() {
  const token = jwt.sign({ userId: testUser.id }, process.env.JWT_SECRET);
  prisma.user.findUnique.mockResolvedValue(testUser);
  return `Bearer ${token}`;
}

const PROXY_BASE = '/api/sketch/proxy?url=';

beforeEach(() => vi.clearAllMocks());

// ─── POST /api/sketch/generate ───────────────────────────────────────────────

describe('POST /api/sketch/generate', () => {
  it('returns 400 when prompt is missing', async () => {
    const res = await request(app).post('/api/sketch/generate')
      .set('Authorization', authHeader())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('prompt required');
  });

  it('returns a Pollinations imageUrl for a valid prompt', async () => {
    const res = await request(app).post('/api/sketch/generate')
      .set('Authorization', authHeader())
      .send({ prompt: 'Anarkali suit in blue silk' });

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toContain(PROXY_BASE);
    expect(res.body.prompt).toBe('Anarkali suit in blue silk');
    expect(res.body.style).toBe('fashion-sketch');
    expect(res.body.type).toBe('main');
  });

  it('respects the style parameter', async () => {
    const res = await request(app).post('/api/sketch/generate')
      .set('Authorization', authHeader())
      .send({ prompt: 'Lehenga', style: 'watercolour' });

    expect(res.status).toBe(200);
    expect(res.body.style).toBe('watercolour');
    expect(res.body.imageUrl).toContain('watercolour');
  });

  it('respects the type parameter', async () => {
    const res = await request(app).post('/api/sketch/generate')
      .set('Authorization', authHeader())
      .send({ prompt: 'Saree blouse', type: 'flat' });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('flat');
  });

  it('updates brief when briefId is provided', async () => {
    prisma.stitchBrief.update.mockResolvedValue({});

    const res = await request(app).post('/api/sketch/generate')
      .set('Authorization', authHeader())
      .send({ prompt: 'Kurta', type: 'main', briefId: 'brief-1' });

    expect(res.status).toBe(200);
    expect(prisma.stitchBrief.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'brief-1', userId: 'user-1' } })
    );
  });

  it('still returns 200 when brief update fails (silent error)', async () => {
    prisma.stitchBrief.update.mockRejectedValue(new Error('Brief not found'));

    const res = await request(app).post('/api/sketch/generate')
      .set('Authorization', authHeader())
      .send({ prompt: 'Dupatta', type: 'annotated', briefId: 'missing-brief' });

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toBeDefined();
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/sketch/generate')
      .send({ prompt: 'Test' });
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/sketch/batch ──────────────────────────────────────────────────

describe('POST /api/sketch/batch', () => {
  it('returns 400 when garmentPrompt is missing', async () => {
    const res = await request(app).post('/api/sketch/batch')
      .set('Authorization', authHeader())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('garmentPrompt required');
  });

  it('returns all sketch types for a valid garmentPrompt', async () => {
    const res = await request(app).post('/api/sketch/batch')
      .set('Authorization', authHeader())
      .send({ garmentPrompt: 'Silk Anarkali with zari embroidery' });

    expect(res.status).toBe(200);
    const { sketches } = res.body;
    expect(sketches).toHaveProperty('main');
    expect(sketches).toHaveProperty('watercolour');
    expect(sketches).toHaveProperty('flatFront');
    expect(sketches).toHaveProperty('flatBack');
    expect(sketches).toHaveProperty('annotated');
    expect(sketches.details).toHaveProperty('neck');
    expect(sketches.details).toHaveProperty('sleeve');
    expect(sketches.details).toHaveProperty('embroidery');
    expect(sketches.details).toHaveProperty('hem');
  });

  it('all sketch URLs point to Pollinations', async () => {
    const res = await request(app).post('/api/sketch/batch')
      .set('Authorization', authHeader())
      .send({ garmentPrompt: 'Lehenga' });

    const { sketches } = res.body;
    expect(sketches.main).toContain(PROXY_BASE);
    expect(sketches.flatFront).toContain(PROXY_BASE);
    expect(sketches.details.neck).toContain(PROXY_BASE);
  });

  it('updates brief when briefId is provided', async () => {
    prisma.stitchBrief.update.mockResolvedValue({});

    const res = await request(app).post('/api/sketch/batch')
      .set('Authorization', authHeader())
      .send({ garmentPrompt: 'Saree', briefId: 'brief-1' });

    expect(res.status).toBe(200);
    expect(prisma.stitchBrief.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'brief-1', userId: 'user-1' },
        data: expect.objectContaining({
          annotatedSketchUrl: expect.any(String),
          sketchUrls: expect.any(Array),
          flatViewUrls: expect.any(Array),
        }),
      })
    );
  });

  it('still returns 200 when brief update fails (silent error)', async () => {
    prisma.stitchBrief.update.mockRejectedValue(new Error('Brief not found'));

    const res = await request(app).post('/api/sketch/batch')
      .set('Authorization', authHeader())
      .send({ garmentPrompt: 'Kurta', briefId: 'ghost-brief' });

    expect(res.status).toBe(200);
    expect(res.body.sketches).toBeDefined();
  });
});
