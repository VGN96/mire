import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { wardrobeCreateSchema, wardrobeUpdateSchema, createWardrobeItem, deleteWardrobeItem, getWardrobeInsights, getWardrobeItem, listWardrobe, markWardrobeItemWorn, updateWardrobeItem } from '../usecases/wardrobe.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

type AuthenticatedRequest = Request & { user: { id: string } };

function authHandler(handler: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => handler(req as AuthenticatedRequest, res, next);
}

const wardrobeQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(['newest', 'mostWorn', 'name']).optional().default('newest'),
});

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
    const query = wardrobeQuerySchema.parse({
      category: req.query.category,
      search: req.query.search,
      sort: req.query.sort,
    });
    const data = await listWardrobe(req.user.id, query);
    res.json(data);
  } catch (error) {
    next(error);
  }
}));

router.post('/', upload.single('image'), authHandler(async (req, res, next) => {
  try {
    const payload = wardrobeCreateSchema.parse(req.body);
    const image = req.file ? await uploadImg(req.file.buffer, req.user.id).catch(() => ({ url: null, publicId: null })) : undefined;
    const item = await createWardrobeItem(req.user.id, payload, image);
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
}));

router.get('/meta/insights', authHandler(async (req, res, next) => {
  try {
    const insights = await getWardrobeInsights(req.user.id);
    res.json(insights);
  } catch (error) {
    next(error);
  }
}));

router.get('/:id', authHandler(async (req, res, next) => {
  try {
    const item = await getWardrobeItem(req.user.id, req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ item });
  } catch (error) {
    next(error);
  }
}));

router.put('/:id', upload.single('image'), authHandler(async (req, res, next) => {
  try {
    const payload = wardrobeUpdateSchema.parse(req.body);
    const image = req.file ? await uploadImg(req.file.buffer, req.user.id).catch(() => undefined) : undefined;
    const item = await updateWardrobeItem(req.user.id, req.params.id, payload, image);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ item });
  } catch (error) {
    next(error);
  }
}));

router.patch('/:id/worn', authHandler(async (req, res, next) => {
  try {
    const item = await markWardrobeItemWorn(req.user.id, req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ item });
  } catch (error) {
    next(error);
  }
}));

router.delete('/:id', authHandler(async (req, res, next) => {
  try {
    const item = await deleteWardrobeItem(req.user.id, req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Removed' });
  } catch (error) {
    next(error);
  }
}));

export default router;
