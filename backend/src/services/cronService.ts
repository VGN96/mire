import cron from 'node-cron';
import { prisma } from '../config/db.js';

export function startCronJobs() {
  // Daily OOTD reminder — 7:30 AM IST
  cron.schedule('30 7 * * *', async () => {
    try {
      const users = await prisma.user.findMany({ where: { ootdReminder: true }, select: { id: true } });
      if (users.length) {
        await prisma.notification.createMany({
          data: users.map((u) => ({ userId: u.id, type: 'ootd', title: 'Good morning ✦', body: 'Your AI stylist has a fresh outfit idea for today!' })),
          skipDuplicates: true,
        });
        console.log(`[CRON] OOTD sent to ${users.length} users`);
      }
    } catch (e) { console.error('[CRON] OOTD:', (e as Error).message); }
  }, { timezone: 'Asia/Kolkata' });

  // Sunday laundry reminder — 9 AM IST
  cron.schedule('0 9 * * 0', async () => {
    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const worn = await prisma.wardrobeItem.findMany({
        where: { lastWornAt: { gte: weekAgo }, isActive: true }, select: { userId: true, name: true },
      });
      const byUser = worn.reduce<Record<string, string[]>>((a, i) => { (a[i.userId] = a[i.userId] || []).push(i.name); return a; }, {});
      for (const [uid, names] of Object.entries(byUser)) {
        await prisma.notification.create({ data: { userId: uid, type: 'laundry', title: '🧼 Laundry Reminder',
          body: `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2} more` : ''} worn this week.` } });
      }
    } catch (e) { console.error('[CRON] Laundry:', (e as Error).message); }
  }, { timezone: 'Asia/Kolkata' });

  console.log('  ✦ Cron jobs active (IST)');
}
