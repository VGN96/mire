import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../config/db.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8*1024*1024 } });

async function uploadImg(buffer, userId) {
  if (!process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME === 'your_cloud')
    return { url: null, publicId: null };
  const { cloudinaryUpload } = await import('../services/cloudinaryService.js');
  const r = await cloudinaryUpload(buffer, {
    folder: `mire/${userId}/wardrobe`,
    transformation: [{ width: 800, crop: 'limit' }, { quality: 'auto:good' }],
  });
  return { url: r.secure_url, publicId: r.public_id };
}

function ecoScore(items) {
  const avg = items.reduce((s, i) => s + i.wornCount, 0) / Math.max(items.length, 1);
  return avg > 15 ? 'A+' : avg > 10 ? 'A' : avg > 6 ? 'B+' : avg > 3 ? 'B' : 'C';
}

function parseArr(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return [val]; }
}

router.get('/', async (req, res, next) => {
  try {
    const { category, search, sort = 'newest' } = req.query;
    const where = {
      userId: req.user.id, isActive: true,
      ...(category && category !== 'all' && { category }),
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    };
    const orderBy = sort === 'mostWorn' ? { wornCount: 'desc' } : sort === 'name' ? { name: 'asc' } : { createdAt: 'desc' };
    const items = await prisma.wardrobeItem.findMany({ where, orderBy });
    const totalCost = items.reduce((s, i) => s + (i.purchasePrice || 0), 0);
    const totalWorn = items.reduce((s, i) => s + i.wornCount, 0);
    res.json({ items, stats: {
      total: items.length,
      unworn: items.filter(i => i.wornCount === 0).length,
      costPerWear: totalWorn > 0 ? Math.round(totalCost / totalWorn) : 0,
      totalCost, ecoScore: ecoScore(items),
    }});
  } catch (e) { next(e); }
});

router.post('/', upload.single('image'), async (req, res, next) => {
  try {
    const { name, category, color, fabric, season, occasions, brand, purchasePrice } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'name and category required' });
    let imageUrl = null, imagePublicId = null;
    if (req.file) {
      const r = await uploadImg(req.file.buffer, req.user.id).catch(() => ({ url: null, publicId: null }));
      imageUrl = r.url; imagePublicId = r.publicId;
    }
    const item = await prisma.wardrobeItem.create({ data: {
      userId: req.user.id, name, category,
      color: color || null, fabric: fabric || null,
      season: parseArr(season), occasions: parseArr(occasions),
      brand: brand || null,
      purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
      imageUrl, imagePublicId,
    }});
    res.status(201).json({ item });
  } catch (e) { next(e); }
});

router.get('/meta/insights', async (req, res, next) => {
  try {
    const items = await prisma.wardrobeItem.findMany({ where: { userId: req.user.id, isActive: true } });
    const cats  = items.reduce((a, i) => { a[i.category] = (a[i.category] || 0) + 1; return a; }, {});
    res.json({
      summary: {
        total: items.length,
        unworn: items.filter(i => i.wornCount === 0).length,
        totalCost: items.reduce((s, i) => s + (i.purchasePrice || 0), 0),
        ecoScore: ecoScore(items),
      },
      mostWorn: [...items].sort((a, b) => b.wornCount - a.wornCount).slice(0, 5),
      unworn: items.filter(i => i.wornCount === 0).slice(0, 8),
      categoryDistribution: cats,
    });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const item = await prisma.wardrobeItem.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ item });
  } catch (e) { next(e); }
});

router.put('/:id', upload.single('image'), async (req, res, next) => {
  try {
    const ex = await prisma.wardrobeItem.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!ex) return res.status(404).json({ error: 'Not found' });
    let imageUrl = ex.imageUrl, imagePublicId = ex.imagePublicId;
    if (req.file) {
      const r = await uploadImg(req.file.buffer, req.user.id).catch(() => ({ url: ex.imageUrl, publicId: ex.imagePublicId }));
      imageUrl = r.url; imagePublicId = r.publicId;
    }
    const { name, color, fabric, season, occasions, brand, purchasePrice } = req.body;
    const item = await prisma.wardrobeItem.update({ where: { id: req.params.id }, data: {
      ...(name && { name }), ...(color && { color }), ...(fabric && { fabric }),
      ...(brand && { brand }), ...(season && { season: parseArr(season) }),
      ...(occasions && { occasions: parseArr(occasions) }),
      ...(purchasePrice && { purchasePrice: parseFloat(purchasePrice) }),
      imageUrl, imagePublicId,
    }});
    res.json({ item });
  } catch (e) { next(e); }
});

router.patch('/:id/worn', async (req, res, next) => {
  try {
    const item = await prisma.wardrobeItem.update({
      where: { id: req.params.id, userId: req.user.id },
      data: { wornCount: { increment: 1 }, lastWornAt: new Date() },
    });
    res.json({ item });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.wardrobeItem.update({ where: { id: req.params.id, userId: req.user.id }, data: { isActive: false } });
    res.json({ message: 'Removed' });
  } catch (e) { next(e); }
});

export default router;
