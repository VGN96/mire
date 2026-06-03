import { prisma } from '../config/db.js';

export async function getUserProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, city: true, stylePersona: true, occasions: true,
      budgetRange: true, skinTone: true, bust: true, waist: true, hip: true,
      height: true, shoulder: true, sleeveLength: true, ootdReminder: true, createdAt: true,
      _count: { select: { wardrobeItems: true, stitchBriefs: true, outfits: true } },
    },
  });
}

export async function updateUserProfile(userId: string, input: Record<string, unknown>) {
  const allowed = ['name','city','stylePersona','occasions','budgetRange','skinTone','bust','waist','hip','height','shoulder','sleeveLength','ootdReminder'];
  const data = Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key))) as Record<string, unknown>;
  return prisma.user.update({ where: { id: userId }, data, select: { id: true, name: true, city: true, stylePersona: true, occasions: true } });
}

export async function getUserDashboard(userId: string) {
  const [wAgg, briefs, outfits, unread] = await Promise.all([
    prisma.wardrobeItem.aggregate({ where: { userId, isActive: true }, _count: { id: true }, _sum: { purchasePrice: true, wornCount: true } }),
    prisma.stitchBrief.count({ where: { userId } }),
    prisma.outfit.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  const total = wAgg._count.id;
  const cost = wAgg._sum.purchasePrice ?? 0;
  const worn = wAgg._sum.wornCount ?? 0;

  return {
    wardrobe: { total, totalCost: cost, costPerWear: worn > 0 ? Math.round(cost / worn) : 0 },
    briefs,
    outfits,
    unreadNotif: unread,
  };
}
