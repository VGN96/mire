import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../config/db.js';

const router = Router();

router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id:true,email:true,name:true,city:true,stylePersona:true,occasions:true,
        budgetRange:true,skinTone:true,bust:true,waist:true,hip:true,
        height:true,shoulder:true,sleeveLength:true,ootdReminder:true,createdAt:true,
        _count: { select: { wardrobeItems:true,stitchBriefs:true,outfits:true } },
      },
    });
    res.json({ user });
  } catch (e) { next(e); }
});

router.patch('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const allowed = ['name','city','stylePersona','occasions','budgetRange',
                     'skinTone','bust','waist','hip','height','shoulder','sleeveLength','ootdReminder'];
    const data = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const user = await prisma.user.update({
      where: { id: req.user.id }, data,
      select: { id:true,name:true,city:true,stylePersona:true,occasions:true },
    });
    res.json({ user });
  } catch (e) { next(e); }
});

router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [wAgg, briefs, outfits, unread] = await Promise.all([
      prisma.wardrobeItem.aggregate({
        where: { userId: req.user.id, isActive: true },
        _count: { id: true }, _sum: { purchasePrice: true, wornCount: true },
      }),
      prisma.stitchBrief.count({ where: { userId: req.user.id } }),
      prisma.outfit.count({ where: { userId: req.user.id } }),
      prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
    ]);
    const total = wAgg._count.id, cost = wAgg._sum.purchasePrice || 0, worn = wAgg._sum.wornCount || 0;
    res.json({
      wardrobe: { total, totalCost: cost, costPerWear: worn > 0 ? Math.round(cost / worn) : 0 },
      briefs, outfits, unreadNotif: unread,
    });
  } catch (e) { next(e); }
});

export default router;
