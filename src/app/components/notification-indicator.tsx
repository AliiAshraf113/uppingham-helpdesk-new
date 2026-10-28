"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

type NotificationItem = {
  notificationId: number;
  ticketNumber: number | null;
  event: string;
  readAt: string | null;
  createdAt: string;
};

export function NotificationIndicator() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  async function loadNotifications() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/helpdesk/api/notifications?page=1");
      if (!res.ok) {
        if (res.status === 401 || res.status === 503) {
          return;
        }
        throw new Error("Failed to load notifications");
      }
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } catch {
      setError("Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function fetchInitial() {
      try {
        const res = await fetch("/helpdesk/api/notifications?page=1");
        if (!res.ok) return;
        const data = await res.json();
        if (active) setNotifications(data.notifications ?? []);
      } catch {
        if (active) setError("Unable to load notifications.");
      }
    }
    fetchInitial();
    const interval = setInterval(fetchInitial, 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  async function markAsRead(notificationId: number) {
    try {
      const res = await fetch(`/helpdesk/api/notifications/${notificationId}/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.notificationId === notificationId ? { ...n, readAt: new Date().toISOString() } : n))
        );
      }
    } catch {
      // ignore mark-as-read failure gracefully
    }
  }

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open) {
            loadNotifications();
          }
        }}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={open}
        className="relative p-2 rounded-lg border border-[var(--color-line)] bg-white hover:bg-slate-50 text-[var(--color-ink)] flex items-center justify-center transition"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-accent)] px-1 text-[10px] font-bold text-slate-900">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-[var(--color-line)] bg-white shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3 bg-[var(--color-paper)]">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <span className="text-xs text-[var(--color-muted)]">{unreadCount} unread</span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[var(--color-line)]">
            {loading && notifications.length === 0 ? (
              <p className="p-4 text-center text-xs text-[var(--color-muted)]">Loading notifications…</p>
            ) : error ? (
              <p className="p-4 text-center text-xs text-red-700">{error}</p>
            ) : notifications.length === 0 ? (
              <p className="p-6 text-center text-xs text-[var(--color-muted)]">You have no notifications.</p>
            ) : (
              notifications.map((n) => {
                const isUnread = !n.readAt;
                return (
                  <div
                    key={n.notificationId}
                    className={`p-3 text-xs flex flex-col gap-1 transition ${
                      isUnread ? "bg-amber-50/50" : "bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-[var(--color-ink)]">
                        {n.event.replaceAll("_", " ")}
                        {n.ticketNumber ? ` · Ticket #${n.ticketNumber}` : ""}
                      </span>
                      {isUnread && (
                        <button
                          type="button"
                          onClick={() => markAsRead(n.notificationId)}
                          className="shrink-0 text-[11px] font-semibold text-[var(--color-brand)] hover:underline"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[var(--color-muted)]">
                      <time>{new Date(n.createdAt).toLocaleString()}</time>
                      {n.ticketNumber && (
                        <Link
                          href={`/tickets/${n.ticketNumber}`}
                          onClick={() => setOpen(false)}
                          className="text-[var(--color-brand)] hover:underline"
                        >
                          View ticket →
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
