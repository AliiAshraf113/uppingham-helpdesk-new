"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Category = { categoryId: number; name: string };

export function TicketCreateForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/helpdesk/api/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: data.get("title"),
          description: data.get("description"),
          categoryId: Number(data.get("categoryId")),
          priority: data.get("priority"),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(response.status === 401 ? "Your session expired. Sign in again." : response.status === 403 ? "Your account cannot create tickets." : result.error === "authentication_unavailable" ? "Sign-in is not configured yet." : result.error === "internal_error" ? "The ticket could not be saved. Try again later." : "Check the ticket details and try again.");
        return;
      }
      router.push(`/tickets/${result.ticketNumber}`);
    } catch {
      setMessage("The Helpdesk could not be reached. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="mt-4 grid gap-3">
    <label className="grid gap-1 text-sm font-medium">Title<input name="title" required maxLength={255} className="rounded-md border border-[var(--color-line)] px-3 py-2 font-normal" /></label>
    <label className="grid gap-1 text-sm font-medium">Category<select name="categoryId" required className="rounded-md border border-[var(--color-line)] px-3 py-2 font-normal"><option value="">Choose a category</option>{categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.name}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-medium">Priority<select name="priority" className="rounded-md border border-[var(--color-line)] px-3 py-2 font-normal"><option value="medium">Medium</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
    <label className="grid gap-1 text-sm font-medium">What do you need help with?<textarea name="description" required maxLength={20000} rows={5} className="rounded-md border border-[var(--color-line)] px-3 py-2 font-normal" /></label>
    <button disabled={busy} className="justify-self-start rounded-lg bg-[var(--color-brand)] px-4 py-2 font-semibold text-white disabled:opacity-60">{busy ? "Submitting…" : "Submit ticket"}</button>
    {message && <p role="alert" className="text-sm text-red-800">{message}</p>}
  </form>;
}
