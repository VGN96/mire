import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { body, validationResult } from 'express-validator';
import { prisma } from '../config/db.js';

const router = Router();

function makeAccess(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}
function saveRefresh(token, userId) {
  return prisma.refreshToken.create({
    data: { token, userId, expiresAt: new Date(Date.now() + 30*24*60*60*1000) },
  });
}

// POST /api/auth/signup
router.post('/signup', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().notEmpty(),
], async (req, res, next) => {
  try {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

    const { email, password, name, city, stylePersona = [], occasions = [] } = req.body;
    if (await prisma.user.findUnique({ where: { email } }))
      return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name, city: city || null, stylePersona, occasions },
      select: { id:true, email:true, name:true, city:true, stylePersona:true, createdAt:true },
    });

    const accessToken  = makeAccess(user.id);
    const refreshToken = uuid();
    await saveRefresh(refreshToken, user.id);
    res.status(201).json({ user, accessToken, refreshToken });
  } catch (e) { next(e); }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res, next) => {
  try {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: 'Invalid email or password' });

    const accessToken  = makeAccess(user.id);
    const refreshToken = uuid();
    await saveRefresh(refreshToken, user.id);
    const { passwordHash, ...safe } = user;
    res.json({ user: safe, accessToken, refreshToken });
  } catch (e) { next(e); }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { select: { id:true, email:true, name:true } } },
    });
    if (!stored || stored.expiresAt < new Date())
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    await prisma.refreshToken.delete({ where: { token: refreshToken } });
    const newAccess  = makeAccess(stored.userId);
    const newRefresh = uuid();
    await saveRefresh(newRefresh, stored.userId);
    res.json({ accessToken: newAccess, refreshToken: newRefresh, user: stored.user });
  } catch (e) { next(e); }
});

// POST /api/auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    res.json({ message: 'Logged out' });
  } catch (e) { next(e); }
});

export default router;
