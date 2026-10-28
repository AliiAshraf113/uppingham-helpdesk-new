import { requireAuthenticatedPrincipal } from "../../../../../server/auth/principal.ts";
import { apiErrorResponse } from "../../../../../server/http/errors.ts";
import { requireSameOriginMutation } from "../../../../../server/http/request.ts";

export async function POST(request: Request, context: { params: Promise<{ notificationId: string }> }) {
  try {
    const principal = await requireAuthenticatedPrincipal();
    requireSameOriginMutation(request);
    const { notificationId: rawId } = await context.params;
    if (!/^[1-9]\d{0,15}$/.test(rawId)) throw new TypeError("Notification identifier is invalid.");
    const notificationId = Number(rawId);
    if (!Number.isSafeInteger(notificationId)) throw new TypeError("Notification identifier is invalid.");
    const { markMyNotificationRead } = await import("../../../../../server/notifications/service.ts");
    const result = await markMyNotificationRead({ userId: principal.userId }, notificationId);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
