import { apiErrorResponse } from "../../../../../server/http/errors.ts";
import { readJsonRequest, requireSameOriginMutation } from "../../../../../server/http/request.ts";
import { requireAuthenticatedPrincipal } from "../../../../../server/auth/principal.ts";
import { TICKET_STATUSES, type TicketStatus } from "../../../../../server/tickets/domain.mjs";

type RouteContext = { params: Promise<{ ticketNumber: string }> };

function parseTicketNumber(value: string) {
  if (!/^[1-9]\d{0,15}$/.test(value)) throw new TypeError("Ticket number is invalid.");
  return Number(value);
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const principal = await requireAuthenticatedPrincipal();
    requireSameOriginMutation(request);
    const { ticketNumber } = await context.params;
    const raw = await readJsonRequest<Record<string, unknown>>(request);
    if (Object.keys(raw).some((key) => key !== "status") || typeof raw.status !== "string" || !TICKET_STATUSES.includes(raw.status as TicketStatus)) {
      throw new TypeError("A valid status is required.");
    }
    const { changeTicketStatus } = await import("../../../../../server/tickets/service.ts");
    const result = await changeTicketStatus({ userId: principal.userId }, parseTicketNumber(ticketNumber), raw.status as TicketStatus);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
