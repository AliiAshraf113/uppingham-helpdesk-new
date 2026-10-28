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
    if (typeof raw.reason !== "string" || !raw.reason.trim()) {
      throw new TypeError("Retirement reason is required.");
    }

    const { retireInventoryAsset } = await import("../../../../../server/assets/service.ts");
    const result = await retireInventoryAsset({ userId: principal.userId }, assetId, raw.reason);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
