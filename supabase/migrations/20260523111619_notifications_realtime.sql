-- DEL-78: Enable realtime broadcast for the notifications table.
--
-- NotificationsContext subscribes to per-user postgres_changes on
-- public.notifications, but the table was never added to the
-- supabase_realtime publication, so no events were broadcast. This
-- migration adds it to the publication and sets REPLICA IDENTITY FULL
-- so UPDATE/DELETE payloads carry enough columns for the client's
-- reconcile logic.

alter publication supabase_realtime add table public.notifications;

alter table public.notifications replica identity full;
