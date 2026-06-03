import { prisma } from '../config/db.js';

const BASE = 'https://image.pollinations.ai/prompt';

const STYLE_SUFFIX: Record<string, string> = {
  'fashion-sketch': 'elegant fashion croquis pencil sketch, tailor reference illustration',
  'watercolour': 'beautiful watercolour fashion illustration, soft artistic washes',
  'line-art': 'clean minimal line art fashion drawing, crisp technical lines',
  'technical': 'technical fashion flat drawing, garment specification sheet',
  'flat-view': 'technical fashion flat lay drawing, white background, front view',
  'annotated': 'annotated fashion technical illustration with measurement callouts A B C D',
  'detail': 'closeup detail fashion sketch, high detail, isolated on white background',
};

function buildUrl(prompt: string, style = 'fashion-sketch', w = 512, h = 680) {
  const suffix = STYLE_SUFFIX[style] || STYLE_SUFFIX['fashion-sketch'];
  const full = `${prompt}, ${suffix}, white background, professional, high quality`;
  const seed = Math.floor(Math.random() * 99999);
  return `${BASE}/${encodeURIComponent(full)}?width=${w}&height=${h}&nologo=true&model=flux&seed=${seed}`;
}

export function sketchProxyUrl(url: string) {
  return `/api/sketch/proxy?url=${encodeURIComponent(url)}`;
}

export async function fetchSketchImage(url: string) {
  const { default: axios } = await import('axios');
  return axios.get(url, { responseType: 'stream', timeout: 90000 });
}

export async function generateSketch(prompt: string, style = 'fashion-sketch', type = 'main', briefId?: string, width = 512, height = 680, userId?: string) {
  const imageUrl = sketchProxyUrl(buildUrl(prompt, style, width, height));
  if (briefId && userId) {
    const update: Record<string, unknown> = {};
    if (type === 'main') update.sketchUrls = { push: imageUrl };
    if (type === 'flat') update.flatViewUrls = { push: imageUrl };
    if (type === 'annotated') update.annotatedSketchUrl = imageUrl;
    await prisma.stitchBrief.update({ where: { id: briefId, userId }, data: update }).catch(() => {});
  }
  return { imageUrl, prompt, style, type };
}

export async function generateSketchBatch(garmentPrompt: string, briefId?: string, userId?: string) {
  const proxy = (url: string) => sketchProxyUrl(url);
  const sketches = {
    main: proxy(buildUrl(garmentPrompt, 'fashion-sketch')),
    watercolour: proxy(buildUrl(garmentPrompt, 'watercolour')),
    flatFront: proxy(buildUrl(garmentPrompt + ' front view', 'flat-view')),
    flatBack: proxy(buildUrl(garmentPrompt + ' back view', 'flat-view')),
    annotated: proxy(buildUrl(garmentPrompt + ' with labels', 'annotated')),
    details: {
      neck: proxy(buildUrl(garmentPrompt + ' neckline closeup', 'detail', 300, 300)),
      sleeve: proxy(buildUrl(garmentPrompt + ' sleeve detail', 'detail', 300, 300)),
      embroidery: proxy(buildUrl(garmentPrompt + ' embroidery detail', 'detail', 300, 300)),
      hem: proxy(buildUrl(garmentPrompt + ' hem detail', 'detail', 300, 300)),
    },
  };

  if (briefId && userId) {
    await prisma.stitchBrief.update({
      where: { id: briefId, userId },
      data: {
        sketchUrls: [sketches.main, sketches.watercolour],
        flatViewUrls: [sketches.flatFront, sketches.flatBack],
        annotatedSketchUrl: sketches.annotated,
      },
    }).catch(() => {});
  }

  return { sketches };
}
