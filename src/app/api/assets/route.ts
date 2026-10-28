import { requireAuthenticatedPrincipal } from "../../../server/auth/principal.ts";
import { apiErrorResponse } from "../../../server/http/errors.ts";
import { queryParams, readJsonRequest, requireSameOriginMutation } from "../../../server/http/request.ts";

export async function GET(request: Request) {
  try {
    const principal = await requireAuthenticatedPrincipal();
    const params = queryParams(new URL(request.url).searchParams, ["search", "status", "page"]);
    const { getAssets } = await import("../../../server/assets/service.ts");
    const assets = await getAssets({ userId: principal.userId }, params);
    return Response.json({ assets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAuthenticatedPrincipal();
    requireSameOriginMutation(request);
    const raw = await readJsonRequest<Record<string, unknown>>(request);
    if (Object.keys(raw).some((key) => !["assetTag", "assetTypeId", "serialNumber", "manufacturer", "model", "purchaseDate", "warrantyExpiresOn"].includes(key))) {
      throw new TypeError("Asset fields are invalid.");
    }
    const { addAsset } = await import("../../../server/assets/service.ts");
    const created = await addAsset({ userId: principal.userId }, raw);
    return Response.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
