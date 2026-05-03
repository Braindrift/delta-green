function App() {
  return (
    <div className="min-h-screen bg-desk font-ui text-green-accent p-8">

      {/* Header */}
      <header className="border-b border-green-dim pb-4 mb-8">
        <h1 className="font-display text-3xl tracking-widest text-green-glow uppercase">
          Delta Green
        </h1>
        <p className="text-xs text-green-mid tracking-widest mt-1">
          // CLASSIFIED // OPERATION TRACKER // THEME TEST //
        </p>
      </header>

      {/* Colour swatches */}
      <section className="mb-8">
        <h2 className="text-green-dim text-xs tracking-widest uppercase mb-4">Colour tokens</h2>
        <div className="grid grid-cols-4 gap-3">
          {[
            ['bg-desk',         'desk'],
            ['bg-desk-edge',    'desk-edge'],
            ['bg-desk-groove',  'desk-groove'],
            ['bg-paper',        'paper'],
            ['bg-paper-worn',   'paper-worn'],
            ['bg-paper-dark',   'paper-dark'],
            ['bg-green-void',   'green-void'],
            ['bg-green-dim',    'green-dim'],
            ['bg-green-mid',    'green-mid'],
            ['bg-green-bright', 'green-bright'],
            ['bg-green-accent', 'green-accent'],
            ['bg-green-glow',   'green-glow'],
            ['bg-red-stamp',    'red-stamp'],
            ['bg-red-faded',    'red-faded'],
            ['bg-amber',        'amber'],
            ['bg-amber-dim',    'amber-dim'],
          ].map(([cls, label]) => (
            <div key={cls} className="flex flex-col gap-1">
              <div className={`${cls} h-10 rounded border border-green-void`} />
              <span className="text-xs text-ink-faded font-ui">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Typography */}
      <section className="mb-8">
        <h2 className="text-green-dim text-xs tracking-widest uppercase mb-4">Typography</h2>
        <div className="space-y-3">
          <p className="font-display text-2xl text-paper">Oswald — Display font</p>
          <p className="font-body text-base text-paper-worn">Courier Prime — Body font. The quick brown fox jumps over the lazy dog.</p>
          <p className="font-ui text-sm text-green-accent">Share Tech Mono — UI font. AGENT // CLASSIFIED // OPERATIONAL</p>
          <p className="font-stamp text-xl text-red-stamp tracking-wider">Special Elite — CLASSIFIED</p>
        </div>
      </section>

      {/* Sample card */}
      <section>
        <h2 className="text-green-dim text-xs tracking-widest uppercase mb-4">Sample record card</h2>
        <div className="bg-green-void border border-green-dim rounded p-4 max-w-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs text-green-mid tracking-widest uppercase">Agent</span>
            <span className="text-xs text-amber font-ui">● Active</span>
          </div>
          <h3 className="font-display text-lg text-paper tracking-wide">BLACKWELL, Sandra</h3>
          <p className="font-body text-sm text-paper-worn mt-2">
            Fifteen-year veteran. Lead handler on STATIC NIGHT.
          </p>
          <div className="mt-3 pt-3 border-t border-green-dim flex gap-2">
            <span className="text-xs bg-green-dim text-green-accent px-2 py-0.5 rounded font-ui">handler</span>
            <span className="text-xs bg-green-dim text-green-accent px-2 py-0.5 rounded font-ui">field-agent</span>
          </div>
        </div>
      </section>

    </div>
  );
}

export default App;