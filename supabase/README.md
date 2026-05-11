# Supabase — Database & Migrations

This directory holds the canonical Postgres schema for the Delta Green app.
The database lives in Supabase; access control is enforced entirely via Row
Level Security (RLS) at the DB layer.

**Project ref:** `ijfrouzzfnsqbundknug`
**URL:** `https://ijfrouzzfnsqbundknug.supabase.co`
**Region:** (set at project creation)

---

## One-time setup

The CLI is invoked via `npx`, so no project install is needed — `npx supabase@latest <command>`
downloads the binary on first use and caches it for subsequent runs. The package is
deliberately **not** a project dependency, so build environments (Vercel) don't attempt
to download the binary during `npm install`.

If you prefer it permanently installed for shell completion or speed:

```bash
npm install -g supabase
```

Authenticate and link this repo to the remote project:

```bash
npx supabase login
npx supabase link --project-ref ijfrouzzfnsqbundknug
```

The link command will prompt for the database password you set when creating
the project. Store it in your password manager — it is **not** the anon key.

---

## Applying the initial schema

The first migration (`migrations/20260505213138_initial_schema.sql`) creates
every table, index, RLS policy, helper function, and trigger from scratch.

```bash
npx supabase db push
```

This applies any pending migrations to the linked remote project. Verify in
the Supabase dashboard SQL editor:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
-- Expect: campaign_members, campaigns, linked_records,
--         record_visibility, records, sessions
```

```sql
select policyname, tablename from pg_policies
where schemaname = 'public' order by tablename, policyname;
-- Expect ~15 policies across the six tables.
```

---

## Storage bucket

The `record-photos` bucket is created manually in the Supabase dashboard
(Storage → New bucket, set **Public** off). Storage RLS policies are added
through the dashboard UI — see comments at the bottom of the schema file
for the policy shape.

---

## Seeding (local dev only)

`seed.sql` populates one campaign with sample records and SmartRef links.
Before running it, create a user via the Supabase Auth dashboard and replace
the placeholder UUID at the top of the file with that user's ID.

```bash
# After editing seed.sql with your real user UUID:
npx supabase db reset    # local dev only — wipes the local DB
```

Do **not** run the seed against the remote project unless you want test data
in production.

---

## Adding new migrations

Never edit a committed migration file. To change the schema:

```bash
npx supabase migration new descriptive_name
# edit the new file
npx supabase db push
```

Keep `references/schema.sql` in the `database-engineer` skill in sync with
the cumulative state of all migrations — it is the canonical reference.
