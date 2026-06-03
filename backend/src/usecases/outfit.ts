import { prisma } from '../config/db.js';

export async function listOutfits(userId: string) {
  return prisma.outfit.findMany({
    where: { userId }, orderBy: { createdAt: 'desc' },
    include: { items: { include: { wardrobeItem: { select: { id: true, name: true, imageUrl: true, color: true, category: true } } } } },
  });
}

export async function createOutfit(userId: string, input: { name?: string; occasion?: string; itemIds?: string[]; isAiGenerated?: boolean }) {
  if (!input.name) throw new Error('name required');
  return prisma.outfit.create({
    data: {
      userId,
      name: input.name,
      occasion: input.occasion,
      isAiGenerated: !!input.isAiGenerated,
      items: { create: (input.itemIds || []).map((id, index) => ({ wardrobeItemId: id, position: index + 1 })) },
    },
    include: { items: { include: { wardrobeItem: true } } },
  });
}

export async function wearOutfit(userId: string, id: string) {
  const outfit = await prisma.outfit.update({
    where: { id, userId },
    data: { wornCount: { increment: 1 }, lastWornAt: new Date() },
  });
  const outfitItems = await prisma.outfitItem.findMany({ where: { outfitId: id } });
  await Promise.all(outfitItems.map((item) => prisma.wardrobeItem.update({
    where: { id: item.wardrobeItemId },
    data: { wornCount: { increment: 1 }, lastWornAt: new Date() },
  })));
  return outfit;
}

export async function deleteOutfit(userId: string, id: string) {
  await prisma.outfit.delete({ where: { id, userId } });
  return { message: 'Deleted' };
}
