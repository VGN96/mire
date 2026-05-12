import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth.js';

vi.mock('../config/db.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

import { prisma } from '../config/db.js';

const testUser = {
  id: 'user-1', email: 'test@test.com', name: 'Test', city: null,
  stylePersona: [], bust: null, waist: null, hip: null, shoulder: null, sleeveLength: null,
};

const app = express();
app.use(express.json());
app.get('/protected', authenticate, (req, res) => res.json({ userId: req.user.id }));

describe('authenticate middleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 NO_TOKEN when Authorization header is missing', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_TOKEN');
  });

  it('returns 401 NO_TOKEN when header does not start with Bearer', async () => {
    const res = await request(app).get('/protected')
      .set('Authorization', 'Basic sometoken');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_TOKEN');
  });

  it('returns 401 INVALID_TOKEN on a garbage token', async () => {
    const res = await request(app).get('/protected')
      .set('Authorization', 'Bearer notavalidjwt');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 TOKEN_EXPIRED on an expired token', async () => {
    const expired = jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET, { expiresIn: -1 });
    const res = await request(app).get('/protected')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('returns 401 USER_NOT_FOUND when user was deleted after token issue', async () => {
    const token = jwt.sign({ userId: 'deleted-user' }, process.env.JWT_SECRET);
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('attaches user to req and passes through on valid token', async () => {
    const token = jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET);
    prisma.user.findUnique.mockResolvedValue(testUser);

    const res = await request(app).get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('user-1');
  });
});
