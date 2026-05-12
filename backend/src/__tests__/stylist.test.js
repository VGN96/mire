import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import stylistRoutes from '../routes/stylist.js';
import { authenticate } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';

vi.mock('../config/db.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    wardrobeItem: { findMany: vi.fn() },
    chatSession: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    chatMessage: { createMany: vi.fn() },
  },
}));

// Module-level ref so mockImplementation closure can reference it at call time
let mockCreate;

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    this.messages = { create: mockCreate };
  }),
}));

vi.mock('axios', () => ({
  default: { get: vi.fn().mockRejectedValue(new Error('network error')) },
}));

import { prisma } from '../config/db.js';

const testUser = {
  id: 'user-1', email: 'test@test.com', name: 'Vaishali', city: 'Rajkot',
  stylePersona: ['Elegant'], bust: null, waist: null, hip: null, shoulder: null, sleeveLength: null,
};

const app = express();
app.use(express.json());
app.use('/api/stylist', authenticate, stylistRoutes);
app.use(errorHandler);

function authHeader() {
  const token = jwt.sign({ userId: testUser.id }, process.env.JWT_SECRET);
  prisma.user.findUnique.mockResolvedValue(testUser);
  return `Bearer ${token}`;
}

const wardrobeItems = [
  { name: 'Blue Kurta', category: 'ethnic', color: 'blue', wornCount: 3 },
  { name: 'White Palazzo', category: 'bottoms', color: 'white', wornCount: 5 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate = vi.fn().mockResolvedValue({
    content: [{ text: 'Try your Blue Kurta with white trousers for a fresh look! 👗' }],
  });
});

describe('POST /api/stylist/chat', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when message is empty or whitespace', async () => {
    const res = await request(app).post('/api/stylist/chat')
      .set('Authorization', authHeader())
      .send({ message: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('message required');
  });

  it('returns 400 when message is missing', async () => {
    const res = await request(app).post('/api/stylist/chat')
      .set('Authorization', authHeader())
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 503 when ANTHROPIC_API_KEY is the placeholder', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-...';

    const res = await request(app).post('/api/stylist/chat')
      .set('Authorization', authHeader())
      .send({ message: 'What should I wear?' });

    expect(res.status).toBe(503);
    process.env.ANTHROPIC_API_KEY = saved;
  });

  it('returns AI response with sessionId when creating new session', async () => {
    prisma.wardrobeItem.findMany.mockResolvedValue(wardrobeItems);
    prisma.chatSession.findFirst.mockResolvedValue(null);
    prisma.chatSession.create.mockResolvedValue({ id: 'session-new' });
    prisma.chatMessage.createMany.mockResolvedValue({});
    prisma.chatSession.update.mockResolvedValue({});

    const res = await request(app).post('/api/stylist/chat')
      .set('Authorization', authHeader())
      .send({ message: 'What should I wear today?' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body.sessionId).toBe('session-new');
  });

  it('reuses existing session when sessionId is provided', async () => {
    prisma.wardrobeItem.findMany.mockResolvedValue(wardrobeItems);
    prisma.chatSession.findFirst.mockResolvedValue({ id: 'existing-session' });
    prisma.chatMessage.createMany.mockResolvedValue({});
    prisma.chatSession.update.mockResolvedValue({});

    const res = await request(app).post('/api/stylist/chat')
      .set('Authorization', authHeader())
      .send({ message: 'Suggest a casual look', sessionId: 'existing-session' });

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe('existing-session');
    expect(prisma.chatSession.create).not.toHaveBeenCalled();
  });

  it('strips outfit JSON from displayed message', async () => {
    // Note: the route's regex stops at the first `}`, so pieces must not contain nested objects
    mockCreate = vi.fn().mockResolvedValue({
      content: [{ text: 'Here is your outfit! {"outfit":true,"title":"Day Look","pieces":["Blue Kurta","White Palazzo"]}' }],
    });

    prisma.wardrobeItem.findMany.mockResolvedValue(wardrobeItems);
    prisma.chatSession.create.mockResolvedValue({ id: 'session-1' });
    prisma.chatMessage.createMany.mockResolvedValue({});
    prisma.chatSession.update.mockResolvedValue({});

    const res = await request(app).post('/api/stylist/chat')
      .set('Authorization', authHeader())
      .send({ message: 'Give me an outfit' });

    expect(res.status).toBe(200);
    expect(res.body.message).not.toContain('"outfit":true');
    expect(res.body.outfitData).toMatchObject({ outfit: true, title: 'Day Look' });
    expect(res.body.outfitData.pieces).toEqual(['Blue Kurta', 'White Palazzo']);
  });
});

describe('POST /api/stylist/ootd', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns friendly message when wardrobe has fewer than 2 items', async () => {
    prisma.wardrobeItem.findMany.mockResolvedValue([
      { name: 'Blue Kurta', category: 'ethnic', color: 'blue', wornCount: 1 },
    ]);

    const res = await request(app).post('/api/stylist/ootd')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.outfit).toBeNull();
    expect(res.body.message).toMatch(/2 wardrobe items/);
  });

  it('returns AI-generated outfit with enough wardrobe items', async () => {
    prisma.wardrobeItem.findMany.mockResolvedValue(wardrobeItems);

    const res = await request(app).post('/api/stylist/ootd')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
  });
});

describe('GET /api/stylist/sessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns list of chat sessions', async () => {
    prisma.chatSession.findMany.mockResolvedValue([
      { id: 'session-1', title: 'What to wear?', updatedAt: new Date().toISOString(), messages: [] },
      { id: 'session-2', title: 'Party outfit', updatedAt: new Date().toISOString(), messages: [] },
    ]);

    const res = await request(app).get('/api/stylist/sessions')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(2);
    expect(res.body.sessions[0].id).toBe('session-1');
  });

  it('returns empty array when no sessions exist', async () => {
    prisma.chatSession.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/stylist/sessions')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(0);
  });
});
