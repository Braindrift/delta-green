/**
 * Generic placeholder rendered by every nav leaf's route until the real
 * per-type list views land in DEL-19 through DEL-22.
 *
 * Visual style follows the registry placeholder pattern in
 * `src/lib/records/registry/_placeholders.tsx` — amber-stamp, paper-dark
 * background, font-stamp callout — so it doesn't clash with the
 * surrounding chrome but is obviously not real UI.
 *
 * Each placeholder names the ticket that will replace it, so a future
 * reader (likely future-me) lands on the right ticket without having to
 * trace the dependency graph.
 */

export type SectionPlaceholderProps = {
  /** Section header — e.g. "All Operations". */
  title: string;
  /** Subtitle line under the title. */
  subtitle: string;
  /** Ticket reference, e.g. "DEL-19" — shown in the amber callout. */
  ticket: string;
  /** Optional one-line extra context. */
  detail?: string;
};

export function SectionPlaceholder({ title, subtitle, ticket, detail }: SectionPlaceholderProps) {
  return (
    <section>
      <header className="mb-7">
        <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
          {title}
        </h1>
        <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
          {subtitle}
        </p>
      </header>

      <div className="rounded border border-amber-dim/40 bg-paper-dark/30 px-5 py-4 text-ink-faded max-w-2xl">
        <div className="font-stamp text-amber text-sm uppercase tracking-widest">
          Section view — not yet implemented
        </div>
        <div className="font-ui text-[11px] mt-2 text-ink-faded/80 leading-relaxed">
          Will be implemented in <span className="text-amber-dim">{ticket}</span>.
          {detail ? <span className="ml-1">{detail}</span> : null}
        </div>
      </div>
    </section>
  );
}
