import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../config/db.js';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const outfits = await prisma.outfit.findMany({
      where: { userId: req.user.id }, orderBy: { createdAt: 'desc' },
      include: { items: { include: { wardrobeItem: { select: { id:true,name:true,imageUrl:true,color:true,category:true } } } } },
    });
    res.json({ outfits });
  } catch (e) { next(e); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, occasion, itemIds = [], isAiGenerated } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const outfit = await prisma.outfit.create({
      data: {
        userId: req.user.id, name, occasion, isAiGenerated: !!isAiGenerated,
        items: { create: itemIds.map((id: string, i: number) => ({ wardrobeItemId: id, position: i + 1 })) },
      },
      include: { items: { include: { wardrobeItem: true } } },
    });
    res.status(201).json({ outfit });
  } catch (e) { next(e); }
});

router.patch('/:id/worn', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const outfit = await prisma.outfit.update({
      where: { id: req.params.id, userId: req.user.id },
      data: { wornCount: { increment: 1 }, lastWornAt: new Date() },
    });
    const ois = await prisma.outfitItem.findMany({ where: { outfitId: req.params.id } });
    await Promise.all(ois.map((i) => prisma.wardrobeItem.update({
      where: { id: i.wardrobeItemId }, data: { wornCount: { increment: 1 }, lastWornAt: new Date() },
    })));
    res.json({ outfit });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.outfit.delete({ where: { id: req.params.id, userId: req.user.id } });
    res.json({ message: 'Deleted' });
  } catch (e) { next(e); }
});

export default router;
