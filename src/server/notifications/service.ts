import type { PoolConnection } from "mariadb";
import { ForbiddenError, NotFoundError } from "../http/errors.ts";
import { getDbPool } from "../db/pool.ts";
import { withDbTransaction } from "../db/transaction.ts";

function requireUserId(userId: number) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new ForbiddenError();
}

export async function listMyNotifications(actor: { userId: number }, page = 1) {
  requireUserId(actor.userId);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) throw new TypeError("Page must be between 1 and 10,000.");
  const connection = await getDbPool().getConnection();
  try {
    return await listMyNotificationsFromConnection(connection, actor, page);
  } finally {
    await connection.release();
  }
}

export function listMyNotificationsFromConnection(connection: PoolConnection, actor: { userId: number }, page = 1) {
  requireUserId(actor.userId);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) throw new TypeError("Page must be between 1 and 10,000.");
  return connection.execute<Array<Record<string, unknown>>>(
    "SELECT notification_id AS notificationId, ticket_number AS ticketNumber, event_key AS event, read_at AS readAt, created_at AS createdAt FROM notifications WHERE recipient_user_id = ? ORDER BY created_at DESC, notification_id DESC LIMIT 25 OFFSET ?",
    [actor.userId, (page - 1) * 25],
  );
}

export function markMyNotificationRead(actor: { userId: number }, notificationId: number) {
  requireUserId(actor.userId);
  if (!Number.isSafeInteger(notificationId) || notificationId < 1) throw new TypeError("Notification identifier must be a positive integer.");
  return withDbTransaction(async (connection) => markMyNotificationReadFromConnection(connection, actor, notificationId));
}

export async function markMyNotificationReadFromConnection(connection: PoolConnection, actor: { userId: number }, notificationId: number) {
  requireUserId(actor.userId);
  if (!Number.isSafeInteger(notificationId) || notificationId < 1) throw new TypeError("Notification identifier must be a positive integer.");
  const rows = await connection.execute<Array<{ notification_id: number; read_at: Date | null }>>(
    "SELECT notification_id, read_at FROM notifications WHERE notification_id = ? AND recipient_user_id = ? FOR UPDATE",
    [notificationId, actor.userId],
  );
  if (!rows[0]) throw new NotFoundError("Notification not found.");
  if (rows[0].read_at === null) {
    await connection.execute("UPDATE notifications SET read_at = CURRENT_TIMESTAMP(3) WHERE notification_id = ? AND recipient_user_id = ?", [notificationId, actor.userId]);
  }
  return { notificationId, read: true };
}
