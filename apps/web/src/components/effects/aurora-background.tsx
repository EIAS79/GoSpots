export function AuroraBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-20 overflow-hidden bg-[var(--color-background)]"
    >
      <div className="aurora-mesh absolute inset-0" />
      <div className="aurora-blob aurora-blob-a" />
      <div className="aurora-blob aurora-blob-b" />
      <div className="aurora-blob aurora-blob-c" />
      <div className="aurora-blob aurora-blob-d" />
      <div className="aurora-grid absolute inset-0 opacity-[0.07]" />
      <div className="aurora-stars absolute inset-0 opacity-60" />
      <div className="absolute inset-0 bg-noise opacity-40 mix-blend-overlay" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[var(--color-background)] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[var(--color-background)] to-transparent" />
    </div>
  );
}
