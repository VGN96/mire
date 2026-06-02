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

// GET /api/sketch/proxy — fetches Pollinations image server-side to avoid CORB + 500s
router.get('/proxy', async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url required' });

    const { default: axios } = await import('axios');
    const upstream = decodeURIComponent(url);

    // Retry up to 3 times — Pollinations flux model is async and may 500 on first hit
    let lastErr;
    for (let i = 0; i < 3; i++) {
      try {
        const resp = await axios.get(upstream, { responseType: 'stream', timeout: 90000 });
        res.setHeader('Content-Type', resp.headers['content-type'] || 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return resp.data.pipe(res);
      } catch (e) {
        lastErr = e;
        if (i < 2) await new Promise(r => setTimeout(r, 8000));
      }
    }
    next(lastErr);
  } catch (e) { next(e); }
});

// POST /api/sketch/generate
router.post('/generate', async (req, res, next) => {
  try {
    const { prompt, style = 'fashion-sketch', type = 'main', briefId, w = 512, h = 680 } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const pollinationsUrl = buildUrl(prompt, style, w, h);
    const imageUrl = `/api/sketch/proxy?url=${encodeURIComponent(pollinationsUrl)}`;

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

    const proxy = url => `/api/sketch/proxy?url=${encodeURIComponent(url)}`;

    const sketches = {
      main:        proxy(buildUrl(garmentPrompt, 'fashion-sketch')),
      watercolour: proxy(buildUrl(garmentPrompt, 'watercolour')),
      flatFront:   proxy(buildUrl(garmentPrompt + ' front view', 'flat-view')),
      flatBack:    proxy(buildUrl(garmentPrompt + ' back view',  'flat-view')),
      annotated:   proxy(buildUrl(garmentPrompt + ' with labels', 'annotated')),
      details: {
        neck:       proxy(buildUrl(garmentPrompt + ' neckline closeup', 'detail', 300, 300)),
        sleeve:     proxy(buildUrl(garmentPrompt + ' sleeve detail',    'detail', 300, 300)),
        embroidery: proxy(buildUrl(garmentPrompt + ' embroidery detail','detail', 300, 300)),
        hem:        proxy(buildUrl(garmentPrompt + ' hem detail',       'detail', 300, 300)),
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
