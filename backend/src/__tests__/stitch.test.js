import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import stitchRoutes from '../routes/stitch.js';
import { authenticate } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';

vi.mock('../config/db.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    stitchBrief: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

let mockAiCreate;
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    this.messages = { create: mockAiCreate };
  }),
}));

import { prisma } from '../config/db.js';

const testUser = {
  id: 'user-1', email: 'test@test.com', name: 'Test', city: 'Rajkot',
  stylePersona: [], bust: 36, waist: 28, hip: 38, shoulder: 14, sleeveLength: 24,
};

const app = express();
app.use(express.json());
app.use('/api/stitch', authenticate, stitchRoutes);
app.use(errorHandler);

function authHeader() {
  const token = jwt.sign({ userId: testUser.id }, process.env.JWT_SECRET);
  prisma.user.findUnique.mockResolvedValue(testUser);
  return `Bearer ${token}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAiCreate = vi.fn().mockResolvedValue({
    content: [{ text: JSON.stringify({ garmentType: 'Anarkali', difficulty: 'moderate' }) }],
  });
});

// ─── POST /api/stitch/briefs ──────────────────────────────────────────────────

describe('POST /api/stitch/briefs', () => {
  it('creates a brief and returns 201', async () => {
    prisma.stitchBrief.count.mockResolvedValue(0);
    prisma.stitchBrief.create.mockResolvedValue({
      id: 'brief-1', briefNumber: 'SS-2026-001', title: 'Anarkali Suit',
      userId: 'user-1', status: 'draft',
    });

    const res = await request(app).post('/api/stitch/briefs')
      .set('Authorization', authHeader())
      .send({ title: 'Anarkali Suit', garmentType: 'Anarkali' });

    expect(res.status).toBe(201);
    expect(res.body.brief.briefNumber).toBe('SS-2026-001');
    expect(res.body.brief.title).toBe('Anarkali Suit');
  });

  it('uses garmentType as title fallback when title is omitted', async () => {
    prisma.stitchBrief.count.mockResolvedValue(2);
    prisma.stitchBrief.create.mockResolvedValue({
      id: 'brief-2', briefNumber: 'SS-2026-003', title: 'Lehenga',
    });

    const res = await request(app).post('/api/stitch/briefs')
      .set('Authorization', authHeader())
      .send({ garmentType: 'Lehenga' });

    expect(res.status).toBe(201);
    expect(prisma.stitchBrief.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'Lehenga' }) })
    );
  });

  it('falls back to "Untitled Brief" when neither title nor garmentType is given', async () => {
    prisma.stitchBrief.count.mockResolvedValue(0);
    prisma.stitchBrief.create.mockResolvedValue({
      id: 'brief-3', briefNumber: 'SS-2026-001', title: 'Untitled Brief',
    });

    const res = await request(app).post('/api/stitch/briefs')
      .set('Authorization', authHeader())
      .send({});

    expect(res.status).toBe(201);
    expect(prisma.stitchBrief.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'Untitled Brief' }) })
    );
  });

  it('copies user measurements into the brief', async () => {
    prisma.stitchBrief.count.mockResolvedValue(0);
    prisma.stitchBrief.create.mockResolvedValue({ id: 'brief-1', briefNumber: 'SS-2026-001' });

    await request(app).post('/api/stitch/briefs')
      .set('Authorization', authHeader())
      .send({ title: 'Saree Blouse' });

    expect(prisma.stitchBrief.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bust: 36, waist: 28, hip: 38 }),
      })
    );
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/stitch/briefs').send({ title: 'Test' });
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/stitch/briefs ───────────────────────────────────────────────────

describe('GET /api/stitch/briefs', () => {
  it('returns all briefs for the user', async () => {
    prisma.stitchBrief.findMany.mockResolvedValue([
      { id: 'brief-1', title: 'Anarkali', status: 'draft' },
      { id: 'brief-2', title: 'Lehenga', status: 'ready' },
    ]);

    const res = await request(app).get('/api/stitch/briefs')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.briefs).toHaveLength(2);
  });

  it('returns empty array when no briefs exist', async () => {
    prisma.stitchBrief.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/stitch/briefs')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.briefs).toHaveLength(0);
  });
});

// ─── GET /api/stitch/briefs/:id ──────────────────────────────────────────────

describe('GET /api/stitch/briefs/:id', () => {
  it('returns the brief when found', async () => {
    prisma.stitchBrief.findFirst.mockResolvedValue({
      id: 'brief-1', title: 'Anarkali', userId: 'user-1',
    });

    const res = await request(app).get('/api/stitch/briefs/brief-1')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.brief.id).toBe('brief-1');
  });

  it('returns 404 when brief does not exist', async () => {
    prisma.stitchBrief.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/stitch/briefs/nonexistent')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
  });
});

// ─── PUT /api/stitch/briefs/:id ──────────────────────────────────────────────

describe('PUT /api/stitch/briefs/:id', () => {
  it('updates and returns the brief', async () => {
    prisma.stitchBrief.update.mockResolvedValue({
      id: 'brief-1', title: 'Updated Anarkali', status: 'draft',
    });

    const res = await request(app).put('/api/stitch/briefs/brief-1')
      .set('Authorization', authHeader())
      .send({ title: 'Updated Anarkali' });

    expect(res.status).toBe(200);
    expect(res.body.brief.title).toBe('Updated Anarkali');
  });
});

// ─── PATCH /api/stitch/briefs/:id/ready ──────────────────────────────────────

describe('PATCH /api/stitch/briefs/:id/ready', () => {
  it('sets status to ready', async () => {
    prisma.stitchBrief.update.mockResolvedValue({
      id: 'brief-1', status: 'ready',
    });

    const res = await request(app).patch('/api/stitch/briefs/brief-1/ready')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.brief.status).toBe('ready');
    expect(prisma.stitchBrief.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ready' } })
    );
  });
});

// ─── DELETE /api/stitch/briefs/:id ───────────────────────────────────────────

describe('DELETE /api/stitch/briefs/:id', () => {
  it('deletes the brief and returns message', async () => {
    prisma.stitchBrief.delete.mockResolvedValue({});

    const res = await request(app).delete('/api/stitch/briefs/brief-1')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Deleted');
  });
});

// ─── POST /api/stitch/analyse ─────────────────────────────────────────────────

describe('POST /api/stitch/analyse', () => {
  it('returns fallback analysis when ANTHROPIC_API_KEY is placeholder', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-...';

    const res = await request(app).post('/api/stitch/analyse')
      .set('Authorization', authHeader())
      .send({ description: 'Silk Saree' });

    expect(res.status).toBe(200);
    expect(res.body.analysis.garmentType).toBe('Silk Saree');
    process.env.ANTHROPIC_API_KEY = saved;
  });

  it('returns AI analysis when key is set', async () => {
    const res = await request(app).post('/api/stitch/analyse')
      .set('Authorization', authHeader())
      .send({ description: 'Anarkali Kurta' });

    expect(res.status).toBe(200);
    expect(res.body.analysis.garmentType).toBe('Anarkali');
    expect(res.body.analysis.difficulty).toBe('moderate');
  });

  it('falls back gracefully when AI returns invalid JSON', async () => {
    mockAiCreate = vi.fn().mockResolvedValue({
      content: [{ text: 'Sorry, I cannot analyse this garment.' }],
    });

    const res = await request(app).post('/api/stitch/analyse')
      .set('Authorization', authHeader())
      .send({ description: 'Mystery Garment' });

    expect(res.status).toBe(200);
    expect(res.body.analysis).toBeDefined();
  });
});
