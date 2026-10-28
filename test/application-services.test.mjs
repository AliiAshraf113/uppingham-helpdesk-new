import assert from "node:assert/strict";
import test from "node:test";
import { assignAsset, createAsset, listAssets, listAssetTypes, listAssignableUsers, retireAsset } from "../src/server/assets/repository.ts";
import { validateAssetInput, validateAssetList, validateRetirementReason } from "../src/server/assets/domain.mjs";
import { getAdminReferenceDataFromConnection } from "../src/server/admin/service.ts";
import { listMyNotificationsFromConnection, markMyNotificationReadFromConnection } from "../src/server/notifications/service.ts";
import { getTicketStatusSummaryFromConnection } from "../src/server/reports/service.ts";
import { withDbTransactionOnConnection } from "../src/server/db/transaction.ts";

test("asset validation accepts bounded fields and rejects invalid identifiers and dates", () => {
  assert.deepEqual(validateAssetInput({ assetTag: " LAP-14 ", assetTypeId: "2", manufacturer: " Acme ", purchaseDate: "2026-02-01", warrantyExpiresOn: "2027-02-01" }), {
    ok: true,
    value: { assetTag: "LAP-14", assetTypeId: 2, serialNumber: null, manufacturer: "Acme", model: null, purchaseDate: "2026-02-01", warrantyExpiresOn: "2027-02-01" },
  });
  assert.equal(validateAssetInput({ assetTag: "x", assetTypeId: "1 OR 1=1" }).ok, false);
  assert.equal(validateAssetInput({ assetTag: "x", assetTypeId: 1, purchaseDate: "2026-02-30" }).ok, false);
  assert.equal(validateAssetInput({ assetTag: "x", assetTypeId: 1, purchaseDate: "2027-01-01", warrantyExpiresOn: "2026-01-01" }).ok, false);
  assert.equal(validateAssetList({ status: "unknown" }).ok, false);
  assert.equal(validateAssetList(null).ok, false);
  assert.equal(validateRetirementReason("  ").ok, false);
});

test("asset inventory reads require permission and bind search and pagination", async () => {
  const calls = [];
  const connection = { async execute(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes("app_role_permissions")) return [{ permission_key: "asset.read" }];
    return [{ assetId: 8 }];
  } };
  const rows = await listAssets(connection, { userId: 4 }, { search: "A%_", status: "assigned", page: 2 });
  assert.deepEqual(rows, [{ assetId: 8 }]);
  const query = calls[1];
  assert.match(query.sql, /a\.status = \?/);
  assert.match(query.sql, /LIMIT \? OFFSET \?/);
  assert.deepEqual(query.values, ["assigned", "%A\\%\\_%", "%A\\%\\_%", "%A\\%\\_%", "%A\\%\\_%", 25, 25]);

  calls.length = 0;
  connection.execute = async (sql, values = []) => { calls.push({ sql, values }); return []; };
  await assert.rejects(listAssets(connection, { userId: 4 }), /not authorized/);
  assert.equal(calls.length, 1, "no asset query runs before permission succeeds");
});

test("asset creation binds user input and writes history and audit rows", async () => {
  const calls = [];
  const connection = { async execute(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes("app_role_permissions")) return [{ permission_key: "asset.manage" }];
    if (sql.includes("FROM asset_types")) return [{ asset_type_id: 3 }];
    if (sql.startsWith("INSERT INTO assets")) return { insertId: 81 };
    return { affectedRows: 1 };
  } };
  assert.deepEqual(await createAsset(connection, { userId: 6 }, { assetTag: "TAB-81", assetTypeId: 3, manufacturer: "O'Brien" }), { assetId: 81 });
  const insert = calls.find(({ sql }) => sql.startsWith("INSERT INTO assets"));
  assert.equal(insert.values[0], "TAB-81");
  assert.equal(insert.values[2], "O'Brien");
  assert.match(insert.sql, /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?\)/);
  assert.ok(calls.some(({ sql }) => sql.startsWith("INSERT INTO asset_history")));
  assert.ok(calls.some(({ sql }) => sql.startsWith("INSERT INTO audit_events")));
});

test("asset assignment and retirement enforce lifecycle and permission", async () => {
  const calls = [];
  let status = "in_stock";
  let permission = "asset.manage";
  const connection = { async execute(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes("app_role_permissions")) return [{ permission_key: permission }];
    if (sql.startsWith("SELECT assigned_user_id")) return [{ assigned_user_id: null, status }];
    if (sql.startsWith("SELECT user_id FROM app_users")) return [{ user_id: 17 }];
    return { affectedRows: 1 };
  } };
  assert.deepEqual(await assignAsset(connection, { userId: 6 }, 81, 17), { assetId: 81, assignedUserId: 17, status: "assigned" });
  assert.ok(calls.some(({ sql, values }) => sql.startsWith("UPDATE assets") && values[0] === 17));
  status = "retired";
  await assert.rejects(assignAsset(connection, { userId: 6 }, 81, 17), /cannot be assigned/);
  status = "assigned";
  assert.deepEqual(await retireAsset(connection, { userId: 6 }, 81, "End of service life"), { assetId: 81, status: "retired" });
  permission = "asset.read";
  await assert.rejects(retireAsset(connection, { userId: 6 }, 81, "Reason"), /not authorized/);
});

test("asset types and assignable users require appropriate permissions", async () => {
  const calls = [];
  let permission = "asset.read";
  const connection = { async execute(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes("app_role_permissions")) return [{ permission_key: permission }];
    if (sql.includes("FROM asset_types")) return [{ id: 1, keyName: "laptop", name: "Laptop" }];
    if (sql.includes("FROM app_users")) return [{ userId: 10, displayName: "Teacher Jane" }];
    return [];
  } };

  const types = await listAssetTypes(connection, { userId: 6 });
  assert.deepEqual(types, [{ id: 1, keyName: "laptop", name: "Laptop" }]);

  permission = "asset.manage";
  const users = await listAssignableUsers(connection, { userId: 6 });
  assert.deepEqual(users, [{ userId: 10, displayName: "Teacher Jane" }]);

  permission = "asset.read";
  await assert.rejects(listAssignableUsers(connection, { userId: 6 }), /not authorized/);
});

test("transaction helper commits success, rolls back failures, and releases in either case", async () => {
  const events = [];
  const connection = {
    async beginTransaction() { events.push("begin"); },
    async commit() { events.push("commit"); },
    async rollback() { events.push("rollback"); },
    async release() { events.push("release"); },
  };
  assert.equal(await withDbTransactionOnConnection(connection, async () => "ok"), "ok");
  assert.deepEqual(events, ["begin", "commit", "release"]);
  events.length = 0;
  await assert.rejects(withDbTransactionOnConnection(connection, async () => { throw new Error("write failed"); }), /write failed/);
  assert.deepEqual(events, ["begin", "rollback", "release"]);
  events.length = 0;
  connection.rollback = async () => { events.push("rollback"); throw new Error("rollback failed"); };
  await assert.rejects(withDbTransactionOnConnection(connection, async () => { throw new Error("write failed"); }), AggregateError);
  assert.deepEqual(events, ["begin", "rollback", "release"]);
});

test("reports require report.read and return aggregates only", async () => {
  const calls = [];
  const connection = { async execute(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes("app_role_permissions")) return [{ permission_key: "report.read" }];
    return [{ status: "open", ticketCount: 2 }];
  } };
  assert.deepEqual(await getTicketStatusSummaryFromConnection(connection, { userId: 7 }), [{ status: "open", ticketCount: 2 }]);
  assert.match(calls[1].sql, /COUNT\(\*\)/);
  assert.doesNotMatch(calls[1].sql, /requester|description|comment/i);
  calls.length = 0;
  connection.execute = async (sql, values = []) => { calls.push({ sql, values }); return []; };
  await assert.rejects(getTicketStatusSummaryFromConnection(connection, { userId: 7 }), /not authorized/);
  assert.equal(calls.length, 1);
});

test("notifications are recipient-scoped and cannot be read or marked by another user", async () => {
  const calls = [];
  let result = [];
  const connection = { async execute(sql, values = []) { calls.push({ sql, values }); return result; } };
  await listMyNotificationsFromConnection(connection, { userId: 12 }, 2);
  assert.match(calls[0].sql, /recipient_user_id = \?/);
  assert.deepEqual(calls[0].values, [12, 25]);
  result = [];
  await assert.rejects(markMyNotificationReadFromConnection(connection, { userId: 12 }, 44), /Notification not found/);
  assert.deepEqual(calls[1].values, [44, 12]);
  assert.equal(calls.some(({ sql }) => sql.startsWith("UPDATE notifications")), false);
  result = [{ notification_id: 44, read_at: null }];
  assert.deepEqual(await markMyNotificationReadFromConnection(connection, { userId: 12 }, 44), { notificationId: 44, read: true });
  assert.ok(calls.some(({ sql, values }) => sql.startsWith("UPDATE notifications") && values[1] === 12));
});

test("administrative reference reads check permission before querying references", async () => {
  const calls = [];
  const connection = { async execute(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes("app_role_permissions")) return [{ permission_key: "settings.manage" }];
    return [];
  } };
  const data = await getAdminReferenceDataFromConnection(connection, { userId: 2 });
  assert.deepEqual(Object.keys(data), ["categories", "departments", "buildings", "assetTypes"]);
  assert.equal(calls.length, 5);
  calls.length = 0;
  connection.execute = async (sql, values = []) => { calls.push({ sql, values }); return []; };
  await assert.rejects(getAdminReferenceDataFromConnection(connection, { userId: 2 }), /not authorized/);
  assert.equal(calls.length, 1, "reference tables remain unread for non-admin actors");
});
