import { Router } from 'express';
import { prisma }  from '../config/db.js';

const router  = Router();
const BASE    = 'https://image.pollinations.ai/prompt';

const STYLE_SUFFIX = {
  'fashion-sketch': 'elegant fashion croquis pencil sketch, tailor reference illustration',
  'watercolour':    'beautiful watercolour fashion illustration, soft artistic washes',
  'line-art':       'clean minimal line art fashion drawing, crisp technical lines',
  'technical':      'technical fashion flat drawing, garment specification sheet',
  'flat-view':      'technical fashion flat lay drawing, white background, front view',
  'annotated':      'annotated fashion technical illustration with measurement callouts A B C D',
  'detail':         'closeup detail fashion sketch, high detail, isolated on white background',
};

function buildUrl(prompt, style = 'fashion-sketch', w = 512, h = 680) {
  const sfx  = STYLE_SUFFIX[style] || STYLE_SUFFIX['fashion-sketch'];
  const full  = `${prompt}, ${sfx}, white background, professional, high quality`;
  const seed  = Math.floor(Math.random() * 99999);
  return `${BASE}/${encodeURIComponent(full)}?width=${w}&height=${h}&nologo=true&model=flux&seed=${seed}`;
}

// POST /api/sketch/generate
router.post('/generate', async (req, res, next) => {
  try {
    const { prompt, style = 'fashion-sketch', type = 'main', briefId, w = 512, h = 680 } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const imageUrl = buildUrl(prompt, style, w, h);

    if (briefId) {
      const upd = {};
      if (type === 'main')      upd.sketchUrls     = { push: imageUrl };
      if (type === 'flat')      upd.flatViewUrls   = { push: imageUrl };
      if (type === 'annotated') upd.annotatedSketchUrl = imageUrl;
      try { await prisma.stitchBrief.update({ where: { id: briefId, userId: req.user.id }, data: upd }); } catch {}
    }

    res.json({ imageUrl, prompt, style, type });
  } catch (e) { next(e); }
});

// POST /api/sketch/batch — generates main, flat, annotated, detail URLs
router.post('/batch', async (req, res, next) => {
  try {
    const { garmentPrompt, briefId } = req.body;
    if (!garmentPrompt) return res.status(400).json({ error: 'garmentPrompt required' });

    const sketches = {
      main:        buildUrl(garmentPrompt, 'fashion-sketch'),
      watercolour: buildUrl(garmentPrompt, 'watercolour'),
      flatFront:   buildUrl(garmentPrompt + ' front view', 'flat-view'),
      flatBack:    buildUrl(garmentPrompt + ' back view',  'flat-view'),
      annotated:   buildUrl(garmentPrompt + ' with labels', 'annotated'),
      details: {
        neck:       buildUrl(garmentPrompt + ' neckline closeup', 'detail', 300, 300),
        sleeve:     buildUrl(garmentPrompt + ' sleeve detail',    'detail', 300, 300),
        embroidery: buildUrl(garmentPrompt + ' embroidery detail','detail', 300, 300),
        hem:        buildUrl(garmentPrompt + ' hem detail',       'detail', 300, 300),
      },
    };

    if (briefId) {
      await prisma.stitchBrief.update({
        where: { id: briefId, userId: req.user.id },
        data: {
          sketchUrls: [sketches.main, sketches.watercolour],
          flatViewUrls: [sketches.flatFront, sketches.flatBack],
          annotatedSketchUrl: sketches.annotated,
        },
      }).catch(() => {});
    }

    res.json({ sketches });
  } catch (e) { next(e); }
});

export default router;
