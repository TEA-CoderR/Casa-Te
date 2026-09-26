export type Address = {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
};

export const ITALIAN_PROVINCES = [
  'AG','AL','AN','AO','AP','AQ','AR','AT','AV','BA','BG','BI','BL','BN','BO','BR','BS','BT','BZ','CA','CB','CE','CH','CL','CN','CO','CR','CS','CT','CZ','EN','FC','FE','FG','FI','FM','FR','GE','GO','GR','IM','IS','KR','LC','LE','LI','LO','LT','LU','MB','MC','ME','MI','MN','MO','MS','MT','NA','NO','NU','OR','PA','PC','PD','PE','PG','PI','PN','PO','PR','PT','PU','PV','PZ','RA','RC','RE','RG','RI','RM','RN','RO','SA','SI','SO','SP','SR','SS','SU','SV','TA','TE','TN','TO','TP','TR','TS','TV','UD','VA','VB','VC','VE','VI','VR','VT','VV',
] as const;

export const isPostalCode = (v: string) => /^\d{5}$/.test(v.trim());
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
/** Loose international phone check: optional +, 6-15 digits, spaces allowed. */
export const isPhone = (v: string) => /^\+?[0-9 ]{6,18}$/.test(v.trim()) && v.replace(/\D/g, '').length >= 6;
export const isProvince = (v: string) => (ITALIAN_PROVINCES as readonly string[]).includes(v.trim().toUpperCase());
/** Italian personal tax code (codice fiscale), format check only. */
export const isTaxCode = (v: string) => /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/i.test(v.trim());
/** Italian VAT number (partita IVA) with Luhn-style checksum. */
export function isVatNumber(v: string): boolean {
  const s = v.trim().replace(/^IT/i, '');
  if (!/^\d{11}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    let d = Number(s[i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export function validateAddress(a: Address): FieldErrors<Address> {
  const e: FieldErrors<Address> = {};
  if (a.fullName.trim().length < 2) e.fullName = 'Inserisci nome e cognome';
  if (a.line1.trim().length < 3) e.line1 = 'Inserisci via e numero civico';
  if (a.city.trim().length < 2) e.city = 'Inserisci la città';
  if (!isProvince(a.province)) e.province = 'Provincia non valida (es. LU)';
  if (!isPostalCode(a.postalCode)) e.postalCode = 'CAP di 5 cifre';
  if (!isPhone(a.phone)) e.phone = 'Numero di telefono non valido';
  return e;
}

export type InvoiceDetails = {
  companyName?: string;
  taxCode?: string;
  vatNumber?: string;
  sdiCode?: string;
  pec?: string;
};

export function validateInvoice(i: InvoiceDetails): FieldErrors<InvoiceDetails> {
  const e: FieldErrors<InvoiceDetails> = {};
  const hasVat = Boolean(i.vatNumber?.trim());
  if (!hasVat && !isTaxCode(i.taxCode ?? '')) e.taxCode = 'Codice fiscale non valido';
  if (hasVat && !isVatNumber(i.vatNumber!)) e.vatNumber = 'Partita IVA non valida';
  if (hasVat && !i.companyName?.trim()) e.companyName = 'Inserisci la ragione sociale';
  if (hasVat && !(i.sdiCode?.trim().length === 7 || isEmail(i.pec ?? ''))) e.sdiCode = 'Codice SDI (7 caratteri) o PEC obbligatori';
  return e;
}

export const MAX_LINE_QUANTITY = 99;
export const isValidQuantity = (q: number) => Number.isSafeInteger(q) && q > 0 && q <= MAX_LINE_QUANTITY;
