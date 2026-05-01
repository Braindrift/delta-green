# Delta Green

A campaign management web application for the **Delta Green** TTRPG. Game Masters track operations, agents, organisations, locations, artifacts, and incidents across their campaigns. Players get role-based, GM-controlled access to records the GM has published to them.

## Stack

- **Frontend:** Vite + React 18 + TypeScript (strict mode)
- **Styling:** Tailwind CSS (added in DEL-6)
- **Backend / Database / Auth:** Supabase — PostgreSQL with Row Level Security, Supabase Auth, Supabase Storage (added in DEL-7, DEL-8)
- **Deployment:** Vercel (added in DEL-9)
- **Project tracking:** Linear (`DEL-` prefix)

## Quick start

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5173`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check, then build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint across the project |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run format` | Format all source files with Prettier |
| `npm run format:check` | Check formatting without modifying files |
| `npm run type-check` | Type-check without emitting |

## Project structure

```
delta-green/
├── public/              Static assets served as-is
├── src/
│   ├── assets/          Imported assets (images, etc.)
│   ├── App.tsx          Root component
│   ├── App.css          Root component styles (placeholder, replaced by Tailwind in DEL-6)
│   ├── index.css        Global styles (placeholder, replaced by Tailwind in DEL-6)
│   ├── main.tsx         React entry point
│   └── vite-env.d.ts    Vite client type declarations
├── .env.example         Template for required environment variables
├── .eslintrc.cjs        ESLint config
├── .prettierrc          Prettier config
├── index.html           Vite HTML entry
├── tsconfig.json        TypeScript root config (project references)
├── tsconfig.app.json    TypeScript config for app source (strict)
├── tsconfig.node.json   TypeScript config for Vite config files
└── vite.config.ts       Vite + plugin configuration
```

## Path aliases

`@/` resolves to `src/`. Use it for all internal imports:

```ts
import App from '@/App';
import { something } from '@/lib/utils';
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values once Supabase is set up (DEL-7):

```bash
cp .env.example .env.local
```

`VITE_*` prefixed variables are exposed to the client. Never put secrets in `VITE_*` variables.

## Roadmap

Work is tracked in [Linear](https://linear.app/deltagreen). Phase 1 (Foundation & Infrastructure) is in progress.

| Phase | Focus |
|---|---|
| 1 | Foundation & Infrastructure (repo, Tailwind, Supabase, auth, deployment) |
| 2 | Data Layer & API (record types, CRUD, registry pattern) |
| 3 | Application Shell & Navigation |
| 4 | Record Types & Core UI |
| 5 | Map & Conspiracy Board |
| 6 | Accounts, Roles & Monetisation |
