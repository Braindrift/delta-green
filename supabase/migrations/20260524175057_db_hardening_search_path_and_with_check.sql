-- DEL-89: DB hardening — explicit search_path on legacy helpers (S7) +
-- mirror WITH CHECK on GM UPDATE policies (S8).
--
-- Both are DDL-only and behaviour-neutral under normal app code:
--   S7 pins search_path on five functions the Supabase security advisor
--      flags as `function_search_path_mutable`. SECURITY DEFINER + mutable
--      search_path is the textbook escalation vector; cost to fix is zero.
--   S8 adds a mirror WITH CHECK to GM UPDATE policies that had USING but no
--      WITH CHECK, so a GM can't mutate a row into a state outside their own
--      authority (e.g. reassign owner_id / campaign_id and lose access).

-- ============================================================
-- S7 — explicit search_path
-- ============================================================
alter function public.is_campaign_member(uuid)       set search_path = public, auth;
alter function public.is_campaign_gm(uuid)            set search_path = public, auth;
alter function public.handle_campaign_owner_member()  set search_path = public, auth;
alter function public.handle_updated_at()             set search_path = public;
alter function public.set_invitation_token()          set search_path = public;

-- ============================================================
-- S8 — mirror WITH CHECK on GM UPDATE policies
-- ============================================================

drop policy "campaigns: gm can update" on campaigns;
create policy "campaigns: gm can update"
  on campaigns for update
  using (is_campaign_gm(id))
  with check (is_campaign_gm(id));

drop policy "campaign_members: gm can update" on campaign_members;
create policy "campaign_members: gm can update"
  on campaign_members for update
  using (is_campaign_gm(campaign_id))
  with check (is_campaign_gm(campaign_id));

drop policy "records: gm can update" on records;
create policy "records: gm can update"
  on records for update
  using (is_campaign_gm(campaign_id))
  with check (is_campaign_gm(campaign_id));

drop policy "record_visibility: gm can update" on record_visibility;
create policy "record_visibility: gm can update"
  on record_visibility for update
  using (
    exists (
      select 1 from records r
      where r.id = record_visibility.record_id
        and is_campaign_gm(r.campaign_id)
    )
  )
  with check (
    exists (
      select 1 from records r
      where r.id = record_visibility.record_id
        and is_campaign_gm(r.campaign_id)
    )
  );

drop policy "sessions: gm can update" on sessions;
create policy "sessions: gm can update"
  on sessions for update
  using (is_campaign_gm(campaign_id))
  with check (is_campaign_gm(campaign_id));
