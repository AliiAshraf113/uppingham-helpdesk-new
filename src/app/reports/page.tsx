import { requireAuthenticatedPrincipal } from "../../server/auth/principal";
import { AuthenticationUnavailableError, ForbiddenError, UnauthenticatedError } from "../../server/http/errors";
import { SignInButton } from "../components/auth-controls";
import { AppHeader } from "../components/app-header";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
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
          <h1 className="mt-5 text-3xl font-semibold">Reports</h1>
          <section role="status" className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
            <h2 className="font-semibold">{unavailable ? "Sign-in is not configured" : denied ? "Helpdesk access is not assigned" : error instanceof UnauthenticatedError ? "Sign in to view reports" : "Reports are unavailable"}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{unavailable ? "Entra sign-in settings are required before reports can be loaded." : denied ? "Your local account does not have an active Helpdesk role." : error instanceof UnauthenticatedError ? "Reports are protected. Sign in with an approved local Helpdesk account." : "The report service could not be reached."}</p>
            {error instanceof UnauthenticatedError && <div className="mt-4"><SignInButton /></div>}
          </section>
        </div>
      </main>
    );
  }

  const canRead = principal.permissions.includes("report.read");
  if (!canRead) {
    return (
      <main className="min-h-screen">
        <AppHeader user={principal} />
        <div className="mx-auto max-w-5xl px-6 py-12">
          <a href="/helpdesk">← Helpdesk home</a>
          <h1 className="mt-5 text-3xl font-semibold">Reports</h1>
          <p role="status" className="mt-6 rounded-xl bg-white p-6">Your account is not permitted to view reports.</p>
        </div>
      </main>
    );
  }

  let summary: Array<{ status: string; ticketCount: number | string }> = [];
  let loadError = false;
  try {
    const { getTicketStatusSummary } = await import("../../server/reports/service");
    summary = (await getTicketStatusSummary({ userId: principal.userId })) as typeof summary;
  } catch {
    loadError = true;
  }

  const totalTickets = summary.reduce((sum, item) => sum + Number(item.ticketCount), 0);

  return (
    <main className="min-h-screen">
      <AppHeader user={principal} />
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <a className="text-sm text-[var(--color-brand)]" href="/helpdesk">← Helpdesk home</a>
            <h1 className="mt-2 text-3xl font-semibold">Service Reports</h1>
          </div>
        </div>

        <section className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-line)] pb-4">
            <div>
              <h2 className="text-xl font-semibold">Ticket Volume by Status</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">Live aggregate metrics across all active and resolved requests.</p>
            </div>
            {!loadError && (
              <span className="text-sm font-semibold bg-slate-100 text-slate-800 px-3 py-1 rounded-full">
                Total: {totalTickets} tickets
              </span>
            )}
          </div>

          {loadError ? (
            <p role="alert" className="mt-5 text-sm text-red-800">Report data could not be loaded. Try again later.</p>
          ) : summary.length === 0 ? (
            <p className="mt-5 text-sm text-[var(--color-muted)]">No ticket records found.</p>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {summary.map((row) => {
                const count = Number(row.ticketCount);
                const pct = totalTickets > 0 ? Math.round((count / totalTickets) * 100) : 0;
                return (
                  <div key={row.status} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">
                          {row.status.replaceAll("_", " ")}
                        </span>
                        <span className="text-xs font-semibold text-[var(--color-brand)]">{pct}%</span>
                      </div>
                      <p className="mt-3 text-3xl font-bold text-[var(--color-ink)]">{count}</p>
                    </div>
                    <div className="mt-4 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-brand)] rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
          <h2 className="text-lg font-semibold">Report Audit & Boundary Note</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            In compliance with student and staff data confidentiality policies, service reports aggregate status metrics at the database level and never expose ticket descriptions, internal notes, or identifiable requester information through report queries.
          </p>
        </section>
      </div>
    </main>
  );
}
