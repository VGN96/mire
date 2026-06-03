import { Router, type Request, type Response, type NextFunction } from 'express';
import { fetchSketchImage, generateSketch, generateSketchBatch } from '../usecases/sketch.js';

const router = Router();

router.get('/proxy', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' });

    const upstream = decodeURIComponent(url);
    const resp = await fetchSketchImage(upstream);
    res.setHeader('Content-Type', String(resp.headers['content-type'] || 'image/png'));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return resp.data.pipe(res);
  } catch (error) {
    next(error);
  }
});

router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prompt, style = 'fashion-sketch', type = 'main', briefId, w = 512, h = 680 } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const result = await generateSketch(prompt, style, type, briefId, Number(w), Number(h), req.user?.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { garmentPrompt, briefId } = req.body;
    if (!garmentPrompt) return res.status(400).json({ error: 'garmentPrompt required' });

    const result = await generateSketchBatch(garmentPrompt, briefId, req.user?.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
