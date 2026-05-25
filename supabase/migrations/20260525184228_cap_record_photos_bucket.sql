-- DEL-93: cap the `record-photos` bucket size + mime types server-side.
--
-- The client (`src/lib/photos/resize.ts`) already resizes to <=1200px and
-- re-encodes JPEG at q~0.8, keeping the happy path under ~500 KB. That cap is
-- bypassable: any authenticated GM can call `storage.from('record-photos')
-- .upload(...)` directly with an arbitrary file. Storage RLS
-- (20260514083901_storage_record_photos_policies.sql) keeps the blast radius
-- inside the GM's own campaigns, but without bucket-level limits a GM could
-- still bucket-fill, upload non-image blobs, or push renderer-hanging images.
-- This sets the server-side ceiling so Storage rejects those before they land.
--
-- 2 MB ceiling is generous headroom above the ~500 KB the resize step emits;
-- the mime allowlist matches what resize.ts produces (JPEG) plus the input
-- formats we accept (PNG, WebP).
--
-- Touches: storage.buckets (record-photos row only)

update storage.buckets
set
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'record-photos';
