import { requireAuthenticatedPrincipal } from "../../server/auth/principal";
import { AuthenticationUnavailableError, ForbiddenError, UnauthenticatedError } from "../../server/http/errors";
import { SignInButton } from "../components/auth-controls";
import { AppHeader } from "../components/app-header";
import { TicketCreateForm } from "../components/ticket-create-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ search?: string; status?: string; page?: string }>;

export default async function TicketsPage({ searchParams }: { searchParams: SearchParams }) {
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
          <h1 className="mt-5 text-3xl font-semibold">Tickets</h1>
          <section role="status" className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
            <h2 className="font-semibold">{unavailable ? "Sign-in is not configured" : denied ? "Helpdesk access is not assigned" : error instanceof UnauthenticatedError ? "Sign in to view tickets" : "Tickets are unavailable"}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{unavailable ? "Entra sign-in settings are required before ticket data can be loaded." : denied ? "Your local account does not have an active Helpdesk role." : error instanceof UnauthenticatedError ? "Ticket data is protected. Sign in with an approved local Helpdesk account." : "The ticket service could not be reached. No ticket data was displayed."}</p>
            {error instanceof UnauthenticatedError && <div className="mt-4"><SignInButton /></div>}
          </section>
        </div>
      </main>
    );
  }

  const canRead = principal.permissions.includes("ticket.read.all") || principal.permissions.includes("ticket.read.own");
  const canCreate = principal.permissions.includes("ticket.create");
  if (!canRead) {
    return (
      <main className="min-h-screen">
        <AppHeader user={principal} />
        <div className="mx-auto max-w-5xl px-6 py-12">
          <a href="/helpdesk">← Helpdesk home</a>
          <h1 className="mt-5 text-3xl font-semibold">Tickets</h1>
          <p role="status" className="mt-6 rounded-xl bg-white p-6">Your account is not permitted to view tickets.</p>
        </div>
      </main>
    );
  }

  const query = { search: params.search ?? "", status: params.status ?? "", page: params.page ?? "1" };
  const pageNumber = Number(query.page);
  let rows: Array<{ ticketNumber: number; title: string; category: string; priority: string; status: string; updatedAt: Date | string }> = [];
  let loadError = false;
  let categories: Array<{ categoryId: number; name: string }> = [];
  try {
    const { getTickets, getTicketCategories } = await import("../../server/tickets/service");
    rows = (await getTickets({ userId: principal.userId }, query)) as typeof rows;
    if (canCreate) categories = await getTicketCategories({ userId: principal.userId });
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
            <h1 className="mt-2 text-3xl font-semibold">IT Tickets</h1>
          </div>
        </div>

        {canCreate && (
          <section className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
            <h2 className="text-xl font-semibold">Create a ticket</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Submit a request to the Uppingham IT support team.</p>
            {categories.length ? (
              <TicketCreateForm categories={categories} />
            ) : (
              <p className="mt-3 text-sm text-[var(--color-muted)]">No active categories are configured, or the category service is unavailable.</p>
            )}
          </section>
        )}

        <section className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
          <h2 className="text-xl font-semibold">Find tickets</h2>
          <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              Search title or number
              <input name="search" defaultValue={query.search} maxLength={100} className="rounded-md border border-[var(--color-line)] px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm">
              Status
              <select name="status" defaultValue={query.status} className="rounded-md border border-[var(--color-line)] px-3 py-2">
                <option value="">Any status</option>
                {["new", "open", "in_progress", "pending", "resolved", "closed"].map((status) => (
                  <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <button className="rounded-lg border border-[var(--color-line)] px-4 py-2 font-semibold">Search</button>
          </form>

          {loadError ? (
            <p role="alert" className="mt-5 text-sm text-red-800">Ticket data could not be loaded. Try again later.</p>
          ) : rows.length === 0 ? (
            <p className="mt-5 text-sm text-[var(--color-muted)]">No tickets matched this view.</p>
          ) : (
            <div className="mt-5 divide-y divide-[var(--color-line)]">
              {rows.map((ticket) => (
                <a
                  key={ticket.ticketNumber}
                  href={`/helpdesk/tickets/${ticket.ticketNumber}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-4 hover:text-[var(--color-brand)] transition"
                >
                  <div>
                    <strong className="text-base">#{ticket.ticketNumber} · {ticket.title}</strong>
                    <span className="mt-1 block text-sm text-[var(--color-muted)]">
                      {ticket.category} · Priority: {ticket.priority} · Status:{" "}
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                        ticket.status === "new"
                          ? "bg-purple-100 text-purple-800"
                          : ticket.status === "open"
                          ? "bg-blue-100 text-blue-800"
                          : ticket.status === "in_progress"
                          ? "bg-amber-100 text-amber-800"
                          : ticket.status === "pending"
                          ? "bg-yellow-100 text-yellow-800"
                          : ticket.status === "resolved"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-gray-100 text-gray-800"
                      }`}>
                        {ticket.status.replaceAll("_", " ")}
                      </span>
                    </span>
                  </div>
                  <time className="text-sm text-[var(--color-muted)]">{new Date(ticket.updatedAt).toLocaleString()}</time>
                </a>
              ))}
            </div>
          )}

          {!loadError && rows.length > 0 && (
            <nav aria-label="Ticket pages" className="mt-4 flex items-center justify-between border-t border-[var(--color-line)] pt-4 text-sm">
              <span className="text-[var(--color-muted)]">Page {pageNumber}</span>
              <div className="flex gap-3">
                {pageNumber > 1 && <a className="font-semibold text-[var(--color-brand)]" href={`/helpdesk/tickets?search=${encodeURIComponent(query.search)}&status=${encodeURIComponent(query.status)}&page=${pageNumber - 1}`}>Previous</a>}
                {rows.length === 25 && <a className="font-semibold text-[var(--color-brand)]" href={`/helpdesk/tickets?search=${encodeURIComponent(query.search)}&status=${encodeURIComponent(query.status)}&page=${pageNumber + 1}`}>Next</a>}
              </div>
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
