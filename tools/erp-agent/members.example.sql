-- Copia questo file come members.sql e adatta tabella e colonne. Una sola SELECT, con questi nomi di colonna:
--   card   numero della tessera (come stampato)
--   phone  telefono (servono almeno 6 cifre; si usano solo le ultime 4, e solo come hash)
--   birth  data di nascita (facoltativa)
--   active 1/0 se la tessera è attiva (facoltativa)
-- Nessun altro dato: nomi, indirizzi, email e punti NON vanno letti.
select t.NumeroTessera as card, t.Telefono as phone, t.DataNascita as birth, t.Attiva as active
from tessere t
