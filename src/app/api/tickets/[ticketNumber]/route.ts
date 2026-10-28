import { apiErrorResponse } from "../../../../server/http/errors.ts";
import { requireAuthenticatedPrincipal } from "../../../../server/auth/principal.ts";

type RouteContext = { params: Promise<{ ticketNumber: string }> };

function parseTicketNumber(value: string) {
  if (!/^[1-9]\d{0,15}$/.test(value)) throw new TypeError("Ticket number is invalid.");
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new TypeError("Ticket number is invalid.");
  return number;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const principal = await requireAuthenticatedPrincipal();
    const { ticketNumber } = await context.params;
    const { getTicket } = await import("../../../../server/tickets/service.ts");
    const ticket = await getTicket({ userId: principal.userId }, parseTicketNumber(ticketNumber));
    return Response.json(ticket, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
