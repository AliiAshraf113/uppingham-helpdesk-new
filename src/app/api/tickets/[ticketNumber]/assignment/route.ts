import { apiErrorResponse } from "../../../../../server/http/errors.ts";
import { readJsonRequest, requireSameOriginMutation } from "../../../../../server/http/request.ts";
import { requireAuthenticatedPrincipal } from "../../../../../server/auth/principal.ts";

type RouteContext = { params: Promise<{ ticketNumber: string }> };

function parseTicketNumber(value: string) {
  if (!/^[1-9]\d{0,15}$/.test(value)) throw new TypeError("Ticket number is invalid.");
  return Number(value);
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const principal = await requireAuthenticatedPrincipal();
    requireSameOriginMutation(request);
    const { ticketNumber } = await context.params;
    const raw = await readJsonRequest<Record<string, unknown>>(request);
    if (Object.keys(raw).some((key) => key !== "assigneeUserId") || !Number.isSafeInteger(raw.assigneeUserId) || Number(raw.assigneeUserId) < 1) {
      throw new TypeError("A valid assigneeUserId is required.");
    }
    const { assignTicketToStaff } = await import("../../../../../server/tickets/service.ts");
    const result = await assignTicketToStaff({ userId: principal.userId }, parseTicketNumber(ticketNumber), Number(raw.assigneeUserId));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
