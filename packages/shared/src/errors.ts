/** Error codes raised by the database RPCs / Edge Functions, with Italian customer messages. */
export const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Accedi per continuare.',
  empty_cart: 'Il carrello è vuoto.',
  too_many_items: 'Troppi prodotti nel carrello.',
  invalid_items: 'Il carrello contiene prodotti non validi.',
  invalid_store: 'Seleziona un negozio valido.',
  invalid_fulfilment: 'Seleziona un metodo di consegna.',
  cart_has_issues: 'Alcuni prodotti non sono più disponibili nelle quantità richieste. Controlla il carrello.',
  insufficient_stock: 'Un prodotto si è appena esaurito. Controlla il carrello.',
  shipping_unavailable: 'Il metodo di consegna scelto non è disponibile per questo ordine.',
  total_too_low: "L'importo minimo dell'ordine è €0,50.",
  invalid_address: "Controlla l'indirizzo di consegna.",
  invalid_pickup_point: 'Seleziona un punto di ritiro.',
  name_required: 'Inserisci nome e cognome nel profilo.',
  phone_required: 'Inserisci un numero di telefono.',
  invalid_invoice_details: 'Controlla i dati per la fattura.',
  too_many_pending_orders: 'Hai già ordini in attesa di pagamento. Completali o annullali prima di continuare.',
  coupon_not_found: 'Codice sconto non valido.',
  coupon_expired: 'Codice sconto scaduto.',
  coupon_exhausted: 'Codice sconto esaurito.',
  coupon_min_subtotal: "Importo minimo non raggiunto per questo codice sconto.",
  coupon_already_used: 'Hai già utilizzato questo codice sconto.',
  order_not_found: 'Ordine non trovato.',
  payment_unavailable: 'Il pagamento non è al momento disponibile. Riprova tra poco.',
  orders_in_progress: 'Hai ordini in corso: potrai eliminare il profilo dopo la consegna.',
  forbidden: 'Operazione non consentita.',
  invalid_transition: 'Cambio di stato non consentito.',
  refund_required: "Rimborsa l'ordine prima di annullarlo.",
  invalid_refund_amount: 'Importo del rimborso non valido.',
  order_not_refundable: 'Questo ordine non può essere rimborsato.',
  network: 'Connessione assente. Controlla la rete e riprova.',
};

/** Extracts a known error code from a Supabase/PostgREST/Edge error and returns a friendly message. */
export function errorCode(error: unknown): string | null {
  const text = typeof error === 'string' ? error
    : error && typeof error === 'object'
      ? String((error as { code?: string; message?: string; error?: string }).error
          ?? (error as { message?: string }).message ?? '')
      : '';
  const match = Object.keys(ERROR_MESSAGES).find((code) => text === code || text.includes(code));
  return match ?? null;
}

export function friendlyError(error: unknown, fallback = 'Si è verificato un errore. Riprova.'): string {
  const code = errorCode(error);
  if (code) return ERROR_MESSAGES[code];
  const text = error instanceof Error ? error.message : '';
  if (/network|fetch failed|Failed to fetch/i.test(text)) return ERROR_MESSAGES.network;
  return fallback;
}
