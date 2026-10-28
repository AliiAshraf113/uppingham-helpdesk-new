import type { PoolConnection } from "mariadb";
import { ForbiddenError, NotFoundError } from "../http/errors.ts";
import { validateAssetInput, validateAssetList, validateRetirementReason } from "./domain.mjs";

export type AssetActor = { userId: number };

async function requirePermission(connection: PoolConnection, actor: AssetActor, permission: string, lock = false) {
  if (!Number.isSafeInteger(actor.userId) || actor.userId < 1) throw new ForbiddenError();
  const rows = await connection.execute<Array<{ permission_key: string }>>(
    `SELECT rp.permission_key FROM app_users u JOIN app_user_roles ur ON ur.user_id = u.user_id JOIN app_roles r ON r.role_id = ur.role_id JOIN app_role_permissions rp ON rp.role_id = r.role_id WHERE u.user_id = ? AND u.is_active = TRUE AND r.is_active = TRUE${lock ? " FOR UPDATE" : ""}`,
    [actor.userId],
  );
  if (!rows.some(({ permission_key }) => permission_key === permission)) throw new ForbiddenError();
}

export async function listAssets(connection: PoolConnection, actor: AssetActor, input: unknown = {}) {
  await requirePermission(connection, actor, "asset.read");
  const validated = validateAssetList(input as Record<string, unknown>);
  if (!validated.ok) throw new TypeError(validated.error);
  const { status, search, page, pageSize } = validated.value;
  const conditions: string[] = [];
  const values: Array<string | number> = [];
  if (status) { conditions.push("a.status = ?"); values.push(status); }
  if (search) {
    const escaped = search.replace(/[\\%_]/g, "\\$&");
    conditions.push("(a.asset_tag LIKE ? ESCAPE '\\\\' OR a.serial_number LIKE ? ESCAPE '\\\\' OR a.manufacturer LIKE ? ESCAPE '\\\\' OR a.model LIKE ? ESCAPE '\\\\')");
    values.push(...Array(4).fill(`%${escaped}%`));
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return connection.execute<Array<Record<string, unknown>>>(
    `SELECT a.asset_id AS assetId, a.asset_tag AS assetTag, a.serial_number AS serialNumber, a.manufacturer, a.model, at.name AS assetType, a.status, a.assigned_user_id AS assignedUserId, a.updated_at AS updatedAt FROM assets a JOIN asset_types at ON at.asset_type_id = a.asset_type_id ${where} ORDER BY a.updated_at DESC, a.asset_id DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
}

export async function createAsset(connection: PoolConnection, actor: AssetActor, input: unknown) {
  await requirePermission(connection, actor, "asset.manage", true);
  const validated = validateAssetInput(input);
  if (!validated.ok) throw new TypeError(validated.error);
  const assetType = await connection.execute<Array<{ asset_type_id: number }>>(
    "SELECT asset_type_id FROM asset_types WHERE asset_type_id = ? AND is_active = TRUE LIMIT 1",
    [validated.value.assetTypeId],
  );
  if (!assetType[0]) throw new TypeError("Choose an active asset type.");
  const asset = validated.value;
  const result = await connection.execute<{ insertId: number | bigint }>(
    "INSERT INTO assets (asset_tag, serial_number, manufacturer, model, asset_type_id, purchase_date, warranty_expires_on, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [asset.assetTag, asset.serialNumber, asset.manufacturer, asset.model, asset.assetTypeId, asset.purchaseDate, asset.warrantyExpiresOn, actor.userId],
  );
  const assetId = Number(result.insertId);
  if (!Number.isSafeInteger(assetId) || assetId < 1) throw new Error("Asset creation did not return a valid identifier.");
  const after = JSON.stringify({ assetTag: asset.assetTag, status: "in_stock" });
  await connection.execute("INSERT INTO asset_history (asset_id, actor_user_id, action_key, after_json) VALUES (?, ?, 'created', ?)", [assetId, actor.userId, after]);
  await connection.execute("INSERT INTO audit_events (actor_user_id, action_key, resource_type, resource_id, after_json) VALUES (?, 'asset.created', 'asset', ?, ?)", [actor.userId, String(assetId), after]);
  return { assetId };
}

export async function assignAsset(connection: PoolConnection, actor: AssetActor, assetId: number, assigneeUserId: number | null) {
  await requirePermission(connection, actor, "asset.manage", true);
  if (!Number.isSafeInteger(assetId) || assetId < 1 || (assigneeUserId !== null && (!Number.isSafeInteger(assigneeUserId) || assigneeUserId < 1))) {
    throw new TypeError("Asset and assignee identifiers must be positive integers.");
  }
  const assets = await connection.execute<Array<{ assigned_user_id: number | null; status: string }>>(
    "SELECT assigned_user_id, status FROM assets WHERE asset_id = ? FOR UPDATE", [assetId],
  );
  const asset = assets[0];
  if (!asset) throw new NotFoundError("Asset not found.");
  if (["retired", "maintenance"].includes(asset.status)) throw new TypeError("Retired or maintenance assets cannot be assigned.");
  if (assigneeUserId !== null) {
    const users = await connection.execute<Array<{ user_id: number }>>("SELECT user_id FROM app_users WHERE user_id = ? AND is_active = TRUE LIMIT 1", [assigneeUserId]);
    if (!users[0]) throw new TypeError("Choose an active user.");
  }
  const nextStatus = assigneeUserId === null ? "in_stock" : "assigned";
  await connection.execute("UPDATE assets SET assigned_user_id = ?, status = ? WHERE asset_id = ?", [assigneeUserId, nextStatus, assetId]);
  const before = JSON.stringify({ assignedUserId: asset.assigned_user_id, status: asset.status });
  const after = JSON.stringify({ assignedUserId: assigneeUserId, status: nextStatus });
  await connection.execute("INSERT INTO asset_history (asset_id, actor_user_id, action_key, before_json, after_json) VALUES (?, ?, 'assignment_changed', ?, ?)", [assetId, actor.userId, before, after]);
  await connection.execute("INSERT INTO audit_events (actor_user_id, action_key, resource_type, resource_id, before_json, after_json) VALUES (?, 'asset.assignment_changed', 'asset', ?, ?, ?)", [actor.userId, String(assetId), before, after]);
  return { assetId, assignedUserId: assigneeUserId, status: nextStatus };
}

export async function retireAsset(connection: PoolConnection, actor: AssetActor, assetId: number, reason: string) {
  await requirePermission(connection, actor, "asset.manage", true);
  const validatedReason = validateRetirementReason(reason);
  if (!validatedReason.ok) throw new TypeError(validatedReason.error);
  if (!Number.isSafeInteger(assetId) || assetId < 1) throw new TypeError("Asset identifier must be a positive integer.");
  const assets = await connection.execute<Array<{ assigned_user_id: number | null; status: string }>>(
    "SELECT assigned_user_id, status FROM assets WHERE asset_id = ? FOR UPDATE", [assetId],
  );
  const asset = assets[0];
  if (!asset) throw new NotFoundError("Asset not found.");
  if (asset.status === "retired") throw new TypeError("Asset is already retired.");
  const after = JSON.stringify({ status: "retired", reason: validatedReason.value });
  await connection.execute("UPDATE assets SET assigned_user_id = NULL, status = 'retired', retired_at = CURRENT_TIMESTAMP(3), retired_by_user_id = ?, retirement_reason = ? WHERE asset_id = ?", [actor.userId, validatedReason.value, assetId]);
  const before = JSON.stringify({ assignedUserId: asset.assigned_user_id, status: asset.status });
  await connection.execute("INSERT INTO asset_history (asset_id, actor_user_id, action_key, before_json, after_json, reason) VALUES (?, ?, 'retired', ?, ?, ?)", [assetId, actor.userId, before, after, validatedReason.value]);
  await connection.execute("INSERT INTO audit_events (actor_user_id, action_key, resource_type, resource_id, before_json, after_json) VALUES (?, 'asset.retired', 'asset', ?, ?, ?)", [actor.userId, String(assetId), before, after]);
  return { assetId, status: "retired" };
}

export async function listAssetTypes(connection: PoolConnection, actor: AssetActor) {
  await requirePermission(connection, actor, "asset.read");
  return connection.execute<Array<{ id: number; keyName: string; name: string }>>(
    "SELECT asset_type_id AS id, type_key AS keyName, name FROM asset_types WHERE is_active = TRUE ORDER BY name",
  );
}

export async function listAssignableUsers(connection: PoolConnection, actor: AssetActor) {
  await requirePermission(connection, actor, "asset.manage");
  return connection.execute<Array<{ userId: number; displayName: string }>>(
    "SELECT user_id AS userId, display_name AS displayName FROM app_users WHERE is_active = TRUE ORDER BY display_name",
  );
}
