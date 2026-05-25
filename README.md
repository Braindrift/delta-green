# Delta Green Web App

A two-level web app for running the [Delta Green](https://www.delta-green.com/)
TTRPG online. A **workspace shell** (campaign list, members, invites,
notifications, player characters) wraps a **campaign view** (Operations,
Subjects, Entities, Events). Built with React + TypeScript on Vite, backed by
Supabase (Postgres + Auth + Storage), deployed on Vercel.

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL + anon key
npm run dev
```

`.env.local` needs two values from your Supabase project (Settings → API):

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Where to find the rest

- **[`CLAUDE.md`](./CLAUDE.md)** — working agreements, dev environment, and the
  conventions this repo runs on.
- **[`supabase/README.md`](./supabase/README.md)** — database setup, migrations,
  and storage.
- **[Linear board](https://linear.app/deltagreen/team/DEL/active)** — issues and
  roadmap.
- **[Design doc](https://linear.app/deltagreen/document/design-document-delta-green-web-app-2e21e799fc36)**
  — the spec the app is built against.
