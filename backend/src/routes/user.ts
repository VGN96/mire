import { Router, type Request, type Response, type NextFunction } from 'express';
import { getUserDashboard, getUserProfile, updateUserProfile } from '../usecases/user.js';

const router = Router();

router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await getUserProfile(req.user.id);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.patch('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await updateUserProfile(req.user.id, req.body);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dashboard = await getUserDashboard(req.user.id);
    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

export default router;
