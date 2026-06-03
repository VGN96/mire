import { Router, type Request, type Response, type NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { loginUser, logoutUser, refreshAuthToken, signupUser } from '../usecases/auth.js';

const router = Router();

router.post('/signup', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().notEmpty(),
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

    const { email, password, name, city, stylePersona = [], occasions = [] } = req.body;
    const result = await signupUser({ email, password, name, city, stylePersona, occasions });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Email already registered') {
      return res.status(409).json({ error: error.message });
    }
    next(error);
  }
});

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

    const { email, password } = req.body;
    const result = await loginUser({ email, password });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
    const result = await refreshAuthToken(refreshToken);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid or expired refresh token') {
      return res.status(401).json({ error: error.message });
    }
    next(error);
  }
});

router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    const result = await logoutUser(refreshToken);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
