import { signIn, signOut } from "../../../auth.ts";

export function SignInButton() {
  return <form action={async () => { "use server"; await signIn("microsoft-entra-id", { redirectTo: "/helpdesk/tickets" }); }}>
    <button className="rounded-lg bg-[var(--color-brand)] px-4 py-2 font-semibold text-white hover:bg-[var(--color-brand-dark)]">Sign in with Microsoft</button>
  </form>;
}

export function SignOutButton() {
  return <form action={async () => { "use server"; await signOut({ redirectTo: "/helpdesk/" }); }}>
    <button className="rounded-lg border border-[var(--color-line)] bg-white px-4 py-2 font-semibold">Sign out</button>
  </form>;
}
