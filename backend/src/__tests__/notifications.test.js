import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import notificationRoutes from '../routes/notifications.js';
import { authenticate } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';

vi.mock('../config/db.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    notification: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
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
app.use('/api/notifications', authenticate, notificationRoutes);
app.use(errorHandler);

function authHeader() {
  const token = jwt.sign({ userId: testUser.id }, process.env.JWT_SECRET);
  prisma.user.findUnique.mockResolvedValue(testUser);
  return `Bearer ${token}`;
}

beforeEach(() => vi.clearAllMocks());

// ─── GET /api/notifications ───────────────────────────────────────────────────

describe('GET /api/notifications', () => {
  it('returns notifications list with correct unreadCount', async () => {
    prisma.notification.findMany.mockResolvedValue([
      { id: 'n-1', message: 'Your OOTD is ready!', isRead: false, createdAt: new Date() },
      { id: 'n-2', message: 'New style tip',        isRead: true,  createdAt: new Date() },
      { id: 'n-3', message: 'Weather update',       isRead: false, createdAt: new Date() },
    ]);

    const res = await request(app).get('/api/notifications')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(3);
    expect(res.body.unreadCount).toBe(2);
  });

  it('returns empty list with zero unreadCount when no notifications', async () => {
    prisma.notification.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/notifications')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(0);
    expect(res.body.unreadCount).toBe(0);
  });

  it('returns unreadCount of 0 when all notifications are read', async () => {
    prisma.notification.findMany.mockResolvedValue([
      { id: 'n-1', message: 'Old tip', isRead: true, createdAt: new Date() },
      { id: 'n-2', message: 'Old news', isRead: true, createdAt: new Date() },
    ]);

    const res = await request(app).get('/api/notifications')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(0);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /api/notifications/:id/read ───────────────────────────────────────

describe('PATCH /api/notifications/:id/read', () => {
  it('marks a single notification as read', async () => {
    prisma.notification.update.mockResolvedValue({ id: 'n-1', isRead: true });

    const res = await request(app).patch('/api/notifications/n-1/read')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n-1', userId: 'user-1' },
        data: { isRead: true },
      })
    );
  });
});

// ─── PATCH /api/notifications/all/read ───────────────────────────────────────

describe('PATCH /api/notifications/all/read', () => {
  it('marks all unread notifications as read', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });

    const res = await request(app).patch('/api/notifications/all/read')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', isRead: false },
        data: { isRead: true },
      })
    );
  });

  it('returns ok:true even when there are no unread notifications', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app).patch('/api/notifications/all/read')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─── DELETE /api/notifications/:id ───────────────────────────────────────────

describe('DELETE /api/notifications/:id', () => {
  it('deletes the notification and returns message', async () => {
    prisma.notification.delete.mockResolvedValue({});

    const res = await request(app).delete('/api/notifications/n-1')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Deleted');
    expect(prisma.notification.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'n-1', userId: 'user-1' } })
    );
  });
});
