import { SignInButton } from "../components/auth-controls";

export default function SignInPage() {
  return <main className="mx-auto max-w-xl px-6 py-16"><a className="text-sm text-[var(--color-brand)]" href="/helpdesk">← Helpdesk home</a><section className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-8"><p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-brand)]">Uppingham IT Helpdesk</p><h1 className="mt-2 text-2xl font-semibold">Sign in</h1><p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">Use your Microsoft Entra account. Access is granted only when your immutable tenant and object identity is linked to an active local Helpdesk account.</p><div className="mt-6"><SignInButton /></div></section></main>;
}
