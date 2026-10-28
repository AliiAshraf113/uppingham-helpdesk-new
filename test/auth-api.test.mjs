import assert from "node:assert/strict";
import test from "node:test";
import { GET as listTicketsRoute, POST as createTicketRoute } from "../src/app/api/tickets/route.ts";
import { GET as getTicketRoute } from "../src/app/api/tickets/[ticketNumber]/route.ts";
import { POST as assignTicketRoute } from "../src/app/api/tickets/[ticketNumber]/assignment/route.ts";
import { POST as addCommentRoute } from "../src/app/api/tickets/[ticketNumber]/comments/route.ts";
import { PATCH as changeStatusRoute } from "../src/app/api/tickets/[ticketNumber]/status/route.ts";
import { GET as listAssetsRoute, POST as createAssetRoute } from "../src/app/api/assets/route.ts";
import { POST as assignAssetRoute } from "../src/app/api/assets/[assetId]/assignment/route.ts";
import { POST as retireAssetRoute } from "../src/app/api/assets/[assetId]/retire/route.ts";
import { GET as reportRoute } from "../src/app/api/reports/route.ts";
import { GET as notificationListRoute } from "../src/app/api/notifications/route.ts";
import { POST as markNotificationReadRoute } from "../src/app/api/notifications/[notificationId]/read/route.ts";
import { GET as adminReferenceRoute } from "../src/app/api/admin/reference-data/route.ts";
import { requireSessionPrincipal } from "../src/server/auth/principal.ts";
import { queryParams, readJsonRequest, requireSameOriginMutation } from "../src/server/http/request.ts";

test("ticket API routes fail closed while the authentication integration is unavailable", async () => {
  const listResponse = await listTicketsRoute(new Request("https://example.test/helpdesk/api/tickets"));
  assert.equal(listResponse.status, 503);
  assert.deepEqual(await listResponse.json(), { error: "authentication_unavailable" });

  const createResponse = await createTicketRoute(new Request("https://example.test/helpdesk/api/tickets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "not submitted", description: "not submitted", categoryId: 1, priority: "low" }),
  }));
  assert.equal(createResponse.status, 503);
  assert.deepEqual(await createResponse.json(), { error: "authentication_unavailable" });

  const context = { params: Promise.resolve({ ticketNumber: "55" }) };
  const protectedResponses = await Promise.all([
    getTicketRoute(new Request("https://example.test/helpdesk/api/tickets/55"), context),
    changeStatusRoute(new Request("https://example.test/helpdesk/api/tickets/55/status", { method: "PATCH" }), context),
    assignTicketRoute(new Request("https://example.test/helpdesk/api/tickets/55/assignment", { method: "POST" }), context),
    addCommentRoute(new Request("https://example.test/helpdesk/api/tickets/55/comments", { method: "POST" }), context),
  ]);
  assert.ok(protectedResponses.every((response) => response.status === 503));
  for (const response of protectedResponses) assert.deepEqual(await response.json(), { error: "authentication_unavailable" });
});

test("asset, report, notification and admin APIs fail closed before parsing or service access", async () => {
  const assetContext = { params: Promise.resolve({ assetId: "12" }) };
  const protectedResponses = await Promise.all([
    listAssetsRoute(new Request("https://example.test/helpdesk/api/assets")),
    createAssetRoute(new Request("https://example.test/helpdesk/api/assets", { method: "POST", body: "not-json" })),
    assignAssetRoute(new Request("https://example.test/helpdesk/api/assets/12/assignment", { method: "POST", body: "not-json" }), assetContext),
    retireAssetRoute(new Request("https://example.test/helpdesk/api/assets/12/retire", { method: "POST", body: "not-json" }), assetContext),
    reportRoute(),
    notificationListRoute(new Request("https://example.test/helpdesk/api/notifications")),
    markNotificationReadRoute(new Request("https://example.test/helpdesk/api/notifications/55/read", { method: "POST" }), { params: Promise.resolve({ notificationId: "55" }) }),
    adminReferenceRoute(),
  ]);
  assert.ok(protectedResponses.every((response) => response.status === 503));
  for (const response of protectedResponses) {
    assert.deepEqual(await response.json(), { error: "authentication_unavailable" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("session principal requires trusted immutable identity claims and maps them through the database", async () => {
  let queries = 0;
  const connection = {
    async execute(sql) {
      queries += 1;
      if (sql.includes("app_user_identities")) return [{ user_id: 22, display_name: "Local Staff", session_version: 3 }];
      return [{ role_key: "requester", permission_key: "ticket.read.own" }];
    },
  };
  await assert.rejects(requireSessionPrincipal(connection, null, "11111111-2222-4333-8444-555555555555"), /Sign in is required/);
  assert.equal(queries, 0);
  const principal = await requireSessionPrincipal(connection, {
    entraTenantId: "11111111-2222-4333-8444-555555555555",
    entraObjectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    entraIssuer: "https://login.microsoftonline.com/11111111-2222-4333-8444-555555555555/v2.0",
    sessionVersion: 3,
    userId: 999,
    roles: ["admin"],
  }, "11111111-2222-4333-8444-555555555555");
  assert.equal(principal.userId, 22);
  assert.deepEqual(principal.roles, ["requester"]);
  assert.deepEqual(principal.permissions, ["ticket.read.own"]);
  await assert.rejects(requireSessionPrincipal(connection, {
    entraTenantId: "11111111-2222-4333-8444-555555555555",
    entraObjectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    entraIssuer: "https://login.microsoftonline.com/11111111-2222-4333-8444-555555555555/v2.0",
    sessionVersion: 2,
  }, "11111111-2222-4333-8444-555555555555"), /Sign in is required/);
  await assert.rejects(requireSessionPrincipal(connection, {
    entraTenantId: "11111111-2222-4333-8444-555555555555",
    entraObjectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    entraIssuer: "https://login.microsoftonline.com/11111111-2222-4333-8444-555555555555/v2.0",
  }, "11111111-2222-4333-8444-555555555555"), /Sign in is required/);
});

test("JSON API parser enforces media type and streaming body cap", async () => {
  const valid = await readJsonRequest(new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Keyboard" }),
  }));
  assert.deepEqual(valid, { title: "Keyboard" });
  await assert.rejects(readJsonRequest(new Request("https://example.test", {
    method: "POST", headers: { "content-type": "text/plain" }, body: "{}",
  })), /Content-Type/);
  const oversized = new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(33 * 1024)); controller.close(); } }),
    duplex: "half",
  });
  await assert.rejects(readJsonRequest(oversized), /exceeds the allowed size/);
});

test("query parser rejects unknown and repeated parameters", () => {
  assert.deepEqual(queryParams(new URLSearchParams("search=monitor&page=2"), ["search", "page"]), { search: "monitor", page: "2" });
  assert.throws(() => queryParams(new URLSearchParams("search=x&search=y"), ["search"]), /Query parameters/);
  assert.throws(() => queryParams(new URLSearchParams("role=admin"), ["search"]), /Query parameters/);
});

test("state-changing request guard requires an exact same-origin Origin", () => {
  requireSameOriginMutation(new Request("https://helpdesk.example.test/helpdesk/api/tickets", {
    method: "POST", headers: { origin: "https://helpdesk.example.test" },
  }));
  assert.throws(() => requireSameOriginMutation(new Request("https://helpdesk.example.test/helpdesk/api/tickets", {
    method: "POST", headers: { origin: "https://attacker.example" },
  })), /same origin/);
  assert.throws(() => requireSameOriginMutation(new Request("https://helpdesk.example.test/helpdesk/api/tickets", { method: "POST" })), /same origin/);
});
