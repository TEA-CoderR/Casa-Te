-- Flyer note and page titles: stored, length-checked.
begin;
do $$
declare v uuid;
begin
  insert into public.flyers (title, page_paths, note, page_titles) values ('Test', array['https://example.com/1.webp'], 'Solo con la Fidelity Card', array['Copertina'])
    returning id into v;
  perform tests.eq((select note from public.flyers where id = v), 'Solo con la Fidelity Card', 'note stored');
  perform tests.eq((select page_titles[1] from public.flyers where id = v), 'Copertina', 'page title stored');
  begin
    update public.flyers set page_titles = array[repeat('x', 61)] where id = v;
    raise exception 'a 61-character page title was accepted';
  exception when check_violation then null;
  end;
end $$;
rollback;
