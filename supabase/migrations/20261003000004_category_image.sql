-- Cover photo for a department, shown in its circle on the shop's home page.
-- Storage object path in bucket "product-images" (folder categories/) or an absolute https URL.
-- Column privileges follow the table grants (managers write through the existing RLS policies).
alter table public.categories add column image_path text
  check (image_path is null or (char_length(image_path) between 1 and 500
    and (image_path ~ '^https://' or image_path !~ '^[a-z]+:')));
