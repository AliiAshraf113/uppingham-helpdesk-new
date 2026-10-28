import Link from "next/link";
import { AppHeader } from "./components/app-header";
import { requireAuthenticatedPrincipal } from "../server/auth/principal";

const modules = [
  ["Tickets", "Requests, assignments and service history", "/tickets"],
  ["Assets", "Equipment, ownership and lifecycle", "/assets"],
  ["Reports", "Service levels and team workload", "/reports"],
  ["Settings", "Reference data and service policies", "/settings"],
] as const;

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let user = null;
  try {
    user = await requireAuthenticatedPrincipal();
  } catch {
    // Unauthenticated or not configured yet
  }

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-6 py-14">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">Technology Services</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">IT Helpdesk</h1>
        <p className="mt-3 max-w-2xl text-lg text-[var(--color-muted)]">A clear place to request support, follow service work and manage school technology.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map(([title, description, href]) => (
            <Link key={title} href={href} className="rounded-xl border border-[var(--color-line)] bg-white p-5 transition hover:border-[var(--color-brand)]">
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{description}</p>
              <span className="mt-5 inline-block text-sm font-semibold text-[var(--color-brand)]">Open section →</span>
            </Link>
          ))}
        </div>
        <p className="mt-8 rounded-lg border border-[var(--color-line)] bg-white p-4 text-sm text-[var(--color-muted)]">Sign in with Microsoft to access protected Helpdesk features. Local account linking and database roles determine what each user can see and change.</p>
      </section>
    </main>
  );
}
