import { Router, type Request, type Response, type NextFunction } from 'express';
import { deleteNotification, listNotifications, markAllNotificationsRead, markNotificationRead } from '../usecases/notification.js';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await listNotifications(req.user.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch('/all/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await markAllNotificationsRead(req.user.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await markNotificationRead(req.user.id, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await deleteNotification(req.user.id, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
