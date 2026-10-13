# Agente di sincronizzazione ITO → negozio online

Legge dalla copia MySQL `ysoft` di ITO gli articoli con `web = 1`, i prezzi del negozio, le promozioni e le giacenze,
e li invia al negozio online (funzione `erp-sync`). Invia solo ciò che è cambiato, e tutto una volta al giorno.
Contratto e mappatura: `docs/ERP_SYNC.md`.

## Installazione (sul server dove gira MySQL o che lo raggiunge)
1. Node.js 20 o superiore.
2. Copiare questa cartella, poi `npm install`.
3. Utente MySQL **solo lettura** (lo crea l'IT o ITO):
   `CREATE USER 'casate_shop_ro'@'localhost' IDENTIFIED BY '…'; GRANT SELECT ON ysoft.* TO 'casate_shop_ro'@'localhost';`
4. `config.example.json` → `config.json`: indirizzo della funzione, host/utente MySQL, negozi (`"LU3": <numero ITO>`),
   modello URL delle foto (`{barcode}` o `{code}`; facoltativo).
5. Segreti solo come variabili d'ambiente (mai nel file né in chat):
   `ERP_MYSQL_PASSWORD` (password dell'utente sola lettura) e `ERP_SYNC_SECRET` (lo stesso valore impostato in
   Supabase → Edge Functions → Secrets).

## Uso
- `npm run analyze` — solo conteggi per scegliere quali articoli sono "in vendita" (flag web, giacenza, vendite recenti).
- `npm run dry-run` — legge e scrive `dry-run.json` con conteggi, problemi e un campione; **non invia nulla**.
  Da fare per primo, per controllare prezzi e promozioni.
- `npm run once` — una sincronizzazione (Utilità di pianificazione di Windows / cron, ogni 5 minuti).
- `npm run loop` — resta acceso e sincronizza ogni `intervalMinutes`.
- `node agent.mjs --once --full` — reinvia tutto.

Il negozio non riceve mai prezzi di acquisto, clienti, personale o vendite.
