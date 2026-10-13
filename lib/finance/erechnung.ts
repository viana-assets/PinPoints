// E-Rechnung lesen (Finance F2, v148): XRechnung bzw. EN 16931 in beiden Syntaxen – UBL (`<Invoice>`)
// und UN/CEFACT CII (`<rsm:CrossIndustryInvoice>`, auch das XML aus einer ZUGFeRD-/Factur-X-Rechnung).
// Ausgelesen wird nur, was ein Beleg braucht: Lieferant, Nummer, Datum, Fälligkeit und die Beträge je
// Steuersatz. Kein Netz, keine Bibliothek – der Browser liest das XML selbst (DOMParser).
//
// Ein ZUGFeRD-PDF trägt das XML als Anhang; den liest diese Fassung noch nicht – das PDF wird als Bild
// des Belegs abgelegt, die Beträge tippt man ab. Geprüft in tests/financeERechnung.test.ts.

export type ERechnungSteuer = {
  // Steuerkategorie nach EN 16931: S = Standard, AE = Steuerschuldnerschaft des Empfängers (§ 13b),
  // K = innergemeinschaftlich, E = steuerfrei, Z = Nullsatz, O = nicht steuerbar, G = Ausfuhr.
  kategorie: string;
  satz: number;
  netto: number;
  steuer: number;
};

export type ERechnung = {
  format: "UBL" | "CII";
  nummer: string | null;
  datum: string | null;
  faellig: string | null;
  lieferant: string | null;
  ustId: string | null;
  waehrung: string | null;
  steuern: ERechnungSteuer[];
  // Zu zahlen (PayableAmount / DuePayableAmount), sonst Gesamtbetrag mit Steuer.
  brutto: number | null;
};

const zahl = (t: string | null | undefined): number | null => {
  if (t == null || t.trim() === "") return null;
  const n = Number(t.trim());
  return Number.isFinite(n) ? n : null;
};

// Elemente unabhängig vom Namensraum-Präfix suchen (cbc:, cac:, ram:, rsm: …).
function alle(el: Element | Document, name: string): Element[] {
  return Array.from(el.getElementsByTagNameNS("*", name));
}
function kind(el: Element | null | undefined, name: string): Element | null {
  if (!el) return null;
  for (const c of Array.from(el.children)) if (c.localName === name) return c;
  return null;
}
function pfad(el: Element | null | undefined, ...namen: string[]): Element | null {
  let x: Element | null | undefined = el;
  for (const n of namen) x = kind(x, n);
  return x ?? null;
}
const text = (el: Element | null | undefined) => el?.textContent?.trim() || null;

// CII schreibt Daten als 20261013 (Format 102); UBL als 2026-10-13.
function datumLesen(t: string | null): string | null {
  if (!t) return null;
  const s = t.trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function ublLesen(root: Element): ERechnung {
  const lieferantPartei = pfad(root, "AccountingSupplierParty", "Party");
  const name = text(pfad(lieferantPartei, "PartyLegalEntity", "RegistrationName")) ?? text(pfad(lieferantPartei, "PartyName", "Name"));
  const steuerReg = alle(lieferantPartei ?? root, "PartyTaxScheme").map((p) => text(kind(p, "CompanyID"))).find(Boolean) ?? null;
  const steuern: ERechnungSteuer[] = [];
  for (const total of Array.from(root.children).filter((c) => c.localName === "TaxTotal")) {
    for (const sub of Array.from(total.children).filter((c) => c.localName === "TaxSubtotal")) {
      const kat = kind(sub, "TaxCategory");
      steuern.push({
        kategorie: text(kind(kat, "ID")) ?? "S",
        satz: zahl(text(kind(kat, "Percent"))) ?? 0,
        netto: zahl(text(kind(sub, "TaxableAmount"))) ?? 0,
        steuer: zahl(text(kind(sub, "TaxAmount"))) ?? 0,
      });
    }
  }
  const summe = kind(root, "LegalMonetaryTotal");
  return {
    format: "UBL",
    nummer: text(kind(root, "ID")),
    datum: datumLesen(text(kind(root, "IssueDate"))),
    faellig: datumLesen(text(kind(root, "DueDate")) ?? text(pfad(root, "PaymentMeans", "PaymentDueDate"))),
    lieferant: name,
    ustId: steuerReg,
    waehrung: text(kind(root, "DocumentCurrencyCode")),
    steuern,
    brutto: zahl(text(kind(summe, "PayableAmount"))) ?? zahl(text(kind(summe, "TaxInclusiveAmount"))),
  };
}

function ciiLesen(root: Element): ERechnung {
  const dok = kind(root, "ExchangedDocument");
  const handel = kind(root, "SupplyChainTradeTransaction");
  const vereinbarung = kind(handel, "ApplicableHeaderTradeAgreement");
  const verkaeufer = kind(vereinbarung, "SellerTradeParty");
  const abrechnung = kind(handel, "ApplicableHeaderTradeSettlement");
  const ustId = Array.from(verkaeufer?.children ?? [])
    .filter((c) => c.localName === "SpecifiedTaxRegistration")
    .map((r) => kind(r, "ID"))
    .find((id) => id && (id.getAttribute("schemeID") ?? "VA") === "VA");
  const steuern: ERechnungSteuer[] = Array.from(abrechnung?.children ?? [])
    .filter((c) => c.localName === "ApplicableTradeTax")
    .map((t) => ({
      kategorie: text(kind(t, "CategoryCode")) ?? "S",
      satz: zahl(text(kind(t, "RateApplicablePercent"))) ?? 0,
      netto: zahl(text(kind(t, "BasisAmount"))) ?? 0,
      steuer: zahl(text(kind(t, "CalculatedAmount"))) ?? 0,
    }));
  const summe = kind(abrechnung, "SpecifiedTradeSettlementHeaderMonetarySummation");
  const faellig = text(pfad(abrechnung, "SpecifiedTradePaymentTerms", "DueDateDateTime", "DateTimeString"));
  return {
    format: "CII",
    nummer: text(kind(dok, "ID")),
    datum: datumLesen(text(pfad(dok, "IssueDateTime", "DateTimeString"))),
    faellig: datumLesen(faellig),
    lieferant: text(kind(verkaeufer, "Name")),
    ustId: text(ustId),
    waehrung: text(kind(abrechnung, "InvoiceCurrencyCode")),
    steuern,
    brutto: zahl(text(kind(summe, "DuePayableAmount"))) ?? zahl(text(kind(summe, "GrandTotalAmount"))),
  };
}

// null = keine E-Rechnung (anderes XML, kaputt, leer).
export function eRechnungLesen(xml: string): ERechnung | null {
  if (!xml.trim()) return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return null;
  }
  if (doc.getElementsByTagName("parsererror").length) return null;
  const root = doc.documentElement;
  if (!root) return null;
  if (root.localName === "Invoice" || root.localName === "CreditNote") return ublLesen(root);
  if (root.localName === "CrossIndustryInvoice") return ciiLesen(root);
  return null;
}

// Steuerkategorie → Steuerschlüssel von Finance (Migration 88) und welcher Betrag gebucht wird:
// Vorsteuer-Schlüssel nehmen den BRUTTO-Betrag, § 13b und ig. Erwerb den NETTO-Betrag.
export function eRechnungPosten(r: ERechnung): { betrag: number; steuer: string | null; hinweis: string }[] {
  const cent = (n: number) => Math.round(n * 100) / 100;
  return r.steuern.filter((s) => s.netto !== 0).map((s) => {
    if (s.kategorie === "AE") return { betrag: cent(s.netto), steuer: "r13b19", hinweis: "§ 13b – die Steuer schuldest du" };
    if (s.kategorie === "K") return { betrag: cent(s.netto), steuer: "ige19", hinweis: "innergemeinschaftlicher Erwerb" };
    if (s.kategorie === "S" && s.satz === 19) return { betrag: cent(s.netto + s.steuer), steuer: "vst19", hinweis: "19 %" };
    if (s.kategorie === "S" && s.satz === 7) return { betrag: cent(s.netto + s.steuer), steuer: "vst7", hinweis: "7 %" };
    return { betrag: cent(s.netto + s.steuer), steuer: null, hinweis: s.satz ? `${s.satz} % – Steuer selbst prüfen` : "ohne Steuer" };
  });
}
