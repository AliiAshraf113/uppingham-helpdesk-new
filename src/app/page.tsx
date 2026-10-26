import Link from "next/link";

const modules = [
  ["Tickets", "Requests, assignments and service history", "/tickets"],
  ["Assets", "Equipment, ownership and lifecycle", "/assets"],
  ["Reports", "Service levels and team workload", "/reports"],
  ["Settings", "Reference data and service policies", "/settings"],
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-[var(--color-line)] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold tracking-tight">UPPINGHAM <span className="font-normal text-[var(--color-muted)]">/ IT SERVICE DESK</span></Link>
          <span className="text-sm text-[var(--color-muted)]">Internal service portal</span>
        </div>
      </header>
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
        <p className="mt-8 rounded-lg border border-[var(--color-line)] bg-white p-4 text-sm text-[var(--color-muted)]">Sign-in and live service data will be enabled after authentication and database stages are implemented.</p>
      </section>
    </main>
  );
}
