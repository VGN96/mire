import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db.js';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer '))
      return res.status(401).json({ error: 'No token', code: 'NO_TOKEN' });

    const token = h.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id:true,email:true,name:true,city:true,stylePersona:true,
                bust:true,waist:true,hip:true,shoulder:true,sleeveLength:true },
    });
    if (!user) return res.status(401).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    req.user = user;
    next();
  } catch (e) {
    if (e instanceof Error && e.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }
}
