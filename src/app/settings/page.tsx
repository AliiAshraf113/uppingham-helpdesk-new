import { requireAuthenticatedPrincipal } from "../../server/auth/principal";
import { AuthenticationUnavailableError, ForbiddenError, UnauthenticatedError } from "../../server/http/errors";
import { SignInButton } from "../components/auth-controls";
import { AppHeader } from "../components/app-header";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
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
          <h1 className="mt-5 text-3xl font-semibold">Administration</h1>
          <section role="status" className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
            <h2 className="font-semibold">{unavailable ? "Sign-in is not configured" : denied ? "Helpdesk access is not assigned" : error instanceof UnauthenticatedError ? "Sign in to view administration" : "Administration is unavailable"}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{unavailable ? "Entra sign-in settings are required before reference data can be loaded." : denied ? "Your local account does not have an active Helpdesk role." : error instanceof UnauthenticatedError ? "Administration is protected. Sign in with an approved administrator account." : "The administrative service could not be reached."}</p>
            {error instanceof UnauthenticatedError && <div className="mt-4"><SignInButton /></div>}
          </section>
        </div>
      </main>
    );
  }

  const canManage = principal.permissions.includes("settings.manage");
  if (!canManage) {
    return (
      <main className="min-h-screen">
        <AppHeader user={principal} />
        <div className="mx-auto max-w-5xl px-6 py-12">
          <a href="/helpdesk">← Helpdesk home</a>
          <h1 className="mt-5 text-3xl font-semibold">Administration</h1>
          <p role="status" className="mt-6 rounded-xl bg-white p-6">Your account is not permitted to manage administrative reference data.</p>
        </div>
      </main>
    );
  }

  type AdminData = {
    categories: Array<{ id: number; keyName: string; name: string; isActive: boolean | number }>;
    departments: Array<{ id: number; keyName: string; name: string; isActive: boolean | number }>;
    buildings: Array<{ id: number; keyName: string; name: string; isActive: boolean | number }>;
    assetTypes: Array<{ id: number; keyName: string; name: string; isActive: boolean | number }>;
  };
  let data: AdminData | null = null;
  let loadError = false;
  try {
    const { getAdminReferenceData } = await import("../../server/admin/service");
    const result = await getAdminReferenceData({ userId: principal.userId });
    data = result as unknown as AdminData;
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
            <h1 className="mt-2 text-3xl font-semibold">IT Service Administration</h1>
          </div>
        </div>

        {loadError ? (
          <section className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
            <p role="alert" className="text-sm text-red-800">Administrative reference data could not be loaded. Try again later.</p>
          </section>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <section className="rounded-xl border border-[var(--color-line)] bg-white p-6">
              <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
                <h2 className="text-lg font-semibold">Ticket Categories</h2>
                <span className="text-xs text-[var(--color-muted)]">{data?.categories.length ?? 0} active</span>
              </div>
              <ul className="mt-4 divide-y divide-[var(--color-line)]">
                {data?.categories.map((cat) => (
                  <li key={cat.id} className="py-2.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-[var(--color-ink)]">{cat.name}</span>
                    <span className="text-xs text-[var(--color-muted)] font-mono">{cat.keyName}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-[var(--color-line)] bg-white p-6">
              <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
                <h2 className="text-lg font-semibold">Asset Types</h2>
                <span className="text-xs text-[var(--color-muted)]">{data?.assetTypes.length ?? 0} active</span>
              </div>
              <ul className="mt-4 divide-y divide-[var(--color-line)]">
                {data?.assetTypes.map((type) => (
                  <li key={type.id} className="py-2.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-[var(--color-ink)]">{type.name}</span>
                    <span className="text-xs text-[var(--color-muted)] font-mono">{type.keyName}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-[var(--color-line)] bg-white p-6">
              <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
                <h2 className="text-lg font-semibold">Departments</h2>
                <span className="text-xs text-[var(--color-muted)]">{data?.departments.length ?? 0} configured</span>
              </div>
              <ul className="mt-4 divide-y divide-[var(--color-line)]">
                {data?.departments.map((dept) => (
                  <li key={dept.id} className="py-2.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-[var(--color-ink)]">{dept.name}</span>
                    <span className="text-xs text-[var(--color-muted)] font-mono">{dept.keyName}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-[var(--color-line)] bg-white p-6">
              <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
                <h2 className="text-lg font-semibold">Buildings & Facilities</h2>
                <span className="text-xs text-[var(--color-muted)]">{data?.buildings.length ?? 0} configured</span>
              </div>
              <ul className="mt-4 divide-y divide-[var(--color-line)]">
                {data?.buildings.map((bldg) => (
                  <li key={bldg.id} className="py-2.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-[var(--color-ink)]">{bldg.name}</span>
                    <span className="text-xs text-[var(--color-muted)] font-mono">{bldg.keyName}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        <section className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
          <h2 className="text-lg font-semibold">Administration Scope Notice</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Reference definitions above are populated from the central IT catalog and schema migrations. In accordance with safety policies, user role promotions and reference data modifications must follow database change review protocols and are not mutated ad-hoc from the web client.
          </p>
        </section>
      </div>
    </main>
  );
}
