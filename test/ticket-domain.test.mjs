import assert from "node:assert/strict";
import test from "node:test";
import { canTransition, validateTicketInput, validateTicketSearch } from "../src/server/tickets/domain.mjs";
import { assignTicket, createTicket, createTicketComment, getTicketDetail, listTickets, transitionTicket } from "../src/server/tickets/repository.ts";

test("ticket creation validation normalizes text and accepts only bounded fields", () => {
  assert.deepEqual(validateTicketInput({
    title: "  Printer issue  ",
    description: "  Printer in room 4 is not responding.  ",
    categoryId: "2",
    priority: "medium",
    assetId: "9",
  }), {
    ok: true,
    value: { title: "Printer issue", description: "Printer in room 4 is not responding.", categoryId: 2, priority: "medium", assetId: 9 },
  });
  assert.equal(validateTicketInput({ title: "", description: "x", categoryId: 1, priority: "low" }).ok, false);
  assert.equal(validateTicketInput({ title: "x", description: "x", categoryId: 1, priority: "admin" }).ok, false);
  assert.equal(validateTicketInput({ title: "x", description: "x", categoryId: "0x2", priority: "low" }).ok, false);
  assert.equal(validateTicketInput({ title: "x", description: "x", categoryId: "2e0", priority: "low" }).ok, false);
  assert.equal(validateTicketInput({ title: "x", description: "x", categoryId: 1, priority: "low", assetId: "1 OR 1=1" }).ok, false);
});

test("ticket lifecycle follows only transitions defined by the fresh schema", () => {
  assert.equal(canTransition("new", "open"), true);
  assert.equal(canTransition("open", "resolved"), true);
  assert.equal(canTransition("resolved", "open"), true);
  assert.equal(canTransition("new", "closed"), false);
  assert.equal(canTransition("closed", "open"), false);
  assert.equal(canTransition("invalid", "open"), false);
});

test("ticket search validates status, search length and bounded pagination", () => {
  assert.deepEqual(validateTicketSearch({ search: "  123  ", status: "open", page: "2" }), {
    ok: true,
    value: { search: "123", status: "open", page: 2, pageSize: 25 },
  });
  assert.equal(validateTicketSearch({ status: "all" }).ok, false);
  assert.equal(validateTicketSearch({ page: 0 }).ok, false);
  assert.equal(validateTicketSearch({ page: "2e1" }).ok, false);
  assert.equal(validateTicketSearch({ search: "x".repeat(101) }).ok, false);
});

test("ticket creation uses bound parameters and writes history in the same caller transaction", async () => {
  const calls = [];
  const connection = {
    async execute(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("app_role_permissions")) return [{ permission_key: "ticket.create" }];
      if (sql.includes("ticket_categories")) return [{ category_id: 4 }];
      if (sql.includes("ticket_priorities")) return [{ priority_id: 2 }];
      if (sql.includes("ticket_statuses")) return [{ status_id: 1 }];
      if (sql.startsWith("INSERT INTO tickets")) return { insertId: 47 };
      return { affectedRows: 1 };
    },
  };
  const result = await createTicket(connection, { userId: 12, roles: ["requester"] }, {
    title: "Printer's broken",
    description: "The printer is unavailable in room 4.",
    categoryId: 4,
    priority: "medium",
  });
  assert.deepEqual(result, { ticketNumber: 47 });
  assert.equal(calls.length, 7);
  assert.ok(calls.every(({ sql }) => !sql.includes("Printer's broken")));
  assert.ok(calls[4].sql.includes("VALUES (?, ?, ?, ?, ?, ?, ?)"));
  assert.equal(calls[4].values[0], "Printer's broken");
  assert.equal(calls[6].values[1], "47");
});

test("status transition checks role and lifecycle before writing audit history", async () => {
  const calls = [];
  let permissions = [{ permission_key: "ticket.read.own" }];
  const connection = {
    async execute(sql) {
      calls.push(sql);
      if (sql.includes("app_role_permissions")) return permissions;
      if (sql.startsWith("SELECT t.status_id")) return [{ status_id: 2, status_key: "open" }];
      if (sql.includes("FROM ticket_statuses WHERE status_key")) return [{ status_id: 5 }];
      return { affectedRows: 1 };
    },
  };
  await assert.rejects(transitionTicket(connection, { userId: 7 }, 42, "resolved"), /not authorized/);
  assert.equal(calls.length, 1);
  permissions = [{ permission_key: "ticket.transition" }];
  await assert.rejects(transitionTicket(connection, { userId: 7 }, 42, "closed"), /transition is not allowed/);
  assert.equal(calls.length, 3);
  const result = await transitionTicket(connection, { userId: 7 }, 42, "resolved");
  assert.deepEqual(result, { ticketNumber: 42, status: "resolved" });
  assert.ok(calls.some((sql) => sql.startsWith("UPDATE tickets")));
  assert.ok(calls.some((sql) => sql.startsWith("INSERT INTO audit_events")));
});

test("requester ticket listing is scoped by server actor and binds search input", async () => {
  let observed;
  const connection = {
    async execute(sql, values) {
      observed = { sql, values };
      if (sql.includes("app_role_permissions")) return [{ permission_key: "ticket.read.own" }];
      return [];
    },
  };
  await listTickets(connection, { userId: 23 }, { search: "%_\\", status: "open", page: 2 });
  assert.match(observed.sql, /t\.requester_user_id = \?/);
  assert.deepEqual(observed.values.slice(0, 2), [23, "open"]);
  assert.deepEqual(observed.values.slice(-2), [25, 25]);
  assert.equal(observed.values.includes("%_\\"), false);
  assert.ok(observed.values[2].includes("\\%\\_\\\\"));
  await assert.rejects(listTickets(connection, { userId: 0 }, {}), /not authorized/);
});

test("assignment requires database permission and an active IT assignee", async () => {
  const calls = [];
  const connection = {
    async execute(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("app_role_permissions")) return [{ permission_key: "ticket.assign" }];
      if (sql.startsWith("SELECT t.assignee_user_id")) return [{ assignee_user_id: null, status_key: "open" }];
      if (sql.includes("r.role_key IN")) return [{ user_id: 15 }];
      return { affectedRows: 1 };
    },
  };
  assert.deepEqual(await assignTicket(connection, { userId: 4 }, 55, 15), { ticketNumber: 55, assigneeUserId: 15 });
  assert.ok(calls.some(({ sql, values }) => sql.startsWith("UPDATE tickets") && values[0] === 15));
  assert.ok(calls.some(({ sql }) => sql.includes("'assigned'")));
});

test("requesters can add public comments only to their own tickets", async () => {
  let ownerId = 23;
  let permissions = [{ permission_key: "ticket.read.own" }, { permission_key: "ticket.comment.public" }];
  const calls = [];
  const connection = {
    async execute(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("app_role_permissions")) return permissions;
      if (sql.startsWith("SELECT requester_user_id")) return [{ requester_user_id: ownerId }];
      if (sql.startsWith("INSERT INTO ticket_comments")) return { insertId: 31 };
      return { affectedRows: 1 };
    },
  };
  const created = await createTicketComment(connection, { userId: 23 }, 55, "  It works now.  ", "public");
  assert.deepEqual(created, { commentId: 31 });
  const insert = calls.find(({ sql }) => sql.startsWith("INSERT INTO ticket_comments"));
  assert.ok(insert.sql.includes("VALUES (?, ?, ?, ?)"));
  assert.equal(insert.values[3], "It works now.");

  ownerId = 44;
  await assert.rejects(createTicketComment(connection, { userId: 23 }, 55, "cross-user", "public"), /Ticket not found/);
  permissions = [{ permission_key: "ticket.read.own" }, { permission_key: "ticket.comment.public" }];
  ownerId = 23;
  await assert.rejects(createTicketComment(connection, { userId: 23 }, 55, "private", "internal"), /internal notes/);
  assert.equal(calls.filter(({ sql }) => sql.startsWith("INSERT INTO ticket_comments")).length, 1);
});

test("requester ticket detail query excludes internal notes in SQL", async () => {
  const queries = [];
  const connection = {
    async execute(sql) {
      queries.push(sql);
      if (sql.includes("app_role_permissions")) return [{ permission_key: "ticket.read.own" }];
      if (sql.startsWith("SELECT requester_user_id")) return [{ requester_user_id: 23 }];
      if (sql.startsWith("SELECT t.ticket_number")) return [{ ticketNumber: 55 }];
      return [];
    },
  };
  const result = await getTicketDetail(connection, { userId: 23 }, 55);
  assert.equal(result.ticket.ticketNumber, 55);
  const commentsQuery = queries.find((sql) => sql.startsWith("SELECT comment_id"));
  assert.match(commentsQuery, /visibility = 'public'/);
  const activityQuery = queries.find((sql) => sql.startsWith("SELECT event_key"));
  assert.match(activityQuery, /event_key IN \('created', 'status_changed'\)/);
});

test("requester cannot read another user's ticket detail", async () => {
  let detailRead = false;
  const connection = {
    async execute(sql) {
      if (sql.includes("app_role_permissions")) return [{ permission_key: "ticket.read.own" }];
      if (sql.startsWith("SELECT requester_user_id")) return [{ requester_user_id: 90 }];
      if (sql.startsWith("SELECT t.ticket_number")) detailRead = true;
      return [];
    },
  };
  await assert.rejects(getTicketDetail(connection, { userId: 23 }, 55), /Ticket not found/);
  assert.equal(detailRead, false);
});
