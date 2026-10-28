import { requireAuthenticatedPrincipal } from "../../../../server/auth/principal.ts";
import { apiErrorResponse } from "../../../../server/http/errors.ts";

export async function GET() {
  try {
    const principal = await requireAuthenticatedPrincipal();
    const { getAdminReferenceData } = await import("../../../../server/admin/service.ts");
    const data = await getAdminReferenceData({ userId: principal.userId });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
