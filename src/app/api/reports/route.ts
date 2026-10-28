import { requireAuthenticatedPrincipal } from "../../../server/auth/principal.ts";
import { apiErrorResponse } from "../../../server/http/errors.ts";

export async function GET() {
  try {
    const principal = await requireAuthenticatedPrincipal();
    const { getTicketStatusSummary } = await import("../../../server/reports/service.ts");
    const summary = await getTicketStatusSummary({ userId: principal.userId });
    return Response.json({ summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
