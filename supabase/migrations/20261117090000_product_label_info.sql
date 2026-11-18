-- Label information for distance selling (owner, 16/11/2026): what the pack's label says and the customer must be able
-- to read before ordering — hazard statements of detergents and other mixtures (CLP), the biocide sentence,
-- composition and feeding instructions of pet food. Typed in by the shop from the pack; never invented.
-- Shown on the product page as "Informazioni di etichetta"; `label_signal` is the label's signal word, if any.
-- products already has RLS and table grants (public read of active products, staff write): the new columns follow them.
alter table public.products
  add column label_info text check (label_info is null or length(label_info) <= 4000),
  add column label_signal text check (label_signal is null or label_signal in ('attenzione', 'pericolo'));
