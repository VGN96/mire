import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRoutes from '../routes/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';

vi.mock('../config/db.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    refreshToken: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2a$12$hashedpw'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('uuid', () => ({ v4: vi.fn().mockReturnValue('test-refresh-uuid') }));

import { prisma } from '../config/db.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(errorHandler);

describe('POST /api/auth/signup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 201 with user and tokens on valid data', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-1', email: 'test@test.com', name: 'Test',
      city: null, stylePersona: [], createdAt: new Date(),
    });
    prisma.refreshToken.create.mockResolvedValue({});

    const res = await request(app).post('/api/auth/signup')
      .send({ email: 'test@test.com', password: 'password123', name: 'Test' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken', 'test-refresh-uuid');
    expect(res.body.user.email).toBe('test@test.com');
  });

  it('returns 400 on invalid email', async () => {
    const res = await request(app).post('/api/auth/signup')
      .send({ email: 'notanemail', password: 'password123', name: 'Test' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on password shorter than 6 chars', async () => {
    const res = await request(app).post('/api/auth/signup')
      .send({ email: 'test@test.com', password: '12345', name: 'Test' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing name', async () => {
    const res = await request(app).post('/api/auth/signup')
      .send({ email: 'test@test.com', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('returns 409 when email is already registered', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    const res = await request(app).post('/api/auth/signup')
      .send({ email: 'taken@test.com', password: 'password123', name: 'Test' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Email already registered');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with tokens and user (no passwordHash) on valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', email: 'test@test.com', name: 'Test',
      passwordHash: '$2a$12$hashed', city: null, stylePersona: [],
    });
    prisma.refreshToken.create.mockResolvedValue({});

    const { default: bcrypt } = await import('bcryptjs');
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app).post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 401 on wrong password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', email: 'test@test.com', passwordHash: '$2a$12$hashed',
    });
    const { default: bcrypt } = await import('bcryptjs');
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app).post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'password123' });
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid email format', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'notanemail', password: 'password123' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/refresh', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when refreshToken is missing', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 on invalid or expired refresh token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/refresh')
      .send({ refreshToken: 'invalid-token' });
    expect(res.status).toBe(401);
  });

  it('returns 401 on expired token (past expiresAt)', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      token: 'expired-token',
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 1000),
      user: { id: 'user-1', email: 'test@test.com', name: 'Test' },
    });

    const res = await request(app).post('/api/auth/refresh')
      .send({ refreshToken: 'expired-token' });
    expect(res.status).toBe(401);
  });

  it('rotates tokens on valid refresh token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      token: 'valid-token',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 86400000),
      user: { id: 'user-1', email: 'test@test.com', name: 'Test' },
    });
    prisma.refreshToken.delete.mockResolvedValue({});
    prisma.refreshToken.create.mockResolvedValue({});

    const res = await request(app).post('/api/auth/refresh')
      .send({ refreshToken: 'valid-token' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.id).toBe('user-1');
  });
});

describe('POST /api/auth/logout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with a refresh token', async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({});

    const res = await request(app).post('/api/auth/logout')
      .send({ refreshToken: 'some-token' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out');
  });

  it('returns 200 even without a refresh token', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    expect(res.status).toBe(200);
  });
});
