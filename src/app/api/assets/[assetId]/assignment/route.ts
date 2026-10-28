import { requireAuthenticatedPrincipal } from "../../../../../server/auth/principal.ts";
import { apiErrorResponse } from "../../../../../server/http/errors.ts";
import { readJsonRequest, requireSameOriginMutation } from "../../../../../server/http/request.ts";

export async function POST(request: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    const principal = await requireAuthenticatedPrincipal();
    requireSameOriginMutation(request);
    const { assetId: rawId } = await context.params;
    if (!/^[1-9]\d{0,15}$/.test(rawId)) throw new TypeError("Asset identifier is invalid.");
    const assetId = Number(rawId);
    if (!Number.isSafeInteger(assetId)) throw new TypeError("Asset identifier is invalid.");

    const raw = await readJsonRequest<Record<string, unknown>>(request);
    let assigneeUserId: number | null = null;
    if (raw.assigneeUserId !== null && raw.assigneeUserId !== undefined && raw.assigneeUserId !== "") {
      assigneeUserId = Number(raw.assigneeUserId);
      if (!Number.isSafeInteger(assigneeUserId) || assigneeUserId < 1) {
        throw new TypeError("Assignee user identifier must be a positive integer.");
      }
    }

    const { assignInventoryAsset } = await import("../../../../../server/assets/service.ts");
    const result = await assignInventoryAsset({ userId: principal.userId }, assetId, assigneeUserId);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
