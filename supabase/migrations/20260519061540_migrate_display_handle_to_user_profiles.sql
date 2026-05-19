-- DEL-54 — Migrate display-handle resolution to user_profiles.
--
-- Before this migration, two functions independently computed the same
-- display handle from `auth.users`:
--   * `get_user_handle(uuid)` (DEL-35) — used by the notification
--     triggers to denormalise `inviter_username` / `invitee_username` /
--     `deleted_by_username` into payloads.
--   * `get_invitation_by_token(text)` (DEL-34) — used by the magic-link
--     invite accept screen to show the inviter handle to unauthenticated
--     visitors.
--
-- Both used the same `coalesce(nullif(raw_user_meta_data->>'display_name',
-- ''), split_part(email, '@', 1))` fallback chain, and both could drift
-- from each other or from any future username UI.
--
-- DEL-37 introduced `user_profiles`, which is now backfilled and trigger-
-- maintained for every `auth.users` row. This migration switches both
-- consumers to read from `user_profiles.username` so there's a single
-- source of truth for display handles.
--
-- No data backfill: existing notification payloads are frozen by design
-- (denormalised at write time per DEL-35). Only new notifications use the
-- new resolution.

-- ============================================================
-- get_user_handle: read username from user_profiles.
-- ============================================================
-- `search_path` drops `auth` — the function no longer touches `auth.users`.
-- Cast `citext` → `text` at the boundary so the existing return type and
-- downstream JSONB payload shapes are unchanged.

create or replace function get_user_handle(p_user_id uuid)
returns text language sql security definer stable
set search_path = public
as $$
  select username::text
  from user_profiles
  where user_id = p_user_id;
$$;

-- ============================================================
-- get_invitation_by_token: replace inline coalesce with user_profiles join.
-- ============================================================
-- The previous `auth.users` join existed only to source the inviter handle
-- (`invitee_email` comes from `campaign_invitations.invitee_email`, not
-- from `auth.users`). With the handle now sourced from `user_profiles`,
-- the auth join is dropped and `search_path` no longer needs `auth`.
-- `create or replace` preserves the prior `grant execute ... to anon,
-- authenticated`.

create or replace function get_invitation_by_token(p_token text)
returns table (
  campaign_name  text,
  inviter_handle text,
  status         text,
  expires_at     timestamptz,
  message        text,
  invitee_email  text
)
language sql security definer stable
set search_path = public
as $$
  select
    c.name              as campaign_name,
    up.username::text   as inviter_handle,
    ci.status,
    ci.expires_at,
    ci.message,
    ci.invitee_email
  from campaign_invitations ci
  join campaigns c          on c.id = ci.campaign_id
  left join user_profiles up on up.user_id = ci.invited_by
  where ci.token = p_token
    and ci.invitee_email is not null;
$$;
