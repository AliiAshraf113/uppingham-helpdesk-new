import { getDbPool } from "@/server/db/pool";
import { withDbTransaction } from "@/server/db/transaction";
import { assignTicket, createTicket, createTicketComment, getTicketDetail, listAssignableStaff as listStaff, listTicketCategories as listCategories, listTickets, transitionTicket, type TicketActor } from "./repository";
import type { TicketInput, TicketSearch, TicketStatus } from "./domain.mjs";

export function createRequesterTicket(actor: TicketActor, input: TicketInput) {
  return withDbTransaction((connection) => createTicket(connection, actor, input));
}

export async function getTickets(actor: TicketActor, query: TicketSearch) {
  const connection = await getDbPool().getConnection();
  try {
    return await listTickets(connection, actor, query);
  } finally {
    await connection.release();
  }
}

export function changeTicketStatus(actor: TicketActor, ticketNumber: number, status: TicketStatus) {
  return withDbTransaction((connection) => transitionTicket(connection, actor, ticketNumber, status));
}

export function assignTicketToStaff(actor: TicketActor, ticketNumber: number, assigneeUserId: number) {
  return withDbTransaction((connection) => assignTicket(connection, actor, ticketNumber, assigneeUserId));
}

export function addTicketComment(actor: TicketActor, ticketNumber: number, body: string, visibility: "public" | "internal") {
  return withDbTransaction((connection) => createTicketComment(connection, actor, ticketNumber, body, visibility));
}

export async function getTicket(actor: TicketActor, ticketNumber: number) {
  const connection = await getDbPool().getConnection();
  try {
    return await getTicketDetail(connection, actor, ticketNumber);
  } finally {
    await connection.release();
  }
}

export async function getTicketCategories(actor: TicketActor) {
  const connection = await getDbPool().getConnection();
  try { return await listCategories(connection, actor); } finally { await connection.release(); }
}

export async function getAssignableStaff(actor: TicketActor) {
  const connection = await getDbPool().getConnection();
  try { return await listStaff(connection, actor); } finally { await connection.release(); }
}
