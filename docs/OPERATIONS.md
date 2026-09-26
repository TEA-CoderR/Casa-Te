# Manuale operativo — Gestione online CASA & TE

Per il personale dei negozi e i responsabili. Accesso: **gestione.casate.it** con l'email aziendale.

## Ruoli

| Ruolo | Può fare |
|---|---|
| Personale negozio | Vedere e preparare gli ordini del proprio negozio, aggiornare le giacenze del proprio negozio |
| Responsabile | Tutto il catalogo, prezzi, codici sconto, tariffe, rimborsi e annullamenti, tutti i negozi |
| Amministratore | Come il responsabile + negozi e gestione del personale |

## Ogni giorno: preparare gli ordini

1. Apri **Preparazione ordini**. La lista si aggiorna da sola ogni 30 secondi.
2. **Da preparare**: ordini pagati. Seleziona il più vecchio → **Inizia preparazione**.
3. Prendi i prodotti dallo scaffale e spunta ogni riga (per quantità > 1 usa + / −).
4. Quando tutto è spuntato → **Tutto pronto**.
   * **Ritiro in negozio**: il cliente riceve un'email "pronto per il ritiro". Metti il pacco nell'area ritiri con il numero d'ordine (es. CT26001234).
     Quando il cliente arriva, verifica nome e numero d'ordine → **Consegnato al cliente**.
   * **Domicilio / punto di ritiro**: imballa, crea la spedizione presso il corriere, poi in **Registra spedizione** inserisci corriere, codice e link di tracciamento. Il cliente riceve l'email con il tracciamento.
5. Quando il corriere conferma la consegna, apri l'ordine → **Segna come completato**.

Stampa: il pulsante **Stampa** produce la distinta di prelievo / documento di accompagnamento.

### Se un prodotto manca
Non segnare l'ordine come pronto. Avvisa il responsabile: può fare un **rimborso parziale** della riga mancante (e poi prosegui) oppure **Annulla e rimborsa** l'intero ordine. Correggi subito la giacenza in **Magazzino**.

## Giacenze (Magazzino)

* La quantità mostrata è quella **vendibile online** del negozio. Gli ordini online la scalano automaticamente al momento dell'ordine; gli ordini non pagati la restituiscono dopo 35 minuti.
* Dopo un conteggio o un arrivo merce: cerca il prodotto (anche col lettore di codici a barre nel campo di ricerca), scrivi la nuova quantità, **Salva modifiche**.
* **Movimenti** mostra la storia: ordini, annullamenti, modifiche manuali, import.
* Consiglio: tieni una scorta di sicurezza (es. inserisci 1–2 pezzi in meno del reale) finché le giacenze non sono collegate alla cassa.

## Rimborsi e annullamenti (responsabili)

* Apri l'ordine → **Rimborso parziale** (importo a scelta) oppure **Annulla e rimborsa** (rimborso totale + prodotti di nuovo disponibili).
* Il rimborso parte subito su Stripe; il cliente lo vede sul conto in 5–10 giorni lavorativi e riceve un'email.
* Resi (diritto di recesso 14 giorni): quando la merce rientra integra, esegui il rimborso e riaggiorna la giacenza.
* Ordini "Pagamento ricevuto dopo la scadenza": il sistema rimborsa automaticamente; nessuna azione richiesta.

## Catalogo (responsabili)

* **Prodotti → Nuovo prodotto** oppure modifica: nome, prezzo IVA inclusa, **peso in grammi (obbligatorio: determina la spedizione)**, IVA, EAN, categoria, immagini, giacenze per negozio. Spunta **Pubblicato** per renderlo visibile.
* **Importa CSV**: scarica il modello, compila in Excel, salva come CSV, carica → **Verifica** → **Importa**. Lo SKU è la chiave: righe con SKU esistente aggiornano il prodotto.
* **Prezzo barrato**: usalo solo se il prezzo precedente è il più basso degli ultimi 30 giorni (direttiva Omnibus).
* **Codici sconto**: percentuale, importo fisso o spedizione gratuita, con date, spesa minima e limiti di utilizzo.
* **Tariffe spedizione**: modifiche immediate su app e sito. Usa il simulatore prima di salvare. Non modificare senza approvazione della direzione.

## Domande frequenti

* **Il cliente dice di aver pagato ma l'ordine è "In attesa di pagamento"**: attendi 1–2 minuti e ricarica; la conferma arriva da Stripe. Se dopo 10 minuti è ancora in attesa, controlla su Stripe il pagamento (ricerca per email) e contatta l'amministratore.
* **Un cliente vuole cambiare indirizzo**: possibile solo prima della spedizione; annota la richiesta con **Aggiungi nota** (visibile al cliente se utile) e aggiorna l'etichetta del corriere.
* **Un cliente vuole cancellare il proprio account**: può farlo dall'app (Profilo → Elimina account). Gli ordini restano per obblighi fiscali.
* **Password dimenticata**: pagina di accesso → "Password dimenticata / primo accesso".
