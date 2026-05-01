import { useState } from 'react';
import './App.css';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="app">
      <header>
        <h1>DELTA GREEN</h1>
        <p className="codename">// CLASSIFIED // OPERATION TRACKER //</p>
      </header>

      <main>
        <p>
          Phase 1 scaffold operational. Stack: Vite + React + TypeScript.
          Tailwind theme and Supabase wiring arrive in DEL-6, DEL-7, DEL-8.
        </p>

        <button onClick={() => setCount((n) => n + 1)}>
          Stack check: {count}
        </button>
      </main>

      <footer>
        <p>DEL-5 complete. Stand by for further orders.</p>
      </footer>
    </div>
  );
}

export default App;
