import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { prisma } from '../config/db.js';

function makeAccessToken(userId: string) {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];
  return jwt.sign({ userId }, process.env.JWT_SECRET as string, { expiresIn });
}

async function saveRefreshToken(token: string, userId: string) {
  return prisma.refreshToken.create({
    data: { token, userId, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  });
}

export async function signupUser(input: {
  email: string;
  password: string;
  name: string;
  city?: string;
  stylePersona?: string[];
  occasions?: string[];
}) {
  const { email, password, name, city, stylePersona = [], occasions = [] } = input;
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new Error('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, city: city || null, stylePersona, occasions },
    select: { id: true, email: true, name: true, city: true, stylePersona: true, createdAt: true },
  });

  const accessToken = makeAccessToken(user.id);
  const refreshToken = uuid();
  await saveRefreshToken(refreshToken, user.id);

  return { user, accessToken, refreshToken };
}

export async function loginUser(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new Error('Invalid email or password');

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new Error('Invalid email or password');

  const accessToken = makeAccessToken(user.id);
  const refreshToken = uuid();
  await saveRefreshToken(refreshToken, user.id);
  const { passwordHash, ...safe } = user;

  return { user: safe, accessToken, refreshToken };
}

export async function refreshAuthToken(refreshToken: string) {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!stored || stored.expiresAt < new Date()) {
    throw new Error('Invalid or expired refresh token');
  }
  await prisma.refreshToken.delete({ where: { token: refreshToken } });
  const newAccessToken = makeAccessToken(stored.userId);
  const newRefreshToken = uuid();
  await saveRefreshToken(newRefreshToken, stored.userId);
  return { accessToken: newAccessToken, refreshToken: newRefreshToken, user: stored.user };
}

export async function logoutUser(refreshToken?: string) {
  if (refreshToken) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }
  return { message: 'Logged out' };
}
