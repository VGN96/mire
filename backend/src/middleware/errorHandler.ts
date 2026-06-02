import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
}

export function errorHandler(err: HttpError, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.flatten() });
  }

  const status = err.status || err.statusCode || 500;
  console.error(`[${status}] ${req.method} ${req.path} — ${err.message}`);
  if (err.code === 'P2002') return res.status(409).json({ error: 'Already exists' });
  if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV === 'development' && { detail: err.message }),
  });
}
