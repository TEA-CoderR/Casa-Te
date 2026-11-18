-- Customer service on WhatsApp (plan v3 X8): the number is set in the back office (Impostazioni) and the app's
-- "Domande frequenti" page shows "Scrivici su WhatsApp" only while it is set.
alter table public.app_settings
  add column support_whatsapp text check (support_whatsapp is null or support_whatsapp ~ '^\+[1-9][0-9]{6,14}$');
grant update (support_whatsapp) on public.app_settings to authenticated;
