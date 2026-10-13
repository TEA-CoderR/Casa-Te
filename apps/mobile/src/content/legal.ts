/**
 * Customer-facing legal texts (Italian).
 *
 * ⚠️ TEMPLATES — must be completed and validated by CASA & TE's legal counsel before launch.
 * Company data is NOT written here: it comes from the `companies` table (admin → Negozi → Aziende), so the
 * operator (who publishes the app) and the sellers (the company of each store) stay in sync with the stores
 * that are open online. Remaining [PLACEHOLDER]s are business decisions. See docs/LAUNCH_CHECKLIST.md.
 */
import { companyIdentity, type CompanyRow, type StoreRow } from '@casa-te/shared';

export type LegalDoc = { title: string; updated: string; sections: Array<{ heading: string; body: string }> };

export type LegalContext = {
  /** The platform operator (CASA & TE GROUP). */
  operator: CompanyRow | null;
  /** Companies of the stores open online, with their store names. */
  sellers: Array<{ company: CompanyRow; stores: string[] }>;
  /** Home delivery / pickup points open (an active store ships orders). */
  deliveryOpen: boolean;
};

/** Operator + sellers of the active stores, from the rows the app already loads. */
export function legalContext(companies: CompanyRow[], stores: StoreRow[]): LegalContext {
  const operator = companies.find((c) => c.is_operator) ?? null;
  const sellers = companies.flatMap((company) => {
    const names = stores.filter((s) => s.active && s.company_id === company.id).map((s) => s.name);
    return names.length ? [{ company, stores: names }] : [];
  });
  return { operator, sellers, deliveryOpen: stores.some((s) => s.active && s.ships_orders) };
}

const MISSING = '[DATI DEL GESTORE]';
const emailOf = (c: CompanyRow | null | undefined, kind: 'email' | 'privacy') =>
  (kind === 'privacy' ? c?.privacy_email || c?.email : c?.email) || (kind === 'privacy' ? '[EMAIL PRIVACY]' : '[EMAIL ASSISTENZA]');

export function buildLegalDocs({ operator, sellers, deliveryOpen }: LegalContext): Record<string, LegalDoc> {
  const operatorText = operator ? companyIdentity(operator, { full: true }) : MISSING;
  const sellerList = sellers.length
    ? sellers.map(({ company, stores }) => `• ${stores.join(', ')}: ${companyIdentity(company, { full: true })}`).join('\n')
    : `• ${operatorText}`;
  const support = emailOf(operator, 'email');
  return {
    terms: {
      title: 'Condizioni generali di vendita',
      updated: '[DATA]',
      sections: [
        { heading: '1. Gestore e venditore', body: `L'app e il sito CASA & TE sono gestiti da ${operatorText} (il "Gestore").\n\nIl venditore di ciascun ordine è la società titolare del negozio CASA & TE che lo prepara, indicata prima del pagamento, nella conferma d'ordine e nel dettaglio dell'ordine. Negozi attualmente attivi per la vendita online:\n${sellerList}` },
        { heading: '2. Ambito', body: "Le presenti condizioni regolano la vendita a distanza di prodotti tramite l'app e il sito CASA & TE a consumatori ai sensi del D.Lgs. 206/2005 (Codice del Consumo). Le consegne sono effettuate in Italia." },
        { heading: '3. Prezzi', body: "I prezzi sono espressi in euro e comprensivi di IVA. Le spese di consegna sono indicate prima della conferma dell'ordine e dipendono dal valore dei prodotti, dal peso complessivo e dal metodo scelto. Il ritiro in negozio è sempre gratuito." },
        { heading: "4. Conclusione del contratto", body: "Il contratto si conclude con la conferma del pagamento. Riceverai un'email di conferma con il riepilogo dell'ordine. Se un prodotto non fosse disponibile dopo il pagamento, ti contatteremo e rimborseremo l'importo corrispondente." },
        { heading: '5. Pagamento', body: "Il pagamento avviene tramite Stripe Payments Europe Ltd. con carta di credito/debito e gli altri metodi mostrati al checkout. CASA & TE non conserva i dati della carta." },
        { heading: '6. Consegna e ritiro', body: "Consegna a domicilio tramite corriere, consegna presso punto di ritiro oppure ritiro nel negozio scelto. I tempi indicati sono stimati. Per il ritiro in negozio riceverai una notifica quando l'ordine è pronto; l'ordine resta disponibile per [NUMERO] giorni." },
        { heading: '7. Diritto di recesso', body: `Hai diritto di recedere dal contratto entro 14 giorni dalla consegna senza indicarne le ragioni (artt. 52 e ss. Codice del Consumo), comunicandolo al venditore (dati sopra), a ${support} o in negozio. I prodotti vanno restituiti integri entro 14 giorni dalla comunicazione; i costi di restituzione sono a carico del cliente salvo reso in negozio. Il rimborso avviene con lo stesso mezzo di pagamento entro 14 giorni dal ricevimento della merce. Sono esclusi i prodotti sigillati aperti per motivi igienici.` },
        { heading: '8. Garanzia legale', body: "Tutti i prodotti sono coperti dalla garanzia legale di conformità di 24 mesi (artt. 128 e ss. Codice del Consumo)." },
        { heading: '9. Reclami e controversie', body: `Per assistenza scrivi a ${support}. Legge applicabile: italiana. Per le controversie è competente il foro del consumatore.` },
      ],
    },
    privacy: {
      title: 'Informativa privacy',
      updated: '[DATA]',
      sections: [
        { heading: 'Titolari del trattamento', body: `Per l'account, l'app e il sito: ${operatorText}.\n\nPer gli ordini (vendita, consegna, documenti fiscali, resi): la società venditrice dell'ordine:\n${sellerList}\n\nResponsabile della protezione dei dati (se nominato): [DPO].` },
        { heading: 'Dati trattati', body: "Dati di contatto (email, nome, telefono), indirizzi di consegna, dati per la fattura, storico ordini, negozio preferito, dati tecnici necessari al funzionamento dell'app. I dati di pagamento sono trattati direttamente da Stripe." },
        { heading: 'Finalità e basi giuridiche', body: "a) Esecuzione degli ordini e assistenza (contratto, art. 6.1.b GDPR); b) obblighi fiscali e contabili (obbligo legale, art. 6.1.c); c) sicurezza e prevenzione frodi (legittimo interesse, art. 6.1.f); d) invio di offerte, solo con il tuo consenso facoltativo e revocabile (art. 6.1.a)." },
        { heading: 'Conservazione', body: "Dati dell'account: fino alla cancellazione. Documenti fiscali e ordini: 10 anni (art. 2220 c.c.). Consenso marketing: fino alla revoca o [DURATA] mesi di inattività." },
        { heading: 'Destinatari', body: "Fornitori che agiscono come responsabili del trattamento: Supabase (hosting database, UE), Stripe (pagamenti), corrieri per la consegna, fornitore email transazionali. Nessuna vendita di dati a terzi." },
        { heading: 'Trasferimenti extra UE', body: "Eventuali trasferimenti avvengono sulla base delle Clausole Contrattuali Standard della Commissione europea o di decisioni di adeguatezza." },
        { heading: 'I tuoi diritti', body: `Accesso, rettifica, cancellazione (anche dall'app: Profilo → Elimina account), limitazione, portabilità, opposizione, revoca del consenso. Scrivi a ${emailOf(operator, 'privacy')}. Puoi proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).` },
      ],
    },
    shipping: {
      title: 'Spedizioni e ritiro',
      updated: '2026',
      sections: [
        ...(deliveryOpen ? [] : [{ heading: 'Consegna a domicilio: prossimamente', body: "Per ora gli ordini online si ritirano in negozio. La consegna a domicilio e presso i punti di ritiro sarà attivata prossimamente: le tariffe qui sotto si applicheranno da quel momento." }]),
        { heading: 'Ritiro in negozio', body: "Sempre gratuito, nel negozio CASA & TE indicato al checkout. Ti avvisiamo via email quando l'ordine è pronto." },
        { heading: 'Spedizione gratuita', body: 'Per ordini da €66 con peso complessivo fino a 10 kg, la consegna a domicilio e al punto di ritiro è gratuita.' },
        { heading: 'Tariffe fino a 10 kg', body: "Ordini sotto €25: domicilio €4,90 / €6,90 / €8,90, punto di ritiro €3,90 / €4,90 / €6,90 (fino a 2 kg / 2–5 kg / 5–10 kg).\nDa €25 a €44,99: domicilio €3,90 / €5,90 / €7,90, punto di ritiro €2,90 / €3,90 / €5,90.\nDa €45 a €65,99: domicilio €2,90 / €4,90 / €6,90, punto di ritiro €1,90 / €2,90 / €4,90." },
        { heading: 'Oltre 10 kg', body: "Per ordini oltre 10 kg il costo viene calcolato al checkout. Il ritiro in negozio resta gratuito." },
        { heading: 'Tempi', body: 'Consegna a domicilio e punti di ritiro: [2–4] giorni lavorativi dalla conferma. Ritiro in negozio: di norma entro [1] giorno lavorativo.' },
      ],
    },
  };
}
