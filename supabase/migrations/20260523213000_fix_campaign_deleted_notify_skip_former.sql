-- Fix campaign_deleted notification fan-out to skip former members.
--
-- Bug: a user who left a campaign (`campaign_members.status = 'former'`)
-- still received the `campaign_deleted` notification when the Handler
-- later soft-deleted the campaign. The trigger function originally
-- introduced in DEL-35 (20260516224705_add_notifications_table.sql)
-- selected every membership row excluding only the acting user, with no
-- filter on `status`. Former members therefore received notifications
-- about a campaign they had already exited.
--
-- Fix: add `cm.status = 'active'` to the SELECT so the fan-out reaches
-- only currently-active members (mirroring the semantics every other
-- access check in the schema applies — `is_campaign_member` and
-- `is_campaign_gm` already gate on `status = 'active'`).
--
-- `create or replace function` preserves the existing trigger binding
-- (`campaigns_notify_soft_delete`); no DDL beyond the function body.
--
-- Touches: function-only.

create or replace function notify_on_campaign_soft_delete()
returns trigger language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_deleted_by_username text;
begin
  if not (old.deleted_at is null and new.deleted_at is not null) then
    return new;
  end if;

  v_deleted_by_username := get_user_handle(auth.uid());

  insert into notifications (user_id, kind, source_kind, source_id, payload)
  select
    cm.user_id,
    'campaign_deleted',
    'campaign',
    new.id,
    jsonb_build_object(
      'campaign_id',           new.id,
      'campaign_name',         new.name,
      'deleted_by_username',   v_deleted_by_username
    )
  from campaign_members cm
  where cm.campaign_id = new.id
    and cm.status = 'active'
    and cm.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);

  return new;
end;
$$;

-- ============================================================
-- VERIFICATION (commented; covered by smoke tests run via the
-- Supabase MCP)
-- ============================================================
--
--   -- Setup: Handler H, Player P. P leaves, then H soft-deletes.
--   select leave_campaign('<campaign_id>');   -- as P → 'left'
--   select soft_delete_campaign('<campaign_id>'); -- as H → 'deleted'
--   select count(*) from notifications
--     where kind = 'campaign_deleted'
--       and (payload->>'campaign_id') = '<campaign_id>'
--       and user_id = '<P>';
--   -- → 0 (former member should NOT be notified).
