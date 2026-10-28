import type { PoolConnection } from "mariadb";
import { ForbiddenError, NotFoundError } from "../http/errors.ts";
import { canTransition, validateTicketInput, validateTicketSearch, type TicketInput, type TicketSearch, type TicketStatus } from "./domain.mjs";

export type TicketActor = { userId: number };

async function loadPermissions(connection: PoolConnection, userId: number, lockForMutation = false) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new ForbiddenError();
  const rows = await connection.execute<Array<{ permission_key: string }>>(
    `SELECT r.role_key, rp.permission_key FROM app_users u JOIN app_user_roles ur ON ur.user_id = u.user_id JOIN app_roles r ON r.role_id = ur.role_id JOIN app_role_permissions rp ON rp.role_id = r.role_id WHERE u.user_id = ? AND u.is_active = TRUE AND r.is_active = TRUE${lockForMutation ? " FOR UPDATE" : ""}`,
    [userId],
  );
  if (rows.length === 0) throw new ForbiddenError();
  return new Set(rows.map(({ permission_key }) => permission_key));
}

export async function createTicket(connection: PoolConnection, actor: TicketActor, input: TicketInput) {
  const permissions = await loadPermissions(connection, actor.userId, true);
  if (!permissions.has("ticket.create")) throw new ForbiddenError("You are not authorized to create tickets.");
  const requesterUserId = actor.userId;
  const validated = validateTicketInput(input);
  if (!validated.ok) throw new TypeError(validated.error);
  const ticket = validated.value;

  const categories = await connection.execute<{ category_id: number }[]>(
    "SELECT category_id FROM ticket_categories WHERE category_id = ? AND is_active = TRUE LIMIT 1",
    [ticket.categoryId],
  );
  if (categories.length === 0) throw new TypeError("Choose an active ticket category.");

  const assetId = ticket.assetId;
  if (assetId !== null) {
    const assets = await connection.execute<{ asset_id: number }[]>(
      "SELECT asset_id FROM assets WHERE asset_id = ? AND status <> 'retired' AND assigned_user_id = ? LIMIT 1",
      [assetId, requesterUserId],
    );
    if (assets.length === 0) throw new TypeError("Choose an available asset.");
  }

  const priorities = await connection.execute<{ priority_id: number }[]>(
    "SELECT priority_id FROM ticket_priorities WHERE priority_key = ? AND is_active = TRUE LIMIT 1",
    [ticket.priority],
  );
  if (priorities.length === 0) throw new TypeError("Choose an active priority.");
  const statuses = await connection.execute<{ status_id: number }[]>(
    "SELECT status_id FROM ticket_statuses WHERE status_key = 'new' AND is_active = TRUE LIMIT 1",
  );
  if (statuses.length === 0) throw new Error("Ticket status configuration is unavailable.");

  const result = await connection.execute<{ insertId: number | bigint }>(
    "INSERT INTO tickets (title, description, category_id, requester_user_id, asset_id, priority_id, status_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [ticket.title, ticket.description, ticket.categoryId, requesterUserId, assetId, priorities[0].priority_id, statuses[0].status_id],
  );
  const ticketNumber = Number(result.insertId);
  if (!Number.isSafeInteger(ticketNumber) || ticketNumber < 1) throw new Error("Ticket creation did not return a valid ticket number.");

  const change = JSON.stringify({ status: "new", priority: ticket.priority });
  await connection.execute(
    "INSERT INTO ticket_activity (ticket_number, actor_user_id, event_key, after_json) VALUES (?, ?, 'created', ?)",
    [ticketNumber, requesterUserId, change],
  );
  await connection.execute(
    "INSERT INTO audit_events (actor_user_id, action_key, resource_type, resource_id, after_json) VALUES (?, 'ticket.created', 'ticket', ?, ?)",
    [requesterUserId, String(ticketNumber), change],
  );
  return { ticketNumber };
}

export async function listTickets(connection: PoolConnection, actor: TicketActor, input: TicketSearch) {
  const permissions = await loadPermissions(connection, actor.userId);
  if (!permissions.has("ticket.read.all") && !permissions.has("ticket.read.own")) {
    throw new ForbiddenError();
  }
  const validated = validateTicketSearch(input);
  if (!validated.ok) throw new TypeError(validated.error);
  const { search, status, page, pageSize } = validated.value;
  const canReadAll = permissions.has("ticket.read.all");
  const conditions = canReadAll ? [] : ["t.requester_user_id = ?"];
  const values: Array<string | number> = canReadAll ? [] : [actor.userId];
  if (status) {
    conditions.push("s.status_key = ?");
    values.push(status);
  }
  if (search) {
    const escaped = search.replace(/[\\%_]/g, "\\$&");
    conditions.push("(CAST(t.ticket_number AS CHAR) LIKE ? ESCAPE '\\\\' OR t.title LIKE ? ESCAPE '\\\\')");
    values.push(`%${escaped}%`, `%${escaped}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await connection.execute<Array<Record<string, unknown>>>(
    `SELECT t.ticket_number AS ticketNumber, t.title, c.name AS category, p.display_name AS priority, s.status_key AS status, t.created_at AS createdAt, t.updated_at AS updatedAt FROM tickets t JOIN ticket_categories c ON c.category_id = t.category_id JOIN ticket_priorities p ON p.priority_id = t.priority_id JOIN ticket_statuses s ON s.status_id = t.status_id ${where} ORDER BY t.updated_at DESC, t.ticket_number DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return rows;
}

export async function transitionTicket(connection: PoolConnection, actor: TicketActor, ticketNumber: number, nextStatus: TicketStatus) {
  const permissions = await loadPermissions(connection, actor.userId, true);
  if (!permissions.has("ticket.transition")) throw new ForbiddenError("You are not authorized to manage tickets.");
  if (!Number.isSafeInteger(ticketNumber) || ticketNumber < 1) throw new TypeError("Ticket number is invalid.");
  const currentRows = await connection.execute<Array<{ status_id: number; status_key: TicketStatus }>>(
    "SELECT t.status_id, s.status_key FROM tickets t JOIN ticket_statuses s ON s.status_id = t.status_id WHERE t.ticket_number = ? FOR UPDATE",
    [ticketNumber],
  );
  const current = currentRows[0];
  if (!current) throw new NotFoundError("Ticket not found.");
  if (!canTransition(current.status_key, nextStatus)) throw new TypeError("This ticket status transition is not allowed.");
  const destinations = await connection.execute<{ status_id: number }[]>(
    "SELECT status_id FROM ticket_statuses WHERE status_key = ? AND is_active = TRUE LIMIT 1",
    [nextStatus],
  );
  if (!destinations[0]) throw new Error("Ticket status configuration is unavailable.");
  await connection.execute(
    "UPDATE tickets SET status_id = ?, resolved_at = CASE WHEN ? = 'resolved' THEN CURRENT_TIMESTAMP(3) WHEN ? = 'open' THEN NULL ELSE resolved_at END, closed_at = CASE WHEN ? = 'closed' THEN CURRENT_TIMESTAMP(3) WHEN ? = 'open' THEN NULL ELSE closed_at END WHERE ticket_number = ?",
    [destinations[0].status_id, nextStatus, nextStatus, nextStatus, nextStatus, ticketNumber],
  );
  const before = JSON.stringify({ status: current.status_key });
  const after = JSON.stringify({ status: nextStatus });
  await connection.execute(
    "INSERT INTO ticket_activity (ticket_number, actor_user_id, event_key, before_json, after_json) VALUES (?, ?, 'status_changed', ?, ?)",
    [ticketNumber, actor.userId, before, after],
  );
  await connection.execute(
    "INSERT INTO audit_events (actor_user_id, action_key, resource_type, resource_id, before_json, after_json) VALUES (?, 'ticket.status_changed', 'ticket', ?, ?, ?)",
    [actor.userId, String(ticketNumber), before, after],
  );
  return { ticketNumber, status: nextStatus };
}

async function requireTicketAccess(connection: PoolConnection, actor: TicketActor, ticketNumber: number, permissions: Set<string>) {
  if (!Number.isSafeInteger(ticketNumber) || ticketNumber < 1) throw new TypeError("Ticket number is invalid.");
  const canReadAll = permissions.has("ticket.read.all");
  if (!canReadAll && !permissions.has("ticket.read.own")) throw new ForbiddenError();
  const rows = await connection.execute<Array<{ requester_user_id: number }>>(
    "SELECT requester_user_id FROM tickets WHERE ticket_number = ? LIMIT 1",
    [ticketNumber],
  );
  if (!rows[0] || (!canReadAll && rows[0].requester_user_id !== actor.userId)) throw new NotFoundError("Ticket not found.");
}

export async function assignTicket(connection: PoolConnection, actor: TicketActor, ticketNumber: number, assigneeUserId: number) {
  const permissions = await loadPermissions(connection, actor.userId, true);
  if (!permissions.has("ticket.assign")) throw new ForbiddenError("You are not authorized to assign tickets.");
  if (!Number.isSafeInteger(ticketNumber) || ticketNumber < 1 || !Number.isSafeInteger(assigneeUserId) || assigneeUserId < 1) {
    throw new TypeError("Ticket and assignee identifiers must be positive integers.");
  }
  const ticketRows = await connection.execute<Array<{ assignee_user_id: number | null; status_key: string }>>(
    "SELECT t.assignee_user_id, s.status_key FROM tickets t JOIN ticket_statuses s ON s.status_id = t.status_id WHERE t.ticket_number = ? FOR UPDATE",
    [ticketNumber],
  );
  const ticket = ticketRows[0];
  if (!ticket) throw new NotFoundError("Ticket not found.");
  if (ticket.status_key === "closed") throw new TypeError("Closed tickets cannot be assigned.");
  const users = await connection.execute<Array<{ user_id: number }>>(
    "SELECT u.user_id FROM app_users u JOIN app_user_roles ur ON ur.user_id = u.user_id JOIN app_roles r ON r.role_id = ur.role_id WHERE u.user_id = ? AND u.is_active = TRUE AND r.is_active = TRUE AND r.role_key IN ('it_technician', 'admin') LIMIT 1",
    [assigneeUserId],
  );
  if (!users[0]) throw new TypeError("Select an active IT staff member.");
  await connection.execute("UPDATE tickets SET assignee_user_id = ? WHERE ticket_number = ?", [assigneeUserId, ticketNumber]);
  const before = JSON.stringify({ assigneeUserId: ticket.assignee_user_id });
  const after = JSON.stringify({ assigneeUserId });
  await connection.execute(
    "INSERT INTO ticket_activity (ticket_number, actor_user_id, event_key, before_json, after_json) VALUES (?, ?, 'assigned', ?, ?)",
    [ticketNumber, actor.userId, before, after],
  );
  await connection.execute(
    "INSERT INTO audit_events (actor_user_id, action_key, resource_type, resource_id, before_json, after_json) VALUES (?, 'ticket.assigned', 'ticket', ?, ?, ?)",
    [actor.userId, String(ticketNumber), before, after],
  );
  return { ticketNumber, assigneeUserId };
}

export async function createTicketComment(connection: PoolConnection, actor: TicketActor, ticketNumber: number, body: string, visibility: "public" | "internal") {
  const permissions = await loadPermissions(connection, actor.userId, true);
  await requireTicketAccess(connection, actor, ticketNumber, permissions);
  if (visibility === "public" && !permissions.has("ticket.comment.public")) throw new ForbiddenError("You are not authorized to reply to tickets.");
  if (visibility === "internal" && !permissions.has("ticket.note.internal.create")) throw new ForbiddenError("You are not authorized to add internal notes.");
  const cleanBody = typeof body === "string" ? body.trim() : "";
  if (!cleanBody || cleanBody.length > 10_000) throw new TypeError("Comment must contain 1 to 10,000 characters.");
  if (visibility !== "public" && visibility !== "internal") throw new TypeError("Comment visibility is invalid.");
  const result = await connection.execute<{ insertId: number | bigint }>(
    "INSERT INTO ticket_comments (ticket_number, author_user_id, visibility, body) VALUES (?, ?, ?, ?)",
    [ticketNumber, actor.userId, visibility, cleanBody],
  );
  const commentId = Number(result.insertId);
  const event = JSON.stringify({ visibility, commentId });
  await connection.execute(
    "INSERT INTO ticket_activity (ticket_number, actor_user_id, event_key, after_json) VALUES (?, ?, 'comment_added', ?)",
    [ticketNumber, actor.userId, event],
  );
  await connection.execute(
    "INSERT INTO audit_events (actor_user_id, action_key, resource_type, resource_id, after_json) VALUES (?, 'ticket.comment_added', 'ticket', ?, ?)",
    [actor.userId, String(ticketNumber), event],
  );
  return { commentId };
}

export async function getTicketDetail(connection: PoolConnection, actor: TicketActor, ticketNumber: number) {
  const permissions = await loadPermissions(connection, actor.userId);
  await requireTicketAccess(connection, actor, ticketNumber, permissions);
  const tickets = await connection.execute<Array<Record<string, unknown>>>(
    "SELECT t.ticket_number AS ticketNumber, t.title, t.description, requester.display_name AS requesterName, assignee.display_name AS assigneeName, c.name AS category, p.priority_key AS priority, s.status_key AS status, t.created_at AS createdAt, t.updated_at AS updatedAt FROM tickets t JOIN ticket_categories c ON c.category_id = t.category_id JOIN ticket_priorities p ON p.priority_id = t.priority_id JOIN ticket_statuses s ON s.status_id = t.status_id JOIN app_users requester ON requester.user_id = t.requester_user_id LEFT JOIN app_users assignee ON assignee.user_id = t.assignee_user_id WHERE t.ticket_number = ? LIMIT 1",
    [ticketNumber],
  );
  if (!tickets[0]) throw new NotFoundError("Ticket not found.");
  const comments = permissions.has("ticket.note.internal.read")
    ? await connection.execute<Array<Record<string, unknown>>>("SELECT comment_id AS commentId, author_user_id AS authorUserId, visibility, body, created_at AS createdAt FROM ticket_comments WHERE ticket_number = ? ORDER BY created_at, comment_id", [ticketNumber])
    : await connection.execute<Array<Record<string, unknown>>>("SELECT comment_id AS commentId, author_user_id AS authorUserId, visibility, body, created_at AS createdAt FROM ticket_comments WHERE ticket_number = ? AND visibility = 'public' ORDER BY created_at, comment_id", [ticketNumber]);
  const activity = permissions.has("ticket.read.all")
    ? await connection.execute<Array<Record<string, unknown>>>("SELECT event_key AS event, before_json AS beforeState, after_json AS afterState, created_at AS createdAt FROM ticket_activity WHERE ticket_number = ? ORDER BY created_at, activity_id", [ticketNumber])
    : await connection.execute<Array<Record<string, unknown>>>("SELECT event_key AS event, before_json AS beforeState, after_json AS afterState, created_at AS createdAt FROM ticket_activity WHERE ticket_number = ? AND event_key IN ('created', 'status_changed') ORDER BY created_at, activity_id", [ticketNumber]);
  return { ticket: tickets[0], comments, activity };
}

export async function listTicketCategories(connection: PoolConnection, actor: TicketActor) {
  const permissions = await loadPermissions(connection, actor.userId);
  if (!permissions.has("ticket.create")) throw new ForbiddenError("You are not authorized to create tickets.");
  return connection.execute<Array<{ categoryId: number; name: string }>>(
    "SELECT category_id AS categoryId, name FROM ticket_categories WHERE is_active = TRUE ORDER BY sort_order, name",
  );
}

export async function listAssignableStaff(connection: PoolConnection, actor: TicketActor) {
  const permissions = await loadPermissions(connection, actor.userId);
  if (!permissions.has("ticket.assign")) throw new ForbiddenError("You are not authorized to assign tickets.");
  return connection.execute<Array<{ userId: number; displayName: string }>>(
    "SELECT DISTINCT u.user_id AS userId, u.display_name AS displayName FROM app_users u JOIN app_user_roles ur ON ur.user_id = u.user_id JOIN app_roles r ON r.role_id = ur.role_id WHERE u.is_active = TRUE AND r.is_active = TRUE AND r.role_key IN ('it_technician', 'admin') ORDER BY u.display_name",
  );
}
