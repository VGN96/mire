import { Router }  from 'express';
import multer       from 'multer';
import Anthropic    from '@anthropic-ai/sdk';
import { prisma }   from '../config/db.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10*1024*1024 } });

async function nextBriefNum() {
  const n = await prisma.stitchBrief.count();
  return `SS-${new Date().getFullYear()}-${String(n + 1).padStart(3, '0')}`;
}

// POST /api/stitch/analyse — AI image/text analysis
router.post('/analyse', upload.single('image'), async (req, res, next) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'sk-ant-...')
      return res.json({ analysis: { garmentType: req.body.description || 'Custom Garment', difficulty: 'moderate' }, imageUrl: null });

    let imageUrl = null;
    if (req.file) {
      try {
        const { cloudinaryUpload } = await import('../services/cloudinaryService.js');
        const r = await cloudinaryUpload(req.file.buffer, { folder: `mire/${req.user.id}/stitch`, transformation: [{ width: 1200, crop: 'limit' }, { quality: 'auto' }] });
        imageUrl = r.secure_url;
      } catch { /* Cloudinary not configured */ }
    }

    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const content = imageUrl
      ? [{ type: 'image', source: { type: 'url', url: imageUrl } }, { type: 'text', text: 'Analyse this garment and return JSON brief.' }]
      : `Analyse: ${req.body.description || 'Anarkali suit'}. Return JSON stitch brief.`;

    const resp = await ai.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 800,
      system: `You are a fashion AI. Analyse garments and return ONLY valid JSON (no markdown fences):
{"garmentType":"","styleNotes":[],"neckline":"","sleeveStyle":"","length":"","silhouette":"","primaryColor":"","fabric":[],"outerFabricMetres":0,"liningMetres":0,"embellishments":[],"closure":"","difficulty":"simple|moderate|skilled","constructionNotes":"","aiStyleNote":""}`,
      messages: [{ role: 'user', content }],
    });

    let analysis = {};
    try { analysis = JSON.parse(resp.content[0].text.replace(/```json|```/g, '')); }
    catch { analysis = { garmentType: req.body.description || 'Garment', difficulty: 'moderate' }; }
    res.json({ analysis, imageUrl });
  } catch (e) { next(e); }
});

// CRUD for briefs
router.post('/briefs', async (req, res, next) => {
  try {
    const u = req.user;
    const brief = await prisma.stitchBrief.create({ data: {
      userId: u.id, briefNumber: await nextBriefNum(),
      title: req.body.title || req.body.garmentType || 'Untitled Brief',
      bust: u.bust, waist: u.waist, hip: u.hip, shoulder: u.shoulder, sleeve: u.sleeveLength,
      ...req.body,
    }});
    res.status(201).json({ brief });
  } catch (e) { next(e); }
});

router.get('/briefs', async (req, res, next) => {
  try { res.json({ briefs: await prisma.stitchBrief.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } }) }); }
  catch (e) { next(e); }
});

router.get('/briefs/:id', async (req, res, next) => {
  try {
    const b = await prisma.stitchBrief.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    b ? res.json({ brief: b }) : res.status(404).json({ error: 'Not found' });
  } catch (e) { next(e); }
});

router.put('/briefs/:id', async (req, res, next) => {
  try {
    const b = await prisma.stitchBrief.update({ where: { id: req.params.id }, data: { ...req.body, updatedAt: new Date() } });
    res.json({ brief: b });
  } catch (e) { next(e); }
});

router.patch('/briefs/:id/ready', async (req, res, next) => {
  try {
    const b = await prisma.stitchBrief.update({ where: { id: req.params.id }, data: { status: 'ready' } });
    res.json({ brief: b });
  } catch (e) { next(e); }
});

router.delete('/briefs/:id', async (req, res, next) => {
  try { await prisma.stitchBrief.delete({ where: { id: req.params.id } }); res.json({ message: 'Deleted' }); }
  catch (e) { next(e); }
});

export default router;
