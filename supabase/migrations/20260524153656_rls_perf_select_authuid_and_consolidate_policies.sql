-- DEL-87: RLS performance — wrap auth.uid() in (select ...) and consolidate
-- stacked permissive SELECT/UPDATE policies.
--
-- Smells S3 + S4 from Pass 2 of the whole-repo review (reviews/02-database-rls.md).
--
--   S3 (auth_rls_initplan): `using (col = auth.uid())` re-runs the function for
--       every row scanned. `(select auth.uid())` lets Postgres cache it once
--       per query as an InitPlan. Policies routed through is_campaign_member /
--       is_campaign_gm already wrap auth.uid() inside the function body and
--       need no change — only the policies that call auth.uid() directly do.
--
--   S4 (multiple_permissive_policies): two permissive policies on the same
--       table+action are evaluated and OR-merged on every query. Collapsing
--       each stacked pair into one policy (USING clauses OR'd together) is
--       faster and easier to audit. Behaviour is identical because permissive
--       policies already combine with OR.
--
-- The CLI wraps this file in a single transaction, so the policy surface is
-- never observed half-rewritten.

-- ============================================================================
-- S4 — consolidate stacked permissive policies (drop both, create one).
--      auth.uid() calls in the rewritten bodies are wrapped per S3.
-- ============================================================================

-- campaigns: SELECT — members + pending invitee -----------------------------
drop policy "campaigns: members can read" on campaigns;
drop policy "campaigns: pending invitee can read" on campaigns;

create policy "campaigns: members and pending invitees can read"
  on campaigns for select using (
    deleted_at is null and (
      (select auth.uid()) = owner_id
      or is_campaign_member(id)
      or exists (
        select 1 from campaign_invitations ci
        where ci.campaign_id = campaigns.id
          and ci.invitee_user_id = (select auth.uid())
          and ci.status = 'pending'
          and ci.expires_at > now()
      )
    )
  );

-- campaign_members: SELECT — gm (all) + active members ----------------------
drop policy "campaign_members: gm can read all" on campaign_members;
drop policy "campaign_members: members can read active" on campaign_members;

create policy "campaign_members: gm and active members can read"
  on campaign_members for select using (
    is_campaign_gm(campaign_id)
    or (status = 'active' and is_campaign_member(campaign_id))
  );

-- campaign_invitations: SELECT — gm + invitee -------------------------------
drop policy "campaign_invitations: gm can read" on campaign_invitations;
drop policy "campaign_invitations: invitee can read own" on campaign_invitations;

create policy "campaign_invitations: gm and invitee can read"
  on campaign_invitations for select using (
    is_campaign_gm(campaign_id)
    or invitee_user_id = (select auth.uid())
  );

-- campaign_invitations: UPDATE — gm + invitee -------------------------------
drop policy "campaign_invitations: gm can update" on campaign_invitations;
drop policy "campaign_invitations: invitee can update own" on campaign_invitations;

create policy "campaign_invitations: gm and invitee can update"
  on campaign_invitations for update
  using (
    is_campaign_gm(campaign_id)
    or invitee_user_id = (select auth.uid())
  )
  with check (
    is_campaign_gm(campaign_id)
    or invitee_user_id = (select auth.uid())
  );

-- campaign_transfers: SELECT — sender + recipient ---------------------------
drop policy "campaign_transfers: sender can read own" on campaign_transfers;
drop policy "campaign_transfers: recipient can read own" on campaign_transfers;

create policy "campaign_transfers: participants can read"
  on campaign_transfers for select using (
    from_user_id = (select auth.uid())
    or to_user_id = (select auth.uid())
  );

-- campaign_transfers: UPDATE — sender + recipient ---------------------------
drop policy "campaign_transfers: sender can update own" on campaign_transfers;
drop policy "campaign_transfers: recipient can update own" on campaign_transfers;

create policy "campaign_transfers: participants can update"
  on campaign_transfers for update
  using (
    from_user_id = (select auth.uid())
    or to_user_id = (select auth.uid())
  )
  with check (
    from_user_id = (select auth.uid())
    or to_user_id = (select auth.uid())
  );

-- records: SELECT — gm + players see published ------------------------------
-- The consolidated player branch drops a redundant re-join present in the old
-- "players see published" policy.
drop policy "records: gm can read all" on records;
drop policy "records: players see published" on records;

create policy "records: members can read"
  on records for select using (
    deleted_at is null and (
      is_campaign_gm(campaign_id)
      or exists (
        select 1 from record_visibility rv
        join campaign_members cm on cm.id = rv.campaign_member_id
        where rv.record_id = records.id
          and cm.user_id = (select auth.uid())
          and rv.is_visible
      )
    )
  );

-- record_visibility: SELECT — gm + players own ------------------------------
drop policy "record_visibility: gm can read all" on record_visibility;
drop policy "record_visibility: players can read own" on record_visibility;

create policy "record_visibility: gm and players can read"
  on record_visibility for select using (
    exists (
      select 1 from records r
      where r.id = record_visibility.record_id
        and is_campaign_gm(r.campaign_id)
    )
    or exists (
      select 1 from campaign_members cm
      where cm.id = record_visibility.campaign_member_id
        and cm.user_id = (select auth.uid())
    )
  );

-- player_characters: SELECT — owner + campaign members (attached) -----------
drop policy "player_characters: owner can read own" on player_characters;
drop policy "player_characters: campaign members can read attached" on player_characters;

create policy "player_characters: owner and campaign members can read"
  on player_characters for select using (
    owner_id = (select auth.uid())
    or (
      campaign_id is not null
      and deleted_at is null
      and is_campaign_member(campaign_id)
    )
  );

-- ============================================================================
-- S3 — inline (select auth.uid()) rewrite on the remaining policies that call
--      auth.uid() directly and are NOT part of a stacked pair above.
--      ALTER POLICY rewrites only the USING / WITH CHECK clause and preserves
--      the command and roles.
-- ============================================================================

alter policy "campaigns: authenticated can create" on campaigns
  with check ((select auth.uid()) = owner_id);

alter policy "campaign_invitations: gm can insert" on campaign_invitations
  with check (is_campaign_gm(campaign_id) and invited_by = (select auth.uid()));

alter policy "campaign_transfers: gm can insert" on campaign_transfers
  with check (is_campaign_gm(campaign_id) and from_user_id = (select auth.uid()));

alter policy "notifications: user can read own" on notifications
  using (user_id = (select auth.uid()));

alter policy "notifications: user can update own" on notifications
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "notifications: user can delete own" on notifications
  using (user_id = (select auth.uid()));

alter policy "player_characters: owner can insert own" on player_characters
  with check (owner_id = (select auth.uid()));

alter policy "player_characters: owner can update own" on player_characters
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter policy "player_characters: owner can delete own" on player_characters
  using (owner_id = (select auth.uid()));

alter policy "user_profiles: owner can update own" on user_profiles
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
