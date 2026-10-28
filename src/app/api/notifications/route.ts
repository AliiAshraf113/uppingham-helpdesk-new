import { requireAuthenticatedPrincipal } from "../../../server/auth/principal.ts";
import { apiErrorResponse } from "../../../server/http/errors.ts";
import { queryParams } from "../../../server/http/request.ts";

export async function GET(request: Request) {
  try {
    const principal = await requireAuthenticatedPrincipal();
    const params = queryParams(new URL(request.url).searchParams, ["page"]);
    const page = params.page === undefined ? 1 : Number(params.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) throw new TypeError("Page must be between 1 and 10,000.");
    const { listMyNotifications } = await import("../../../server/notifications/service.ts");
    const notifications = await listMyNotifications({ userId: principal.userId }, page);
    return Response.json({ notifications }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
