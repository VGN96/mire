import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import wardrobeRoutes from '../routes/wardrobe.js';
import { authenticate } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';

vi.mock('../config/db.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    wardrobeItem: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '../config/db.js';

const testUser = {
  id: 'user-1', email: 'test@test.com', name: 'Test', city: 'Rajkot',
  stylePersona: [], bust: null, waist: null, hip: null, shoulder: null, sleeveLength: null,
};

const app = express();
app.use(express.json());
app.use('/api/wardrobe', authenticate, wardrobeRoutes);
app.use(errorHandler);

function authHeader() {
  const token = jwt.sign({ userId: testUser.id }, process.env.JWT_SECRET);
  prisma.user.findUnique.mockResolvedValue(testUser);
  return `Bearer ${token}`;
}

describe('GET /api/wardrobe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns items list with stats', async () => {
    prisma.wardrobeItem.findMany.mockResolvedValue([
      { id: '1', name: 'Blue Kurta', category: 'tops', wornCount: 5, purchasePrice: 1000 },
      { id: '2', name: 'White Palazzo', category: 'bottoms', wornCount: 3, purchasePrice: 800 },
    ]);

    const res = await request(app).get('/api/wardrobe').set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.stats.total).toBe(2);
    expect(res.body.stats.totalCost).toBe(1800);
    expect(res.body.stats).toHaveProperty('ecoScore');
  });

  it('returns empty items with zero stats', async () => {
    prisma.wardrobeItem.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/wardrobe').set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.stats.total).toBe(0);
    expect(res.body.stats.costPerWear).toBe(0);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/wardrobe');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/wardrobe eco score', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scores C for unworn items', async () => {
    prisma.wardrobeItem.findMany.mockResolvedValue([
      { id: '1', name: 'Item 1', category: 'tops', wornCount: 0, purchasePrice: 500 },
      { id: '2', name: 'Item 2', category: 'tops', wornCount: 0, purchasePrice: 500 },
    ]);
    const res = await request(app).get('/api/wardrobe').set('Authorization', authHeader());
    expect(res.body.stats.ecoScore).toBe('C');
  });

  it('scores B for moderately worn items (avg ~4)', async () => {
    prisma.wardrobeItem.findMany.mockResolvedValue([
      { id: '1', name: 'Item 1', category: 'tops', wornCount: 4, purchasePrice: 500 },
      { id: '2', name: 'Item 2', category: 'tops', wornCount: 4, purchasePrice: 500 },
    ]);
    const res = await request(app).get('/api/wardrobe').set('Authorization', authHeader());
    expect(res.body.stats.ecoScore).toBe('B');
  });

  it('scores A+ for heavily worn items (avg > 15)', async () => {
    prisma.wardrobeItem.findMany.mockResolvedValue([
      { id: '1', name: 'Item 1', category: 'tops', wornCount: 20, purchasePrice: 500 },
      { id: '2', name: 'Item 2', category: 'tops', wornCount: 16, purchasePrice: 500 },
    ]);
    const res = await request(app).get('/api/wardrobe').set('Authorization', authHeader());
    expect(res.body.stats.ecoScore).toBe('A+');
  });

  it('counts unworn items correctly', async () => {
    prisma.wardrobeItem.findMany.mockResolvedValue([
      { id: '1', name: 'Worn', category: 'tops', wornCount: 5, purchasePrice: 0 },
      { id: '2', name: 'Never', category: 'tops', wornCount: 0, purchasePrice: 0 },
      { id: '3', name: 'Also never', category: 'tops', wornCount: 0, purchasePrice: 0 },
    ]);
    const res = await request(app).get('/api/wardrobe').set('Authorization', authHeader());
    expect(res.body.stats.unworn).toBe(2);
  });
});

describe('POST /api/wardrobe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/wardrobe')
      .set('Authorization', authHeader())
      .send({ category: 'tops' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when category is missing', async () => {
    const res = await request(app).post('/api/wardrobe')
      .set('Authorization', authHeader())
      .send({ name: 'Test Item' });
    expect(res.status).toBe(400);
  });

  it('creates item and returns 201', async () => {
    const newItem = { id: 'item-1', name: 'White Shirt', category: 'tops', userId: 'user-1', wornCount: 0 };
    prisma.wardrobeItem.create.mockResolvedValue(newItem);

    const res = await request(app).post('/api/wardrobe')
      .set('Authorization', authHeader())
      .send({ name: 'White Shirt', category: 'tops', color: 'white', brand: 'Fabindia' });

    expect(res.status).toBe(201);
    expect(res.body.item.name).toBe('White Shirt');
    expect(res.body.item.category).toBe('tops');
  });
});

describe('GET /api/wardrobe/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when item does not exist', async () => {
    prisma.wardrobeItem.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/wardrobe/nonexistent')
      .set('Authorization', authHeader());
    expect(res.status).toBe(404);
  });

  it('returns item when found', async () => {
    const item = { id: 'item-1', name: 'Silk Saree', category: 'ethnic', userId: 'user-1', wornCount: 2 };
    prisma.wardrobeItem.findFirst.mockResolvedValue(item);

    const res = await request(app).get('/api/wardrobe/item-1')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.item.name).toBe('Silk Saree');
  });
});

describe('PATCH /api/wardrobe/:id/worn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('increments worn count and returns updated item', async () => {
    const updated = { id: 'item-1', name: 'Kurta', wornCount: 6, lastWornAt: new Date().toISOString() };
    prisma.wardrobeItem.findFirst.mockResolvedValue({ id: 'item-1', userId: 'user-1' });
    prisma.wardrobeItem.update.mockResolvedValue(updated);

    const res = await request(app).patch('/api/wardrobe/item-1/worn')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.item.wornCount).toBe(6);
  });
});

describe('DELETE /api/wardrobe/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('soft-deletes item (sets isActive=false)', async () => {
    prisma.wardrobeItem.findFirst.mockResolvedValue({ id: 'item-1', userId: 'user-1' });
    prisma.wardrobeItem.update.mockResolvedValue({ id: 'item-1', isActive: false });

    const res = await request(app).delete('/api/wardrobe/item-1')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Removed');
    expect(prisma.wardrobeItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    );
  });
});
