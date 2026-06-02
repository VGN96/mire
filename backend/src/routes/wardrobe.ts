import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../config/db.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

type AuthenticatedRequest = Request & {
  user: { id: string };
};

function authHandler(handler: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => handler(req as AuthenticatedRequest, res, next);
}

const wardrobeQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(['newest', 'mostWorn', 'name']).optional().default('newest'),
});

const parseArrayField = (value: unknown): string[] => {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [trimmed];
    } catch {
      return [trimmed];
    }
  }
  return [];
};

const purchasePriceSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (typeof value === 'number') return value;
  return null;
}, z.number().nullable());

const wardrobeCreateSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  color: z.string().optional().nullable().transform((value) => {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    return null;
  }),
  fabric: z.string().optional().nullable().transform((value) => {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    return null;
  }),
  season: z.preprocess(parseArrayField, z.array(z.string())).optional().default([]),
  occasions: z.preprocess(parseArrayField, z.array(z.string())).optional().default([]),
  brand: z.string().optional().nullable().transform((value) => {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    return null;
  }),
  purchasePrice: purchasePriceSchema.optional().default(null),
});

const wardrobeUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  color: z.string().optional().nullable().transform((value) => {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    return null;
  }),
  fabric: z.string().optional().nullable().transform((value) => {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    return null;
  }),
  season: z.preprocess(parseArrayField, z.array(z.string())).optional(),
  occasions: z.preprocess(parseArrayField, z.array(z.string())).optional(),
  brand: z.string().optional().nullable().transform((value) => {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    return null;
  }),
  purchasePrice: purchasePriceSchema.optional(),
});

function ecoScore(items: Array<{ wornCount: number }>) {
  const avg = items.reduce((sum, item) => sum + item.wornCount, 0) / Math.max(items.length, 1);
  return avg > 15 ? 'A+' : avg > 10 ? 'A' : avg > 6 ? 'B+' : avg > 3 ? 'B' : 'C';
}

async function uploadImg(buffer: Buffer, userId: string) {
  if (!process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME === 'your_cloud') {
    return { url: null, publicId: null };
  }

  const { cloudinaryUpload } = await import('../services/cloudinaryService.js');
  const result = await cloudinaryUpload(buffer, {
    folder: `mire/${userId}/wardrobe`,
    transformation: [{ width: 800, crop: 'limit' }, { quality: 'auto:good' }],
  });
  return { url: result.secure_url, publicId: result.public_id };
}

router.get('/', authHandler(async (req, res, next) => {
  try {
    const query = wardrobeQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {
      userId: req.user.id,
      isActive: true,
      ...(query.category && query.category !== 'all' ? { category: query.category } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const orderBy = query.sort === 'mostWorn'
      ? { wornCount: 'desc' as const }
      : query.sort === 'name'
        ? { name: 'asc' as const }
        : { createdAt: 'desc' as const };

    const items = await prisma.wardrobeItem.findMany({ where, orderBy });
    const totalCost = items.reduce((sum: number, item: { purchasePrice: number | null }) => sum + (item.purchasePrice ?? 0), 0);
    const totalWorn = items.reduce((sum: number, item: { wornCount: number }) => sum + item.wornCount, 0);

    res.json({
      items,
      stats: {
        total: items.length,
        unworn: items.filter((item: { wornCount: number }) => item.wornCount === 0).length,
        costPerWear: totalWorn > 0 ? Math.round(totalCost / totalWorn) : 0,
        totalCost,
        ecoScore: ecoScore(items),
      },
    });
  } catch (error) {
    next(error);
  }
}));

router.post('/', upload.single('image'), authHandler(async (req, res, next) => {
  try {
    const payload = wardrobeCreateSchema.parse(req.body);
    let imageUrl: string | null = null;
    let imagePublicId: string | null = null;

    if (req.file) {
      const uploaded = await uploadImg(req.file.buffer, req.user.id).catch(() => ({ url: null, publicId: null }));
      imageUrl = uploaded.url;
      imagePublicId = uploaded.publicId;
    }

    const item = await prisma.wardrobeItem.create({
      data: {
        userId: req.user.id,
        name: payload.name,
        category: payload.category,
        color: payload.color,
        fabric: payload.fabric,
        season: payload.season,
        occasions: payload.occasions,
        brand: payload.brand,
        purchasePrice: payload.purchasePrice,
        imageUrl,
        imagePublicId,
      },
    });

    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
}));

router.get('/meta/insights', authHandler(async (req, res, next) => {
  try {
    const items = await prisma.wardrobeItem.findMany({ where: { userId: req.user.id, isActive: true } });
    const categories = items.reduce((acc: Record<string, number>, item: { category: string }) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      summary: {
        total: items.length,
        unworn: items.filter((item: { wornCount: number }) => item.wornCount === 0).length,
        totalCost: items.reduce((sum: number, item: { purchasePrice: number | null }) => sum + (item.purchasePrice ?? 0), 0),
        ecoScore: ecoScore(items),
      },
      mostWorn: [...items].sort((a, b) => b.wornCount - a.wornCount).slice(0, 5),
      unworn: items.filter((item: { wornCount: number }) => item.wornCount === 0).slice(0, 8),
      categoryDistribution: categories,
    });
  } catch (error) {
    next(error);
  }
}));

router.get('/:id', authHandler(async (req, res, next) => {
  try {
    const item = await prisma.wardrobeItem.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ item });
  } catch (error) {
    next(error);
  }
}));

router.put('/:id', upload.single('image'), authHandler(async (req, res, next) => {
  try {
    const existing = await prisma.wardrobeItem.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const payload = wardrobeUpdateSchema.parse(req.body);
    let imageUrl = existing.imageUrl;
    let imagePublicId = existing.imagePublicId;

    if (req.file) {
      const uploaded = await uploadImg(req.file.buffer, req.user.id).catch(() => ({ url: existing.imageUrl, publicId: existing.imagePublicId }));
      imageUrl = uploaded.url;
      imagePublicId = uploaded.publicId;
    }

    const item = await prisma.wardrobeItem.update({
      where: { id: req.params.id },
      data: {
        ...(payload.name ? { name: payload.name } : {}),
        ...(payload.category ? { category: payload.category } : {}),
        ...(payload.color !== undefined ? { color: payload.color } : {}),
        ...(payload.fabric !== undefined ? { fabric: payload.fabric } : {}),
        ...(payload.brand !== undefined ? { brand: payload.brand } : {}),
        ...(payload.season ? { season: payload.season } : {}),
        ...(payload.occasions ? { occasions: payload.occasions } : {}),
        ...(payload.purchasePrice !== undefined ? { purchasePrice: payload.purchasePrice } : {}),
        imageUrl,
        imagePublicId,
      },
    });

    res.json({ item });
  } catch (error) {
    next(error);
  }
}));

router.patch('/:id/worn', authHandler(async (req, res, next) => {
  try {
    const existing = await prisma.wardrobeItem.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const item = await prisma.wardrobeItem.update({
      where: { id: req.params.id },
      data: { wornCount: { increment: 1 }, lastWornAt: new Date() },
    });

    res.json({ item });
  } catch (error) {
    next(error);
  }
}));

router.delete('/:id', authHandler(async (req, res, next) => {
  try {
    const existing = await prisma.wardrobeItem.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await prisma.wardrobeItem.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: 'Removed' });
  } catch (error) {
    next(error);
  }
}));

export default router;
