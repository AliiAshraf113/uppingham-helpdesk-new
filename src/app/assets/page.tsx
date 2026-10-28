import { requireAuthenticatedPrincipal } from "../../server/auth/principal";
import { AuthenticationUnavailableError, ForbiddenError, UnauthenticatedError } from "../../server/http/errors";
import { SignInButton } from "../components/auth-controls";
import { AppHeader } from "../components/app-header";
import { AssetCreateForm } from "../components/asset-create-form";
import { AssetActions } from "../components/asset-actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ search?: string; status?: string; page?: string }>;

export default async function AssetsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  let principal;
  try {
    principal = await requireAuthenticatedPrincipal();
  } catch (error) {
    const unavailable = error instanceof AuthenticationUnavailableError;
    const denied = error instanceof ForbiddenError;
    return (
      <main className="min-h-screen">
        <AppHeader />
        <div className="mx-auto max-w-5xl px-6 py-12">
          <a className="text-sm text-[var(--color-brand)]" href="/helpdesk">← Helpdesk home</a>
          <h1 className="mt-5 text-3xl font-semibold">Assets</h1>
          <section role="status" className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
            <h2 className="font-semibold">{unavailable ? "Sign-in is not configured" : denied ? "Helpdesk access is not assigned" : error instanceof UnauthenticatedError ? "Sign in to view assets" : "Assets are unavailable"}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{unavailable ? "Entra sign-in settings are required before asset inventory can be loaded." : denied ? "Your local account does not have an active Helpdesk role." : error instanceof UnauthenticatedError ? "Asset inventory is protected. Sign in with an approved local Helpdesk account." : "The asset service could not be reached. No asset data was displayed."}</p>
            {error instanceof UnauthenticatedError && <div className="mt-4"><SignInButton /></div>}
          </section>
        </div>
      </main>
    );
  }

  const canRead = principal.permissions.includes("asset.read");
  const canManage = principal.permissions.includes("asset.manage");
  if (!canRead) {
    return (
      <main className="min-h-screen">
        <AppHeader user={principal} />
        <div className="mx-auto max-w-5xl px-6 py-12">
          <a href="/helpdesk">← Helpdesk home</a>
          <h1 className="mt-5 text-3xl font-semibold">Assets</h1>
          <p role="status" className="mt-6 rounded-xl bg-white p-6">Your account is not permitted to view assets.</p>
        </div>
      </main>
    );
  }

  const query = { search: params.search ?? "", status: params.status ?? "", page: params.page ?? "1" };
  const pageNumber = Number(query.page);
  let rows: Array<{ assetId: number; assetTag: string; serialNumber: string; manufacturer: string; model: string; assetType: string; status: string; assignedUserId: number | null; updatedAt: Date | string }> = [];
  let assetTypes: Array<{ id: number; keyName: string; name: string }> = [];
  let assignableUsers: Array<{ userId: number; displayName: string }> = [];
  let loadError = false;

  try {
    const { getAssets, getAssetTypes, getAssignableUsers } = await import("../../server/assets/service");
    rows = await getAssets({ userId: principal.userId }, query) as typeof rows;
    if (canManage) {
      const [types, users] = await Promise.all([
        getAssetTypes({ userId: principal.userId }),
        getAssignableUsers({ userId: principal.userId }),
      ]);
      assetTypes = types;
      assignableUsers = users;
    }
  } catch {
    loadError = true;
  }

  return (
    <main className="min-h-screen">
      <AppHeader user={principal} />
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <a className="text-sm text-[var(--color-brand)]" href="/helpdesk">← Helpdesk home</a>
            <h1 className="mt-2 text-3xl font-semibold">Equipment & Assets</h1>
          </div>
        </div>

        {canManage && (
          <section className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
            <h2 className="text-xl font-semibold">Register New Asset</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Add school devices, workstations, or peripherals to inventory.</p>
            {assetTypes.length > 0 ? (
              <AssetCreateForm assetTypes={assetTypes} />
            ) : (
              <p className="mt-3 text-sm text-[var(--color-muted)]">No active asset types available.</p>
            )}
          </section>
        )}

        <section className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
          <h2 className="text-xl font-semibold">Asset Inventory</h2>
          <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              Search tag, serial or model
              <input name="search" defaultValue={query.search} maxLength={100} className="rounded-md border border-[var(--color-line)] px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm">
              Status
              <select name="status" defaultValue={query.status} className="rounded-md border border-[var(--color-line)] px-3 py-2">
                <option value="">Any status</option>
                {["in_stock", "assigned", "maintenance", "retired"].map((status) => (
                  <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <button className="rounded-lg border border-[var(--color-line)] px-4 py-2 font-semibold">Search</button>
          </form>

          {loadError ? (
            <p role="alert" className="mt-5 text-sm text-red-800">Asset inventory could not be loaded. Try again later.</p>
          ) : rows.length === 0 ? (
            <p className="mt-5 text-sm text-[var(--color-muted)]">No assets matched this view.</p>
          ) : (
            <div className="mt-5 divide-y divide-[var(--color-line)]">
              {rows.map((asset) => (
                <div key={asset.assetId} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <strong className="text-base">{asset.assetTag} · {asset.manufacturer} {asset.model}</strong>
                      <span className="mt-1 block text-sm text-[var(--color-muted)]">
                        Serial: {asset.serialNumber || "None"} · Type: {asset.assetType} · Status:{" "}
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                          asset.status === "in_stock"
                            ? "bg-blue-100 text-blue-800"
                            : asset.status === "assigned"
                            ? "bg-emerald-100 text-emerald-800"
                            : asset.status === "maintenance"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-gray-100 text-gray-800"
                        }`}>
                          {asset.status.replaceAll("_", " ")}
                        </span>
                      </span>
                    </div>
                    <time className="text-sm text-[var(--color-muted)]">Updated: {new Date(asset.updatedAt).toLocaleDateString()}</time>
                  </div>

                  {canManage && (
                    <AssetActions
                      asset={asset}
                      users={assignableUsers}
                      canManage={canManage}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {!loadError && rows.length > 0 && (
            <nav aria-label="Asset pages" className="mt-4 flex items-center justify-between border-t border-[var(--color-line)] pt-4 text-sm">
              <span className="text-[var(--color-muted)]">Page {pageNumber}</span>
              <div className="flex gap-3">
                {pageNumber > 1 && <a className="font-semibold text-[var(--color-brand)]" href={`/helpdesk/assets?search=${encodeURIComponent(query.search)}&status=${encodeURIComponent(query.status)}&page=${pageNumber - 1}`}>Previous</a>}
                {rows.length === 25 && <a className="font-semibold text-[var(--color-brand)]" href={`/helpdesk/assets?search=${encodeURIComponent(query.search)}&status=${encodeURIComponent(query.status)}&page=${pageNumber + 1}`}>Next</a>}
              </div>
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
