import { apiErrorResponse } from "../../../server/http/errors.ts";
import { queryParams, readJsonRequest, requireSameOriginMutation } from "../../../server/http/request.ts";
import { requireAuthenticatedPrincipal } from "../../../server/auth/principal.ts";
import type { TicketInput, TicketSearch } from "@/server/tickets/domain.mjs";

export async function GET(request: Request) {
  try {
    const principal = await requireAuthenticatedPrincipal();
    const params = queryParams(new URL(request.url).searchParams, ["search", "status", "page"]);
    const { getTickets } = await import("../../../server/tickets/service.ts");
    const tickets = await getTickets({ userId: principal.userId }, params as TicketSearch);
    return Response.json({ tickets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAuthenticatedPrincipal();
    requireSameOriginMutation(request);
    const raw = await readJsonRequest<Record<string, unknown>>(request);
    if (Object.keys(raw).some((key) => !["title", "description", "categoryId", "priority", "assetId"].includes(key))) {
      throw new TypeError("Ticket fields are invalid.");
    }
    const input: TicketInput = {
      title: typeof raw.title === "string" ? raw.title : "",
      description: typeof raw.description === "string" ? raw.description : "",
      categoryId: typeof raw.categoryId === "number" || typeof raw.categoryId === "string" ? raw.categoryId : "",
      priority: typeof raw.priority === "string" ? raw.priority as TicketInput["priority"] : "invalid" as TicketInput["priority"],
      assetId: typeof raw.assetId === "number" || typeof raw.assetId === "string" ? raw.assetId : null,
    };
    const { createRequesterTicket } = await import("../../../server/tickets/service.ts");
    const created = await createRequesterTicket({ userId: principal.userId }, input);
    return Response.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
