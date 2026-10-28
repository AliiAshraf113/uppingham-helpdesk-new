export function SecureFeatureUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <section role="status" className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{description}</p>
    </section>
  );
}
