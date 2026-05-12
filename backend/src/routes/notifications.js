import { Router } from 'express';
import { prisma }  from '../config/db.js';
const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const n = await prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 40 });
    res.json({ notifications: n, unreadCount: n.filter(x => !x.isRead).length });
  } catch (e) { next(e); }
});

router.patch('/all/read', async (req, res, next) => {
  try { await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } }); res.json({ ok: true }); }
  catch (e) { next(e); }
});

router.patch('/:id/read', async (req, res, next) => {
  try { await prisma.notification.update({ where: { id: req.params.id, userId: req.user.id }, data: { isRead: true } }); res.json({ ok: true }); }
  catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await prisma.notification.delete({ where: { id: req.params.id, userId: req.user.id } }); res.json({ message: 'Deleted' }); }
  catch (e) { next(e); }
});

export default router;
