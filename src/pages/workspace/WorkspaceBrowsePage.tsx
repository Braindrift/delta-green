export function WorkspaceBrowsePage() {
  return (
    <section>
      <header className="mb-7">
        <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
          Browse
        </h1>
        <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
          Public registry — shared operations and records
        </p>
      </header>

      <div className="rounded border border-green-dim/40 bg-paper-dark/20 px-5 py-4 max-w-2xl">
        <div className="font-stamp text-green-mid text-sm uppercase tracking-widest">
          Future feature
        </div>
        <div className="font-ui text-[11px] mt-2 text-paper-worn/70 leading-relaxed">
          Browse will allow handlers to discover and import shared campaigns, operations, and
          records from the community registry. Planned for a future phase (DEF-1).
        </div>
      </div>
    </section>
  );
}
