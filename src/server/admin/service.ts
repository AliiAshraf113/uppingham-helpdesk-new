import type { PoolConnection } from "mariadb";
import { ForbiddenError } from "../http/errors.ts";
import { getDbPool } from "../db/pool.ts";

async function requireSettingsPermission(connection: PoolConnection, userId: number) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new ForbiddenError();
  const rows = await connection.execute<Array<{ permission_key: string }>>(
    "SELECT rp.permission_key FROM app_users u JOIN app_user_roles ur ON ur.user_id = u.user_id JOIN app_roles r ON r.role_id = ur.role_id JOIN app_role_permissions rp ON rp.role_id = r.role_id WHERE u.user_id = ? AND u.is_active = TRUE AND r.is_active = TRUE",
    [userId],
  );
  if (!rows.some(({ permission_key }) => permission_key === "settings.manage")) throw new ForbiddenError();
}

/** Read-only starter for the admin console; account and role mutation are intentionally not exposed yet. */
export async function getAdminReferenceData(actor: { userId: number }) {
  const connection = await getDbPool().getConnection();
  try {
    return await getAdminReferenceDataFromConnection(connection, actor);
  } finally {
    await connection.release();
  }
}

export async function getAdminReferenceDataFromConnection(connection: PoolConnection, actor: { userId: number }) {
  await requireSettingsPermission(connection, actor.userId);
  const categories = await connection.execute<Array<Record<string, unknown>>>("SELECT category_id AS id, category_key AS keyName, name, is_active AS isActive FROM ticket_categories ORDER BY sort_order, name");
  const departments = await connection.execute<Array<Record<string, unknown>>>("SELECT department_id AS id, department_key AS keyName, name, is_active AS isActive FROM departments ORDER BY name");
  const buildings = await connection.execute<Array<Record<string, unknown>>>("SELECT building_id AS id, building_key AS keyName, name, is_active AS isActive FROM buildings ORDER BY name");
  const assetTypes = await connection.execute<Array<Record<string, unknown>>>("SELECT asset_type_id AS id, type_key AS keyName, name, is_active AS isActive FROM asset_types ORDER BY name");
  return { categories, departments, buildings, assetTypes };
}
