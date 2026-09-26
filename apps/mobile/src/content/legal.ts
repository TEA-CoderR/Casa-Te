/**
 * Customer-facing legal texts (Italian).
 *
 * ⚠️ TEMPLATES — must be completed and validated by CASA & TE's legal counsel before launch.
 * Replace every [PLACEHOLDER] with verified company data. See docs/LAUNCH_CHECKLIST.md.
 */
export type LegalDoc = { title: string; updated: string; sections: Array<{ heading: string; body: string }> };

const COMPANY = '[RAGIONE SOCIALE], con sede legale in [INDIRIZZO SEDE], P.IVA [PARTITA IVA], REA [NUMERO REA], PEC [PEC], email [EMAIL ASSISTENZA]';

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  terms: {
    title: 'Condizioni generali di vendita',
    updated: '[DATA]',
    sections: [
      { heading: '1. Venditore', body: `Il presente servizio di vendita online è gestito da ${COMPANY} ("CASA & TE").` },
      { heading: '2. Ambito', body: "Le presenti condizioni regolano la vendita a distanza di prodotti tramite l'app e il sito CASA & TE a consumatori ai sensi del D.Lgs. 206/2005 (Codice del Consumo). Le consegne sono effettuate in Italia." },
      { heading: '3. Prezzi', body: "I prezzi sono espressi in euro e comprensivi di IVA. Le spese di consegna sono indicate prima della conferma dell'ordine e dipendono dal valore dei prodotti, dal peso complessivo e dal metodo scelto. Il ritiro in negozio è sempre gratuito." },
      { heading: "4. Conclusione del contratto", body: "Il contratto si conclude con la conferma del pagamento. Riceverai un'email di conferma con il riepilogo dell'ordine. Se un prodotto non fosse disponibile dopo il pagamento, ti contatteremo e rimborseremo l'importo corrispondente." },
      { heading: '5. Pagamento', body: "Il pagamento avviene tramite Stripe Payments Europe Ltd. con carta di credito/debito e gli altri metodi mostrati al checkout. CASA & TE non conserva i dati della carta." },
      { heading: '6. Consegna e ritiro', body: "Consegna a domicilio tramite corriere, consegna presso punto di ritiro oppure ritiro nel negozio scelto. I tempi indicati sono stimati. Per il ritiro in negozio riceverai una notifica quando l'ordine è pronto; l'ordine resta disponibile per [NUMERO] giorni." },
      { heading: '7. Diritto di recesso', body: "Hai diritto di recedere dal contratto entro 14 giorni dalla consegna senza indicarne le ragioni (artt. 52 e ss. Codice del Consumo), comunicandolo a [EMAIL ASSISTENZA] o in negozio. I prodotti vanno restituiti integri entro 14 giorni dalla comunicazione; i costi di restituzione sono a carico del cliente salvo reso in negozio. Il rimborso avviene con lo stesso mezzo di pagamento entro 14 giorni dal ricevimento della merce. Sono esclusi i prodotti sigillati aperti per motivi igienici." },
      { heading: '8. Garanzia legale', body: "Tutti i prodotti sono coperti dalla garanzia legale di conformità di 24 mesi (artt. 128 e ss. Codice del Consumo)." },
      { heading: '9. Reclami e controversie', body: "Per assistenza scrivi a [EMAIL ASSISTENZA]. Legge applicabile: italiana. Per le controversie è competente il foro del consumatore. Piattaforma ODR dell'UE: https://ec.europa.eu/consumers/odr." },
    ],
  },
  privacy: {
    title: 'Informativa privacy',
    updated: '[DATA]',
    sections: [
      { heading: 'Titolare del trattamento', body: `${COMPANY}. Responsabile della protezione dei dati (se nominato): [DPO].` },
      { heading: 'Dati trattati', body: "Dati di contatto (email, nome, telefono), indirizzi di consegna, dati per la fattura, storico ordini, negozio preferito, dati tecnici necessari al funzionamento dell'app. I dati di pagamento sono trattati direttamente da Stripe." },
      { heading: 'Finalità e basi giuridiche', body: "a) Esecuzione degli ordini e assistenza (contratto, art. 6.1.b GDPR); b) obblighi fiscali e contabili (obbligo legale, art. 6.1.c); c) sicurezza e prevenzione frodi (legittimo interesse, art. 6.1.f); d) invio di offerte, solo con il tuo consenso facoltativo e revocabile (art. 6.1.a)." },
      { heading: 'Conservazione', body: "Dati dell'account: fino alla cancellazione. Documenti fiscali e ordini: 10 anni (art. 2220 c.c.). Consenso marketing: fino alla revoca o [DURATA] mesi di inattività." },
      { heading: 'Destinatari', body: "Fornitori che agiscono come responsabili del trattamento: Supabase (hosting database, UE), Stripe (pagamenti), corrieri per la consegna, fornitore email transazionali. Nessuna vendita di dati a terzi." },
      { heading: 'Trasferimenti extra UE', body: "Eventuali trasferimenti avvengono sulla base delle Clausole Contrattuali Standard della Commissione europea o di decisioni di adeguatezza." },
      { heading: 'I tuoi diritti', body: "Accesso, rettifica, cancellazione (anche dall'app: Profilo → Elimina account), limitazione, portabilità, opposizione, revoca del consenso. Scrivi a [EMAIL PRIVACY]. Puoi proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it)." },
    ],
  },
  shipping: {
    title: 'Spedizioni e ritiro',
    updated: '2026',
    sections: [
      { heading: 'Ritiro in negozio', body: "Sempre gratuito, in tutti i negozi CASA & TE di Arezzo e Lucca. Ti avvisiamo via email quando l'ordine è pronto." },
      { heading: 'Spedizione gratuita', body: 'Per ordini da €66 con peso complessivo fino a 10 kg, la consegna a domicilio e al punto di ritiro è gratuita.' },
      { heading: 'Tariffe fino a 10 kg', body: "Ordini sotto €25: domicilio €4,90 / €6,90 / €8,90, punto di ritiro €3,90 / €4,90 / €6,90 (fino a 2 kg / 2–5 kg / 5–10 kg).\nDa €25 a €44,99: domicilio €3,90 / €5,90 / €7,90, punto di ritiro €2,90 / €3,90 / €5,90.\nDa €45 a €65,99: domicilio €2,90 / €4,90 / €6,90, punto di ritiro €1,90 / €2,90 / €4,90." },
      { heading: 'Oltre 10 kg', body: "Per ordini oltre 10 kg il costo viene calcolato al checkout. Il ritiro in negozio resta gratuito." },
      { heading: 'Tempi', body: 'Consegna a domicilio e punti di ritiro: [2–4] giorni lavorativi dalla conferma. Ritiro in negozio: di norma entro [1] giorno lavorativo.' },
    ],
  },
};
