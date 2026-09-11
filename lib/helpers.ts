import type { ArticlePrice, Customer, Order, OrderArticle } from "./types";

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE");
}

// Die vier früheren Termin-Hilfsfunktionen (formatApptDateTime/apptDateTime/isApptPast/
// nextAppointment) sind entfallen: seit Migration 07 ist ein Termin ein Auftrag mit
// Uhrzeit, die Entsprechungen heißen formatOrderDateTime/orderDateTime/isOrderPast/
// nextOrder. Sie wurden nirgends mehr aufgerufen (Review-Befund D7).

export function formatOrderDateTime(o: Order): string {
  return formatDate(o.order_date) + (o.time ? `, ${o.time} Uhr` : "");
}

export function orderDateTime(o: Order): Date {
  return new Date(o.order_date + "T" + (o.time || "23:59") + ":00");
}

export function isOrderPast(o: Order): boolean {
  return orderDateTime(o).getTime() < Date.now();
}

export function nextOrder(orders: Order[]): Order | null {
  const list = orders
    .filter((o) => o.order_date && o.status !== "erledigt" && !isOrderPast(o))
    .slice()
    .sort((a, b) => orderDateTime(a).getTime() - orderDateTime(b).getTime());
  return list[0] || null;
}

export function isContactedActive(cust: Customer, periodMonths: number): boolean {
  if (cust.status !== "kontaktiert" || !cust.last_contact) return false;
  const last = new Date(cust.last_contact);
  const limit = new Date(last);
  limit.setMonth(limit.getMonth() + (periodMonths || 3));
  return new Date() < limit;
}

// Die vier Zustände, in denen ein Kunde auf Karte und Liste erscheinen kann (Migration 23).
// Der Name „Farbe" ist historisch – gemeint ist der Zustand, die Farbe ist nur seine Anzeige.
export type KundenZustand = "green" | "orange" | "red" | "kein-interesse";

// Welcher Zustand gilt für diesen Kunden? Die Reihenfolge der Prüfungen ist die Aussage:
//
//  1. „Kein Interesse" schlägt alles. Wer abgesagt hat, gehört nicht auf die Anrufliste, egal
//     wie lange der letzte Kontakt her ist.
//  2. Eine Wiedervorlage in der ZUKUNFT ist orange: eingeplant, aber noch nicht dran.
//     Ist der Stichtag erreicht, fällt der Kunde durch – und landet unten bei „fällig/rot".
//     Genau das ist der Sinn einer Wiedervorlage: sie taucht von selbst wieder auf.
//  3. Sonst gilt wie bisher der Wiedervorlage-Zeitraum aus den Einstellungen.
//
// `heute` ist überschreibbar, damit sich die Stichtagsgrenze prüfen lässt, ohne die Systemzeit
// zu verstellen (siehe tests/kundenzustand.test.ts).
export function effectiveColor(cust: Customer, periodMonths: number, heute: string = todayStr()): KundenZustand {
  if (cust.kontakt_ergebnis === "kein_interesse") return "kein-interesse";
  if (cust.wiedervorlage_am && cust.wiedervorlage_am > heute) return "orange";
  if (cust.wiedervorlage_am) return "red";
  return isContactedActive(cust, periodMonths) ? "green" : "red";
}

// Beschriftung der Zustände – einmal zentral, damit Karte, Liste und Kundenfenster nicht drei
// verschiedene Wörter für dasselbe benutzen.
export const KUNDEN_ZUSTAND_LABEL: Record<KundenZustand, string> = {
  green: "kontaktiert",
  orange: "Wiedervorlage",
  red: "offen",
  "kein-interesse": "kein Interesse",
};


// Reihenfolge in Legenden und Auswahlen: nach Dringlichkeit, nicht alphabetisch und nicht in
// der Reihenfolge, in der die Zustände zufällig im Typ stehen. Wer eine Liste der Zustände
// braucht, nimmt diese – damit sie überall gleich sortiert erscheint.
export const KUNDEN_ZUSTAND_REIHENFOLGE: readonly KundenZustand[] = [
  "red", "orange", "green", "kein-interesse",
];

export function telHref(phone: string | null | undefined): string {
  return (phone || "").replace(/[^\d+]/g, "");
}

export function getPhoneNumbers(cust: Customer): { label: string; number: string }[] {
  const nums: { label: string; number: string }[] = [];
  if (cust.phone_mobile) nums.push({ label: "Mobil", number: cust.phone_mobile });
  if (cust.phone_landline) nums.push({ label: "Festnetz", number: cust.phone_landline });
  return nums;
}

// Navigations-Links zu einem Kunden: bevorzugt die geokodierte Position (lat/lng), falls
// vorhanden, sonst die Adresse als Text – jeweils als fertige "Route dorthin"-Links für Google
// Maps und Apple Karten, die sich auf dem Smartphone direkt in der jeweiligen App öffnen.
export function navigationUrls(cust: Customer): { google: string; apple: string } {
  const hasCoords = cust.lat != null && cust.lng != null;
  const dest = hasCoords ? `${cust.lat},${cust.lng}` : cust.address;
  const q = encodeURIComponent(dest);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    apple: hasCoords
      ? `https://maps.apple.com/?daddr=${q}&dirflg=d`
      : `https://maps.apple.com/?daddr=${q}`,
  };
}

// ---------------------------------------------------------------- Artikelstammdaten
// Standard-MwSt.-Satz (Deutschland), Vorbelegung im Preis-Formular und Fallback, wenn einem
// Artikel noch kein Preis hinterlegt ist – zentral hier statt an zwei Stellen in
// app/page.tsx als literale Zahl (siehe docs/konstanten-register.md).
export const DEFAULT_VAT_RATE = 19;

// Standardtitel eines Termins. Bis dahin hießen alle Termine schlicht "Termin", was in einer
// Liste nichts unterscheidet – mit dem Kundennamen ist auf einen Blick klar, worum es geht.
// Bewusst nur eine Vorbelegung: wer einen sprechenderen Titel will, überschreibt ihn.
export function terminTitel(kundenName: string | null | undefined): string {
  const name = (kundenName || "").trim();
  return name ? `Termin – ${name}` : "Termin";
}

export function formatEUR(amount: number): string {
  return amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

// Der zu einem Stichtag (Standard: heute) gültige Preis-Eintrag eines Artikels – der jüngste
// Eintrag, dessen Gültigkeitszeitraum den Stichtag einschließt (valid_to = null heißt
// "bis auf Weiteres"). Gibt es keinen passenden Eintrag (z. B. noch kein Preis hinterlegt),
// wird null zurückgegeben statt eines Fantasiepreises.
export function currentArticlePrice(prices: ArticlePrice[], onDate?: string): ArticlePrice | null {
  const day = onDate || todayStr();
  const candidates = prices
    .filter((p) => p.valid_from <= day && (!p.valid_to || p.valid_to >= day))
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  return candidates[0] || null;
}

// ---------------------------------------------------------------- Profiltiefe
//
// Die eine Zahl, die einen eingelagerten Satz beschreibt – egal, wie er erfasst wurde. Bei
// Sammelmessung ist es der Wert am Satz, bei Einzelerfassung das Minimum der Räder: Das
// schwächste Rad entscheidet, wann gewechselt werden muss, nicht der Durchschnitt. Ein
// Mittelwert würde den Fall „drei Räder gut, eins durch" verschwinden lassen – also genau den
// Fall, um dessentwillen einzeln gemessen wird.
export function satzProfilMm(
  satz: { erfassungsart?: "sammel" | "einzeln"; profiltiefe_mm: number | null },
  raeder: { profiltiefe_mm: number | null }[] = []
): number | null {
  if ((satz.erfassungsart ?? "sammel") === "sammel") return satz.profiltiefe_mm;
  const werte = raeder.map((r) => r.profiltiefe_mm).filter((w): w is number => w != null);
  return werte.length === 0 ? null : Math.min(...werte);
}

export type ProfilLage = "ohne" | "gut" | "hinweis" | "kritisch";

// Wie steht es um diese Profiltiefe? Drei Stufen statt einer Ampel mit fünf Farben: Der
// Techniker braucht vor Ort nur zu wissen, ob er etwas ansprechen soll.
export function profilLage(
  mm: number | null,
  grenzen: { hinweis: number; kritisch: number }
): ProfilLage {
  if (mm == null) return "ohne";
  if (mm < grenzen.kritisch) return "kritisch";
  if (mm < grenzen.hinweis) return "hinweis";
  return "gut";
}

// Anzeige mit einer Nachkommastelle und Komma – „3,1 mm". `toFixed` allein liefert einen
// Punkt, und 3.1 mm liest sich in einer deutschen Oberfläche falsch.
export function profilText(mm: number | null): string {
  return mm == null ? "–" : `${mm.toFixed(1).replace(".", ",")} mm`;
}

// Die Räder nach ihrem Satz gruppiert. Listen wie die Saisonliste oder das Lagerregal fragen
// für jede Zeile nach den Rädern EINES Satzes; ohne diese Gruppierung wäre das je Zeile ein
// Durchlauf durch alle Räder – bei 400 Sätzen also 400 × alle. Einmal gruppieren, dann
// nachschlagen.
export function raederNachSatz<T extends { tire_storage_id: string }>(raeder: T[]): Map<string, T[]> {
  const nach = new Map<string, T[]>();
  for (const rad of raeder) {
    const liste = nach.get(rad.tire_storage_id);
    if (liste) liste.push(rad);
    else nach.set(rad.tire_storage_id, [rad]);
  }
  return nach;
}

// ---------------------------------------------------------------- Saisonliste
//
// Die Postleitzahl aus der einzeiligen Adresse („Rehhofstraße 16, 90482 Nürnberg"). Es gibt
// kein eigenes PLZ-Feld an den Kunden, und eines nachzurüsten hieße, 424 gewachsene Adressen
// zu zerlegen – für einen Filter, der mit dieser Zeile auskommt. Gesucht wird eine
// fünfstellige Zahl, die nicht Teil einer längeren Zahl ist; die Hausnummer davor stört
// deshalb nicht.
export function plzAus(adresse: string | null): string | null {
  if (!adresse) return null;
  const treffer = /(?<!\d)(\d{5})(?!\d)/.exec(adresse);
  return treffer ? treffer[1] : null;
}

// Welche Saison steht als Nächstes an? Im Herbst brauchen die Kunden ihre WINTERreifen – die
// bei uns liegen. Im Frühjahr die Sommerreifen. Der Vorschlag ist nur die Voreinstellung der
// Liste; umschalten kann man jederzeit.
//
// Die Grenzen sind bewusst großzügig: Der Wechsel läuft über Wochen, und wer im Juli schon
// plant, will die Winterliste sehen, nicht die vom letzten Frühjahr.
export function naechsteSaison(datum: Date = new Date()): "sommer" | "winter" {
  const monat = datum.getMonth() + 1; // 1 = Januar
  return monat >= 8 || monat <= 1 ? "winter" : "sommer";
}

// ---------------------------------------------------------------- Terminerinnerung
//
// Die Uhrzeit eines Auftrags als Minuten seit Mitternacht. null, wenn nichts oder Unsinn
// dransteht – ein Auftrag ohne Uhrzeit ist kein Termin und bekommt keine Erinnerung.
export function minutenAusUhrzeit(zeit: string | null): number | null {
  if (!zeit) return null;
  const treffer = /^(\d{1,2}):(\d{2})/.exec(zeit.trim());
  if (!treffer) return null;
  const stunde = parseInt(treffer[1], 10);
  const minute = parseInt(treffer[2], 10);
  if (stunde > 23 || minute > 59) return null;
  return stunde * 60 + minute;
}

// Ist jetzt der Moment, die Erinnerung an diesen Termin zu verschicken? Beide Zeiten sind
// Minuten seit Mitternacht desselben Tages.
//
// Das Fenster ist absichtlich breiter als eine Minute: fällt ein Lauf des Zeitgebers aus,
// holt der nächste die Erinnerung nach. Nach hinten ist es dagegen zu: eine Erinnerung an
// einen Termin, der schon läuft, ist keine Erinnerung mehr, sondern ein Vorwurf. Dass im
// Fenster nur EINE Meldung entsteht, regelt nicht diese Funktion, sondern der eindeutige
// Schlüssel in `push_versand` (Migration 27).
export function erinnerungFaellig(
  terminMinuten: number,
  jetztMinuten: number,
  vorlaufMinuten: number,
  fensterMinuten: number
): boolean {
  const rest = terminMinuten - jetztMinuten;
  return rest <= vorlaufMinuten && rest >= vorlaufMinuten - fensterMinuten;
}

// Prüft, ob ein geänderter Preiszeitraum sich mit einem anderen Preis DESSELBEN Artikels
// überschneidet – die eigene Zeile (`priceId`) bleibt dabei außen vor. Die Datenbank lehnt
// Überschneidungen seit Migration 18 ohnehin ab; hier geht es darum, das vorher zu merken und
// verständlich zu melden statt einen Constraint-Namen anzuzeigen. `valid_to = null` heißt
// "bis auf Weiteres" und wird als fernes Datum behandelt.
export const OFFENES_ENDE = "9999-12-31";

export function preisZeitraumKollision(
  prices: ArticlePrice[],
  priceId: string,
  articleId: string,
  validFrom: string,
  validTo: string | null
): boolean {
  return prices.some(
    (p) =>
      p.id !== priceId &&
      p.article_id === articleId &&
      p.valid_from <= (validTo ?? OFFENES_ENDE) &&
      (p.valid_to ?? OFFENES_ENDE) >= validFrom
  );
}

// Netto-, MwSt.- und Brutto-Summe der einem Auftrag zugeordneten Artikel-Positionen, jeweils
// unter Berücksichtigung von Menge und individuellem Rabatt je Position.
export function orderArticleTotals(rows: OrderArticle[]): { net: number; vat: number; gross: number } {
  let net = 0, vat = 0;
  rows.forEach((r) => {
    const lineNet = r.quantity * r.net_price * (1 - (r.discount_percent || 0) / 100);
    net += lineNet;
    vat += lineNet * (r.vat_rate / 100);
  });
  return { net, vat, gross: net + vat };
}

// Region, die an eine Adresse ohne erkennbaren Stadtnamen angehängt wird, damit die
// kostenlose Nominatim/OpenStreetMap-Geokodierung eindeutige Treffer liefert – zentral hier
// benannt statt als literaler String in der Funktion (siehe docs/konstanten-register.md).
// Wächst das Geschäft über die Region hinaus, hier anpassen (perspektivisch: Einstellung
// statt Code-Konstante, siehe docs/roadmap.md).
export const DEFAULT_GEOCODE_REGION = "Nürnberg, Deutschland";

// Vergleich ohne Umlaute, damit "Nürnberg" und "Nuernberg" gleich behandelt werden – und
// damit der Stadtname NICHT ein zweites Mal als Literal im Code steht, sondern aus
// DEFAULT_GEOCODE_REGION abgeleitet wird (Konstanten-Regel, siehe docs/README.md).
function ohneUmlaute(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

// Geokodierung läuft seit Roadmap-Phase 8 über die eigene Serverroute /api/geocode statt
// direkt aus dem Browser gegen Nominatim: dort sitzen Zugriffsschutz, Drosselung, ein
// identifizierender User-Agent und ein Cache (Review-Befund A9). Signatur und Verhalten
// bleiben für die Aufrufer unverändert – null bedeutet weiterhin "keine Position gefunden",
// eine Ausnahme bedeutet "Dienst nicht erreichbar".
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const stadt = DEFAULT_GEOCODE_REGION.split(",")[0].trim();
  const query = ohneUmlaute(address).includes(ohneUmlaute(stadt))
    ? address
    : address + ", " + DEFAULT_GEOCODE_REGION;

  const resp = await fetch("/api/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) throw new Error("Geocoding fehlgeschlagen");
  const data = await resp.json();
  if (data == null || data.lat == null || data.lng == null) return null;
  return { lat: data.lat as number, lng: data.lng as number };
}
