import type { PoolConnection } from "mariadb";
import { ForbiddenError } from "../http/errors.ts";
import { getDbPool } from "../db/pool.ts";

async function requireReportPermission(connection: PoolConnection, userId: number) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new ForbiddenError();
  const rows = await connection.execute<Array<{ permission_key: string }>>(
    "SELECT rp.permission_key FROM app_users u JOIN app_user_roles ur ON ur.user_id = u.user_id JOIN app_roles r ON r.role_id = ur.role_id JOIN app_role_permissions rp ON rp.role_id = r.role_id WHERE u.user_id = ? AND u.is_active = TRUE AND r.is_active = TRUE",
    [userId],
  );
  if (!rows.some(({ permission_key }) => permission_key === "report.read")) throw new ForbiddenError();
}

/** Aggregate-only reporting; intentionally returns no requester names, descriptions, or comment content. */
export async function getTicketStatusSummary(actor: { userId: number }) {
  const connection = await getDbPool().getConnection();
  try {
    return await getTicketStatusSummaryFromConnection(connection, actor);
  } finally {
    await connection.release();
  }
}

export async function getTicketStatusSummaryFromConnection(connection: PoolConnection, actor: { userId: number }) {
  await requireReportPermission(connection, actor.userId);
  return connection.execute<Array<{ status: string; ticketCount: number | string }>>(
    "SELECT s.status_key AS status, COUNT(*) AS ticketCount FROM tickets t JOIN ticket_statuses s ON s.status_id = t.status_id GROUP BY s.status_key ORDER BY MIN(s.rank_order)",
  );
}
