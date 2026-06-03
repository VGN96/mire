import { prisma } from '../config/db.js';

export async function listNotifications(userId: string) {
  const notifications = await prisma.notification.findMany({
    where: { userId }, orderBy: { createdAt: 'desc' }, take: 40,
  });

  return { notifications, unreadCount: notifications.filter((n) => !n.isRead).length };
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  return { ok: true };
}

export async function markNotificationRead(userId: string, id: string) {
  await prisma.notification.update({ where: { id, userId }, data: { isRead: true } });
  return { ok: true };
}

export async function deleteNotification(userId: string, id: string) {
  await prisma.notification.delete({ where: { id, userId } });
  return { message: 'Deleted' };
}
