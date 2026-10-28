import type { PoolConnection } from "mariadb";
import { getDbPool } from "../db/pool.ts";
import { withDbTransaction } from "../db/transaction.ts";
import { assignAsset, createAsset, listAssets, listAssetTypes, listAssignableUsers, retireAsset, type AssetActor } from "./repository";

export function getAssets(actor: AssetActor, query: unknown = {}) {
  return withConnection((connection) => listAssets(connection, actor, query));
}

export function getAssetTypes(actor: AssetActor) {
  return withConnection((connection) => listAssetTypes(connection, actor));
}

export function getAssignableUsers(actor: AssetActor) {
  return withConnection((connection) => listAssignableUsers(connection, actor));
}

export function addAsset(actor: AssetActor, input: unknown) {
  return withDbTransaction((connection) => createAsset(connection, actor, input));
}

export function assignInventoryAsset(actor: AssetActor, assetId: number, assigneeUserId: number | null) {
  return withDbTransaction((connection) => assignAsset(connection, actor, assetId, assigneeUserId));
}

export function retireInventoryAsset(actor: AssetActor, assetId: number, reason: string) {
  return withDbTransaction((connection) => retireAsset(connection, actor, assetId, reason));
}

async function withConnection<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getDbPool().getConnection();
  try { return await work(connection); } finally { await connection.release(); }
}
