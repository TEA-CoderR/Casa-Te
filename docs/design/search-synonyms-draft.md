# Search synonyms — draft for the owner (18/11/2026)

Words customers type that found **nothing or almost nothing** in the catalogue on 18/11, and the catalogue's own word
they would be searched as. "Risultati" = products found with the replacement (test database, all stores).
Nothing is inserted until the owner approves; afterwards rows go into `search_synonyms` (term → expands_to).

| Il cliente scrive | Cerchiamo | Risultati | Note |
|---|---|---|---|
| docciaschiuma | doccia | 200+ | anche "doccia schiuma" |
| kleenex | fazzoletti | 17 | marchio usato come nome comune |
| carta assorbente | asciugatutto | 11 | |
| varechina | candeggina | 169 | |
| sacchi spazzatura | nettezza | 5 | anche "sacchetti spazzatura", "sacchi immondizia", "spazzatura", "immondizia" |
| scolapasta | colapasta | 2 | |
| pastiglie lavastoviglie | tabs lavastoviglie | 11 | |
| capsule lavatrice | pods | 10 | trova solo Dash Pods; le Bio Presto "Caps" no |
| lavapiatti | detersivo piatti | 55 | |
| lavapavimenti | pavimenti | 115 | |
| bidone spazzatura | pattumiera | 2 | anche "pattume" |

Already live: sciampo, shampo, sciampoo → shampoo.

Not in the catalogue at all (no synonym can help): strofinaccio / canovaccio, zerbino.
