import { prisma } from '../config/db.js';
import { cloudinaryUpload } from '../services/cloudinaryService.js';
import { createAnthropicClient, excerptAnthropicText } from '../infrastructure/anthropicService.js';

async function nextBriefNumber() {
  const count = await prisma.stitchBrief.count();
  return `SS-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
}

export async function analyseStitchImage(userId: string, description: string | undefined, file?: Express.Multer.File) {
  let imageUrl: string | null = null;
  if (file) {
    try {
      const result = await cloudinaryUpload(file.buffer, {
        folder: `mire/${userId}/stitch`,
        transformation: [{ width: 1200, crop: 'limit' }, { quality: 'auto' }],
      });
      imageUrl = result.secure_url;
    } catch {
      imageUrl = null;
    }
  }

  const anthropic = createAnthropicClient();
  if (!anthropic) {
    return { analysis: { garmentType: description || 'Custom Garment', difficulty: 'moderate' }, imageUrl };
  }

  const content = (imageUrl
    ? [{ type: 'image', source: { type: 'url', url: imageUrl } }, { type: 'text', text: 'Analyse this garment and return JSON brief.' }]
    : `Analyse: ${description || 'Anarkali suit'}. Return JSON stitch brief.`) as Anthropic.MessageParam['content'];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 800,
    system: `You are a fashion AI. Analyse garments and return ONLY valid JSON (no markdown fences):
{"garmentType":"","styleNotes":[],"neckline":"","sleeveStyle":"","length":"","silhouette":"","primaryColor":"","fabric":[],"outerFabricMetres":0,"liningMetres":0,"embellishments":[],"closure":"","difficulty":"simple|moderate|skilled","constructionNotes":"","aiStyleNote":""}`,
    messages: [{ role: 'user', content }],
  });

  let analysis: Record<string, unknown> = {};
  try { analysis = JSON.parse(excerptAnthropicText(response).replace(/```json|```/g, '')); } catch { analysis = { garmentType: description || 'Garment', difficulty: 'moderate' }; }
  return { analysis, imageUrl };
}

export async function createStitchBrief(userId: string, input: Record<string, unknown>) {
  const data: Record<string, unknown> = {
    userId,
    briefNumber: await nextBriefNumber(),
    title: input.title || input.garmentType || 'Untitled Brief',
    bust: input.bust,
    waist: input.waist,
    hip: input.hip,
    shoulder: input.shoulder,
    sleeve: input.sleeve,
    sleeveLength: input.sleeveLength,
    ...input,
  };
  return prisma.stitchBrief.create({ data });
}

export async function listStitchBriefs(userId: string) {
  return prisma.stitchBrief.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
}

export async function getStitchBrief(userId: string, id: string) {
  return prisma.stitchBrief.findFirst({ where: { id, userId } });
}

export async function updateStitchBrief(userId: string, id: string, input: Record<string, unknown>) {
  return prisma.stitchBrief.update({ where: { id }, data: { ...input, updatedAt: new Date() } });
}

export async function setStitchBriefReady(userId: string, id: string) {
  return prisma.stitchBrief.update({ where: { id }, data: { status: 'ready' } });
}

export async function deleteStitchBrief(userId: string, id: string) {
  await prisma.stitchBrief.delete({ where: { id } });
  return { message: 'Deleted' };
}
