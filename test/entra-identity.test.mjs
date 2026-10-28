import assert from "node:assert/strict";
import test from "node:test";
import { getRequiredEntraTenantId, resolveEntraLocalPrincipal, UnlinkedEntraIdentityError } from "../src/server/identity/entra.ts";

const tenantId = "11111111-2222-4333-8444-555555555555";
const objectId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const claims = { tid: tenantId, oid: objectId, iss: `https://login.microsoftonline.com/${tenantId}/v2.0`, email: "untrusted@example.edu" };

test("tenant setting is required and must be a GUID", () => {
  assert.equal(getRequiredEntraTenantId(tenantId.toUpperCase()), tenantId);
  assert.throws(() => getRequiredEntraTenantId(""), /missing or invalid/);
  assert.throws(() => getRequiredEntraTenantId("tenant.example"), /missing or invalid/);
});

test("identity lookup uses verified tenant and object ID, then returns current database roles", async () => {
  const calls = [];
  const connection = {
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("app_user_identities")) return [{ user_id: 19, display_name: "Staff Member", session_version: 3 }];
      return [
        { role_key: "requester", permission_key: "ticket.create" },
        { role_key: "requester", permission_key: "ticket.read.own" },
      ];
    },
  };
  const principal = await resolveEntraLocalPrincipal(connection, claims, tenantId);
  assert.deepEqual(principal, {
    userId: 19,
    displayName: "Staff Member",
    sessionVersion: 3,
    roles: ["requester"],
    permissions: ["ticket.create", "ticket.read.own"],
  });
  assert.deepEqual(calls[0].values, [tenantId, objectId]);
  assert.equal(calls[0].sql.includes("email"), false);
  assert.deepEqual(calls[1].values, [19]);
});

test("identity resolver denies wrong tenant, issuer, missing oid, and unlinked accounts before granting access", async () => {
  let queryCount = 0;
  const connection = { async execute() { queryCount += 1; return []; } };
  await assert.rejects(resolveEntraLocalPrincipal(connection, { ...claims, tid: "99999999-2222-4333-8444-555555555555" }, tenantId), /not from the configured Entra tenant/);
  await assert.rejects(resolveEntraLocalPrincipal(connection, { ...claims, iss: "https://login.microsoftonline.com/common/v2.0" }, tenantId), /issuer does not match/);
  await assert.rejects(resolveEntraLocalPrincipal(connection, { ...claims, iss: `https://user@login.microsoftonline.com/${tenantId}/v2.0` }, tenantId), /issuer does not match/);
  await assert.rejects(resolveEntraLocalPrincipal(connection, { ...claims, oid: undefined }, tenantId), /missing a valid object ID/);
  assert.equal(queryCount, 0);

  await assert.rejects(resolveEntraLocalPrincipal(connection, claims, tenantId), /No active local account/);
  assert.equal(queryCount, 1);
});

test("identity resolver rejects an account with no active database role or permission", async () => {
  let call = 0;
  const connection = {
    async execute() {
      call += 1;
      return call === 1 ? [{ user_id: 19, display_name: null, session_version: 1 }] : [];
    },
  };
  await assert.rejects(resolveEntraLocalPrincipal(connection, claims, tenantId), /no active Helpdesk role/);
});

test("inactive or unlinked Entra identities have no usable local principal", async () => {
  let query;
  const connection = { async execute(sql, values) { query = { sql, values }; return []; } };
  await assert.rejects(resolveEntraLocalPrincipal(connection, claims, tenantId), UnlinkedEntraIdentityError);
  assert.match(query.sql, /u\.is_active = TRUE/);
  assert.match(query.sql, /i\.tenant_id = \? AND i\.provider_subject = \?/);
  assert.deepEqual(query.values, [tenantId, objectId]);
  assert.doesNotMatch(query.sql, /email|upn/i);
});
