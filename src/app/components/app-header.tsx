import Link from "next/link";
import { SignInButton, SignOutButton } from "./auth-controls";
import { NotificationIndicator } from "./notification-indicator";

export type NavUser = {
  userId: number;
  displayName: string | null;
  roles: readonly string[] | string[];
  permissions: readonly string[] | string[];
};

export function AppHeader({ user }: { user?: NavUser | null }) {
  return (
    <header className="border-b border-[var(--color-line)] bg-white sticky top-0 z-30">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold tracking-tight text-lg">
            UPPINGHAM <span className="font-normal text-[var(--color-muted)] text-sm">/ IT HELP DESK</span>
          </Link>
          {user && (
            <nav className="hidden md:flex items-center gap-4 text-sm font-medium">
              <Link href="/tickets" className="hover:text-[var(--color-brand)] transition">Tickets</Link>
              {(user.permissions.includes("asset.read") || user.permissions.includes("asset.manage")) && (
                <Link href="/assets" className="hover:text-[var(--color-brand)] transition">Assets</Link>
              )}
              {user.permissions.includes("report.read") && (
                <Link href="/reports" className="hover:text-[var(--color-brand)] transition">Reports</Link>
              )}
              {user.permissions.includes("settings.manage") && (
                <Link href="/settings" className="hover:text-[var(--color-brand)] transition">Settings</Link>
              )}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <NotificationIndicator />
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold">{user.displayName || "Signed In"}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{user.roles.join(", ")}</span>
              </div>
              <SignOutButton />
            </>
          ) : (
            <>
              <span className="hidden text-sm text-[var(--color-muted)] sm:inline">Internal service portal</span>
              <SignInButton />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
