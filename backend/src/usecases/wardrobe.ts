import { prisma } from '../config/db.js';
import { z } from 'zod';

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

export const wardrobeCreateSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  color: z.string().optional().nullable().transform((value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)),
  fabric: z.string().optional().nullable().transform((value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)),
  season: z.preprocess(parseArrayField, z.array(z.string())).optional().default([]),
  occasions: z.preprocess(parseArrayField, z.array(z.string())).optional().default([]),
  brand: z.string().optional().nullable().transform((value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)),
  purchasePrice: purchasePriceSchema.optional().default(null),
});

export const wardrobeUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  color: z.string().optional().nullable().transform((value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)),
  fabric: z.string().optional().nullable().transform((value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)),
  season: z.preprocess(parseArrayField, z.array(z.string())).optional(),
  occasions: z.preprocess(parseArrayField, z.array(z.string())).optional(),
  brand: z.string().optional().nullable().transform((value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)),
  purchasePrice: purchasePriceSchema.optional(),
});

function ecoScore(items: Array<{ wornCount: number }>) {
  const avg = items.reduce((sum, item) => sum + item.wornCount, 0) / Math.max(items.length, 1);
  return avg > 15 ? 'A+' : avg > 10 ? 'A' : avg > 6 ? 'B+' : avg > 3 ? 'B' : 'C';
}

export async function listWardrobe(userId: string, query: { category?: string; search?: string; sort?: 'newest' | 'mostWorn' | 'name' }) {
  const where: Record<string, unknown> = { userId, isActive: true };
  if (query.category && query.category !== 'all') where.category = query.category;
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

  const orderBy = query.sort === 'mostWorn'
    ? { wornCount: 'desc' as const }
    : query.sort === 'name'
      ? { name: 'asc' as const }
      : { createdAt: 'desc' as const };

  const items = await prisma.wardrobeItem.findMany({ where, orderBy });
  const totalCost = items.reduce((sum, item) => sum + (item.purchasePrice ?? 0), 0);
  const totalWorn = items.reduce((sum, item) => sum + item.wornCount, 0);

  return {
    items,
    stats: {
      total: items.length,
      unworn: items.filter((item) => item.wornCount === 0).length,
      costPerWear: totalWorn > 0 ? Math.round(totalCost / totalWorn) : 0,
      totalCost,
      ecoScore: ecoScore(items),
    },
  };
}

export async function createWardrobeItem(userId: string, payload: z.infer<typeof wardrobeCreateSchema>, image?: { url: string | null; publicId: string | null }) {
  return prisma.wardrobeItem.create({
    data: {
      userId,
      name: payload.name,
      category: payload.category,
      color: payload.color,
      fabric: payload.fabric,
      season: payload.season,
      occasions: payload.occasions,
      brand: payload.brand,
      purchasePrice: payload.purchasePrice,
      imageUrl: image?.url ?? null,
      imagePublicId: image?.publicId ?? null,
    },
  });
}

export async function getWardrobeItem(userId: string, id: string) {
  return prisma.wardrobeItem.findFirst({ where: { id, userId } });
}

export async function updateWardrobeItem(userId: string, id: string, payload: z.infer<typeof wardrobeUpdateSchema>, image?: { url: string | null; publicId: string | null }) {
  const existing = await prisma.wardrobeItem.findFirst({ where: { id, userId } });
  if (!existing) return null;

  return prisma.wardrobeItem.update({
    where: { id },
    data: {
      ...(payload.name ? { name: payload.name } : {}),
      ...(payload.category ? { category: payload.category } : {}),
      ...(payload.color !== undefined ? { color: payload.color } : {}),
      ...(payload.fabric !== undefined ? { fabric: payload.fabric } : {}),
      ...(payload.brand !== undefined ? { brand: payload.brand } : {}),
      ...(payload.season ? { season: payload.season } : {}),
      ...(payload.occasions ? { occasions: payload.occasions } : {}),
      ...(payload.purchasePrice !== undefined ? { purchasePrice: payload.purchasePrice } : {}),
      imageUrl: image?.url ?? existing.imageUrl,
      imagePublicId: image?.publicId ?? existing.imagePublicId,
    },
  });
}

export async function markWardrobeItemWorn(userId: string, id: string) {
  return prisma.wardrobeItem.update({
    where: { id, userId },
    data: { wornCount: { increment: 1 }, lastWornAt: new Date() },
  });
}

export async function deleteWardrobeItem(userId: string, id: string) {
  return prisma.wardrobeItem.update({ where: { id, userId }, data: { isActive: false } });
}

export async function getWardrobeInsights(userId: string) {
  const items = await prisma.wardrobeItem.findMany({ where: { userId, isActive: true } });
  const categories = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  return {
    summary: {
      total: items.length,
      unworn: items.filter((item) => item.wornCount === 0).length,
      totalCost: items.reduce((sum, item) => sum + (item.purchasePrice ?? 0), 0),
      ecoScore: ecoScore(items),
    },
    mostWorn: [...items].sort((a, b) => b.wornCount - a.wornCount).slice(0, 5),
    unworn: items.filter((item) => item.wornCount === 0).slice(0, 8),
    categoryDistribution: categories,
  };
}
