-- Search synonyms reviewed on 21/11/2026 (docs/design/search-synonyms-draft.md, checked against the catalogue):
-- words customers type that found nothing, searched as the catalogue's own word. Garbage bags go to "spazzatura"
-- (their category: 7 products) rather than "nettezza" (5); "pattume" already works and is left out.
insert into public.search_synonyms (term, expands_to) values
  ('docciaschiuma', 'doccia'),
  ('doccia schiuma', 'doccia'),
  ('kleenex', 'fazzoletti'),
  ('carta assorbente', 'asciugatutto'),
  ('varechina', 'candeggina'),
  ('immondizia', 'spazzatura'),
  ('sacchi spazzatura', 'spazzatura'),
  ('sacchetti spazzatura', 'spazzatura'),
  ('sacchi immondizia', 'spazzatura'),
  ('sacchetti immondizia', 'spazzatura'),
  ('scolapasta', 'colapasta'),
  ('pastiglie lavastoviglie', 'tabs lavastoviglie'),
  ('capsule lavatrice', 'pods'),
  ('lavatrice capsule', 'pods'),
  ('lavapiatti', 'detersivo piatti'),
  ('lavapavimenti', 'pavimenti'),
  ('bidone spazzatura', 'pattumiera')
on conflict (term) do nothing;
