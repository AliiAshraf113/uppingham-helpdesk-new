import { requireAuthenticatedPrincipal } from "../../../server/auth/principal";
import { AuthenticationUnavailableError, ForbiddenError, UnauthenticatedError } from "../../../server/http/errors";
import { SignInButton } from "../../components/auth-controls";
import { AppHeader } from "../../components/app-header";
import { TicketDetailActions } from "../../components/ticket-detail-actions";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ ticketNumber: string }> };
type TicketDetail = { ticket: Record<string, unknown>; comments: Array<Record<string, unknown>>; activity: Array<Record<string, unknown>> };

function numberParam(value: string) {
  if (!/^[1-9]\d{0,15}$/.test(value) || !Number.isSafeInteger(Number(value))) return null;
  return Number(value);
}

export default async function TicketDetailPage(_props: Context) {
  const { ticketNumber: rawNumber } = await _props.params;
  const ticketNumber = numberParam(rawNumber);
  if (!ticketNumber) {
    return (
      <main className="min-h-screen">
        <AppHeader />
        <div className="mx-auto max-w-4xl px-6 py-12">
          <h1 className="text-3xl font-semibold">Ticket not found</h1>
          <p className="mt-3">The ticket number is invalid.</p>
          <a className="mt-5 inline-block text-[var(--color-brand)]" href="/helpdesk/tickets">← Tickets</a>
        </div>
      </main>
    );
  }

  let principal;
  try {
    principal = await requireAuthenticatedPrincipal();
  } catch (error) {
    const unavailable = error instanceof AuthenticationUnavailableError;
    return (
      <main className="min-h-screen">
        <AppHeader />
        <div className="mx-auto max-w-4xl px-6 py-12">
          <a href="/helpdesk/tickets">← Tickets</a>
          <h1 className="mt-5 text-3xl font-semibold">{unavailable ? "Sign-in is not configured" : error instanceof ForbiddenError ? "Helpdesk access is not assigned" : error instanceof UnauthenticatedError ? "Sign in to view this ticket" : "Ticket unavailable"}</h1>
          <p className="mt-3 text-[var(--color-muted)]">{unavailable ? "The Entra sign-in settings are incomplete." : error instanceof ForbiddenError ? "Your local account does not have an active Helpdesk role." : error instanceof UnauthenticatedError ? "Ticket details are protected and require an approved local account." : "The ticket service could not be reached."}</p>
          {error instanceof UnauthenticatedError && <div className="mt-5"><SignInButton /></div>}
        </div>
      </main>
    );
  }

  let result: TicketDetail | null = null;
  let staff: Array<{ userId: number; displayName: string }> = [];
  let hidden = false;
  try {
    const { getTicket, getAssignableStaff } = await import("../../../server/tickets/service");
    result = (await getTicket({ userId: principal.userId }, ticketNumber)) as TicketDetail;
    if (principal.permissions.includes("ticket.assign")) {
      staff = await getAssignableStaff({ userId: principal.userId });
    }
  } catch (error) {
    hidden = error instanceof ForbiddenError || (error instanceof Error && error.name === "NotFoundError");
  }

  if (!result) {
    return (
      <main className="min-h-screen">
        <AppHeader user={principal} />
        <div className="mx-auto max-w-4xl px-6 py-12">
          <a href="/helpdesk/tickets">← Tickets</a>
          <h1 className="mt-5 text-3xl font-semibold">{hidden ? "Ticket not found" : "Ticket unavailable"}</h1>
          <p role="status" className="mt-3 text-[var(--color-muted)]">{hidden ? "This ticket does not exist or is not available to your account." : "Ticket details could not be loaded. Try again later."}</p>
        </div>
      </main>
    );
  }

  const { ticket, comments, activity } = result;
  const can = (permission: string) => principal.permissions.includes(permission);
  const statusStr = String(ticket.status || "");

  return (
    <main className="min-h-screen">
      <AppHeader user={principal} />
      <div className="mx-auto max-w-4xl px-6 py-12">
        <a className="text-sm text-[var(--color-brand)]" href="/helpdesk/tickets">← Tickets</a>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--color-muted)]">Ticket #{String(ticket.ticketNumber)}</p>
            <h1 className="mt-1 text-3xl font-semibold">{String(ticket.title)}</h1>
          </div>
        </div>

        <section className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--color-muted)]">Status</dt>
              <dd className="mt-1">
                <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold ${
                  statusStr === "new"
                    ? "bg-purple-100 text-purple-800"
                    : statusStr === "open"
                    ? "bg-blue-100 text-blue-800"
                    : statusStr === "in_progress"
                    ? "bg-amber-100 text-amber-800"
                    : statusStr === "pending"
                    ? "bg-yellow-100 text-yellow-800"
                    : statusStr === "resolved"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-gray-100 text-gray-800"
                }`}>
                  {statusStr.replaceAll("_", " ")}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Priority</dt>
              <dd className="mt-1 font-semibold">{String(ticket.priority)}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Category</dt>
              <dd className="mt-1 font-semibold">{String(ticket.category)}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Requester</dt>
              <dd className="mt-1 font-semibold">{String(ticket.requesterName ?? "")}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Assigned to</dt>
              <dd className="mt-1 font-semibold">{String(ticket.assigneeName ?? "Unassigned")}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Created</dt>
              <dd className="mt-1 text-[var(--color-muted)]">{new Date(String(ticket.createdAt)).toLocaleString()}</dd>
            </div>
          </dl>
          <h2 className="mt-6 font-semibold">Request details</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 bg-[var(--color-paper)] p-4 rounded-lg border border-[var(--color-line)]">
            {String(ticket.description)}
          </p>
        </section>

        <TicketDetailActions
          ticketNumber={ticketNumber}
          currentStatus={statusStr}
          staff={staff}
          canAssign={can("ticket.assign") && staff.length > 0}
          canTransition={can("ticket.transition")}
          canComment={can("ticket.comment.public")}
          canInternalNote={can("ticket.note.internal.create")}
        />
        {can("ticket.assign") && staff.length === 0 && (
          <p className="mt-3 text-sm text-[var(--color-muted)]">No active IT staff accounts are available for assignment.</p>
        )}

        <section className="mt-8 rounded-xl border border-[var(--color-line)] bg-white p-6">
          <h2 className="text-xl font-semibold">Conversation</h2>
          {comments.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--color-muted)]">No replies yet.</p>
          ) : (
            <ol className="mt-4 space-y-4">
              {comments.map((comment) => (
                <li
                  key={String(comment.commentId)}
                  className={`rounded-lg border p-4 ${
                    comment.visibility === "internal" ? "border-amber-300 bg-amber-50/70" : "border-[var(--color-line)] bg-white"
                  }`}
                >
                  <div className="flex justify-between gap-3 text-xs text-[var(--color-muted)]">
                    <span className="font-semibold uppercase tracking-wider">
                      {comment.visibility === "internal" ? "🔒 Internal note" : "💬 Reply"}
                    </span>
                    <time>{new Date(String(comment.createdAt)).toLocaleString()}</time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--color-ink)]">{String(comment.body)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {activity.length > 0 && (
          <section className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
            <h2 className="text-xl font-semibold">History & Activity</h2>
            <ol className="mt-3 divide-y divide-[var(--color-line)] text-sm">
              {activity.map((event, index) => (
                <li key={`${String(event.event)}-${index}`} className="flex justify-between gap-4 py-2">
                  <span className="font-medium">{String(event.event).replaceAll("_", " ")}</span>
                  <time className="text-[var(--color-muted)] text-xs">{new Date(String(event.createdAt)).toLocaleString()}</time>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
