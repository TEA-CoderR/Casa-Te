-- Product photo thumbnails (plan v3 L9): when the image server has made the 480 px copies ("01.webp" -> "01_t.webp",
-- tools/image-thumbnails), the back office switches this on and product cards load the copies (the full photo
-- stays on the product page; a missing copy falls back to the full photo).
alter table public.app_settings add column image_thumbnails boolean not null default false;
grant update (image_thumbnails) on public.app_settings to authenticated;
