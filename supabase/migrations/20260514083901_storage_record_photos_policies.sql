-- DEL-12 — Storage RLS policies for the `record-photos` bucket.
--
-- The bucket itself is created via the Supabase dashboard (Public: off) and
-- documented in `supabase/migrations/20260505213138_initial_schema.sql` and
-- `supabase/README.md`. This migration only adds the access policies.
--
-- Path convention enforced by the photos module:
--   `{campaign_id}/{record_id}/{filename}`
--
-- The first path segment is the campaign UUID. RLS keys off that segment via
-- `(storage.foldername(name))[1]`, which returns the first folder in the
-- object's name. Casting to `uuid` makes a malformed path (anything where
-- segment 1 isn't a valid UUID) fail the policy check rather than silently
-- match a different campaign.
--
-- Helpers `is_campaign_member(uuid)` and `is_campaign_gm(uuid)` are defined
-- in the initial schema migration; no new helpers are introduced here.
--
-- INSERT / UPDATE / DELETE are GM-only because publishing photo evidence is a
-- GM authoring action — same threat model as creating or editing a record.
-- SELECT is open to all campaign members so players can render photos on
-- records the GM has published to them. (Per-record visibility is enforced
-- at the records layer via the `record_visibility` table; storage doesn't
-- need to duplicate that check — players can only fetch a `Photo.path` from
-- a record they're allowed to read in the first place.)
--
-- Policies are scoped by `bucket_id = 'record-photos'` so they leave any
-- other buckets (current or future) untouched.

create policy "record-photos: members can read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'record-photos'
    and public.is_campaign_member(((storage.foldername(name))[1])::uuid)
  );

create policy "record-photos: GMs can upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'record-photos'
    and public.is_campaign_gm(((storage.foldername(name))[1])::uuid)
  );

create policy "record-photos: GMs can update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'record-photos'
    and public.is_campaign_gm(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'record-photos'
    and public.is_campaign_gm(((storage.foldername(name))[1])::uuid)
  );

create policy "record-photos: GMs can delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'record-photos'
    and public.is_campaign_gm(((storage.foldername(name))[1])::uuid)
  );
