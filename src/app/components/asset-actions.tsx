"use client";

import { useState } from "react";

type User = { userId: number; displayName: string };

type Asset = {
  assetId: number;
  assetTag: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  assetType: string;
  status: string;
  assignedUserId: number | null;
  updatedAt: Date | string;
};

export function AssetActions({
  asset,
  users,
  canManage,
}: {
  asset: Asset;
  users: User[];
  canManage: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [retireOpen, setRetireOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>(
    asset.assignedUserId ? String(asset.assignedUserId) : ""
  );
  const [retireReason, setRetireReason] = useState("");

  if (!canManage) return null;

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/helpdesk/api/assets/${asset.assetId}/assignment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assigneeUserId: selectedUser ? Number(selectedUser) : null,
        }),
      });
      const res = await response.json();
      if (!response.ok) {
        setMessage(res.error || "Assignment failed.");
        return;
      }
      window.location.reload();
    } catch {
      setMessage("Failed to reach server.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRetire(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/helpdesk/api/assets/${asset.assetId}/retire`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: retireReason }),
      });
      const res = await response.json();
      if (!response.ok) {
        setMessage(res.error || "Retirement failed.");
        return;
      }
      window.location.reload();
    } catch {
      setMessage("Failed to reach server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 text-xs flex flex-wrap items-center gap-2">
      {asset.status !== "retired" && (
        <>
          <button
            type="button"
            onClick={() => {
              setAssignOpen((v) => !v);
              setRetireOpen(false);
            }}
            className="rounded border border-[var(--color-line)] px-2 py-1 font-medium hover:bg-slate-50"
          >
            {asset.assignedUserId ? "Reassign / Unassign" : "Assign"}
          </button>
          <button
            type="button"
            onClick={() => {
              setRetireOpen((v) => !v);
              setAssignOpen(false);
            }}
            className="rounded border border-red-200 text-red-700 px-2 py-1 font-medium hover:bg-red-50"
          >
            Retire
          </button>
        </>
      )}

      {assignOpen && (
        <form onSubmit={handleAssign} className="mt-2 w-full flex flex-wrap items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-[var(--color-line)]">
          <label className="flex items-center gap-2 text-xs font-medium">
            Assign to:
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="rounded border border-[var(--color-line)] bg-white px-2 py-1 text-xs"
            >
              <option value="">Unassigned (In stock)</option>
              {users.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-[var(--color-brand)] text-white px-3 py-1 text-xs font-semibold disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setAssignOpen(false)}
            className="rounded border border-[var(--color-line)] bg-white px-2 py-1 text-xs"
          >
            Cancel
          </button>
        </form>
      )}

      {retireOpen && (
        <form onSubmit={handleRetire} className="mt-2 w-full flex flex-col gap-2 bg-red-50/50 p-2.5 rounded-lg border border-red-200">
          <label className="flex flex-col gap-1 text-xs font-medium text-red-900">
            Retirement Reason:
            <input
              type="text"
              required
              maxLength={500}
              placeholder="e.g. Obsolete hardware, damaged beyond repair"
              value={retireReason}
              onChange={(e) => setRetireReason(e.target.value)}
              className="rounded border border-red-200 bg-white px-2 py-1 text-xs"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy || !retireReason.trim()}
              className="rounded bg-red-700 text-white px-3 py-1 text-xs font-semibold disabled:opacity-60"
            >
              {busy ? "Retiring…" : "Confirm Retirement"}
            </button>
            <button
              type="button"
              onClick={() => setRetireOpen(false)}
              className="rounded border border-[var(--color-line)] bg-white px-2 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {message && <p className="text-red-700 text-xs w-full">{message}</p>}
    </div>
  );
}
