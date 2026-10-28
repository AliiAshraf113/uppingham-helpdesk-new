"use client";

import { useState, type FormEvent } from "react";

type Staff = { userId: number; displayName: string };

const PERMITTED_TRANSITIONS: Record<string, string[]> = {
  new: ["open", "closed"],
  open: ["in_progress", "pending", "resolved", "closed"],
  in_progress: ["pending", "resolved", "closed"],
  pending: ["in_progress", "resolved", "closed"],
  resolved: ["open", "closed"],
  closed: ["open"],
};

export function TicketDetailActions({
  ticketNumber,
  currentStatus,
  staff,
  canAssign,
  canTransition,
  canComment,
  canInternalNote,
}: {
  ticketNumber: number;
  currentStatus?: string;
  staff: Staff[];
  canAssign: boolean;
  canTransition: boolean;
  canComment: boolean;
  canInternalNote: boolean;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/helpdesk/api/tickets/${ticketNumber}`;

  async function send(url: string, method: string, payload: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(
          response.status === 401
            ? "Your session expired. Sign in again."
            : response.status === 403
            ? "Your account is not allowed to make that change."
            : result.error === "authentication_unavailable"
            ? "Sign-in is not configured yet."
            : result.error || "The change was not saved. Check the values or try again later."
        );
        return false;
      }
      window.location.reload();
      return true;
    } catch {
      setMessage("The Helpdesk could not be reached. Try again later.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await send(`${base}/comments`, "POST", {
      body: data.get("body"),
      visibility: data.get("visibility") || "public",
    });
  }

  const allowedStatuses = currentStatus && PERMITTED_TRANSITIONS[currentStatus]
    ? PERMITTED_TRANSITIONS[currentStatus]
    : ["open", "in_progress", "pending", "resolved", "closed"];

  return (
    <section className="mt-8 grid gap-5 rounded-xl border border-[var(--color-line)] bg-white p-5">
      <h2 className="text-lg font-semibold">Ticket actions</h2>

      {canTransition && allowedStatuses.length > 0 && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            await send(`${base}/status`, "PATCH", { status: data.get("status") });
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            Permitted status transition
            <select name="status" className="rounded-md border border-[var(--color-line)] px-3 py-2 font-normal">
              {allowedStatuses.map((st) => (
                <option key={st} value={st}>
                  {st.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy} className="rounded-lg border border-[var(--color-line)] px-4 py-2 font-semibold hover:bg-slate-50 disabled:opacity-60">
            Update status
          </button>
        </form>
      )}

      {canAssign && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            await send(`${base}/assignment`, "POST", { assigneeUserId: Number(data.get("assigneeUserId")) });
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            Assign technician
            <select name="assigneeUserId" required className="rounded-md border border-[var(--color-line)] px-3 py-2 font-normal">
              <option value="">Choose staff member</option>
              {staff.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.displayName}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy} className="rounded-lg border border-[var(--color-line)] px-4 py-2 font-semibold hover:bg-slate-50 disabled:opacity-60">
            Assign
          </button>
        </form>
      )}

      {(canComment || canInternalNote) && (
        <form onSubmit={submitComment} className="grid gap-3 border-t border-[var(--color-line)] pt-4">
          <label className="grid gap-1 text-sm font-medium">
            Add reply or note
            <textarea
              name="body"
              required
              maxLength={10000}
              rows={4}
              placeholder="Write your update here…"
              className="rounded-md border border-[var(--color-line)] px-3 py-2 font-normal"
            />
          </label>
          {canInternalNote ? (
            <label className="grid gap-1 text-sm font-medium">
              Visibility
              <select name="visibility" className="w-fit rounded-md border border-[var(--color-line)] px-3 py-2 font-normal">
                <option value="public">Reply to requester (Public)</option>
                <option value="internal">Internal note (IT staff only)</option>
              </select>
            </label>
          ) : (
            <input type="hidden" name="visibility" value="public" />
          )}
          <button
            disabled={busy}
            className="justify-self-start rounded-lg bg-[var(--color-brand)] px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Saving…" : "Post reply"}
          </button>
        </form>
      )}

      {message && <p role="alert" className="text-sm text-red-800">{message}</p>}
      {!canTransition && !canAssign && !canComment && !canInternalNote && (
        <p className="text-sm text-[var(--color-muted)]">Your account can view this ticket but cannot change it.</p>
      )}
    </section>
  );
}
