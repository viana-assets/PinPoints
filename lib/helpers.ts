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
//
// Der Zustand der Wiedervorlage hieß bis zum 14.09.2026 „orange", nach seiner Farbe. Als die
// Farbe von Orange auf Hellblau wechselte (Orange und Rot waren auf der vollen Karte kaum
// auseinanderzuhalten), wurde aus dem Namen eine Falschaussage: `orange: "#4FA8DC"`. Deshalb
// heißt er jetzt nach dem, was er bedeutet, und nicht nach dem, wie er aussieht. Die drei
// übrigen Namen bleiben vorerst – sie sind dieselbe Schwäche, aber ihre Farben stehen nicht
// zur Debatte, und ein halber Umbau ist schlechter als ein aufgeschobener.
export type KundenZustand = "green" | "wiedervorlage" | "red" | "kein-interesse";

// Welcher Zustand gilt für diesen Kunden? Die Reihenfolge der Prüfungen ist die Aussage:
//
//  1. „Kein Interesse" schlägt alles. Wer abgesagt hat, gehört nicht auf die Anrufliste, egal
//     wie lange der letzte Kontakt her ist.
//  2. Eine Wiedervorlage in der ZUKUNFT ist hellblau: eingeplant, aber noch nicht dran.
//     Ist der Stichtag erreicht, fällt der Kunde durch – und landet unten bei „fällig/rot".
//     Genau das ist der Sinn einer Wiedervorlage: sie taucht von selbst wieder auf.
//  3. Sonst gilt wie bisher der Wiedervorlage-Zeitraum aus den Einstellungen.
//
// `heute` ist überschreibbar, damit sich die Stichtagsgrenze prüfen lässt, ohne die Systemzeit
// zu verstellen (siehe tests/kundenzustand.test.ts).
export function effectiveColor(cust: Customer, periodMonths: number, heute: string = todayStr()): KundenZustand {
  if (cust.kontakt_ergebnis === "kein_interesse") return "kein-interesse";
  if (cust.wiedervorlage_am && cust.wiedervorlage_am > heute) return "wiedervorlage";
  if (cust.wiedervorlage_am) return "red";
  return isContactedActive(cust, periodMonths) ? "green" : "red";
}

// Beschriftung der Zustände – einmal zentral, damit Karte, Liste und Kundenfenster nicht drei
// verschiedene Wörter für dasselbe benutzen.
export const KUNDEN_ZUSTAND_LABEL: Record<KundenZustand, string> = {
  green: "kontaktiert",
  wiedervorlage: "Wiedervorlage",
  red: "offen",
  "kein-interesse": "kein Interesse",
};


// Reihenfolge in Legenden und Auswahlen: nach Dringlichkeit, nicht alphabetisch und nicht in
// der Reihenfolge, in der die Zustände zufällig im Typ stehen. Wer eine Liste der Zustände
// braucht, nimmt diese – damit sie überall gleich sortiert erscheint.
export const KUNDEN_ZUSTAND_REIHENFOLGE: readonly KundenZustand[] = [
  "red", "wiedervorlage", "green", "kein-interesse",
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
// Ziel für die Navigation. Die Koordinate wird nur benutzt, wenn sie GENAUER ist als der
// Adresstext – also bei 'exakt' und bei 'hand'.
//
// Bei 'ungefaehr' (Migration 35) ist sie es nicht: Der Punkt ist die Straßenmitte, weil
// OpenStreetMap die Hausnummer nicht kennt. Der Adresstext enthält sie aber – und Google
// bzw. Apple finden sie. Die Koordinate mitzugeben hieße hier, die Navigation an den Anfang
// der Straße zu schicken, obwohl die Hausnummer danebensteht.
export function navigationUrls(cust: Customer): { google: string; apple: string } {
  const hatPunkt = cust.lat != null && cust.lng != null;
  const punktIstGenauer = hatPunkt && (cust.geo_genauigkeit ?? "exakt") !== "ungefaehr";
  const hasCoords = punktIstGenauer;
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
// Die Hausnummer aus der einzeiligen Adresse – gebraucht für eine einzige, aber wichtige
// Frage: Verliert ein Adressvorschlag sie?
//
// Der Kartendienst antwortet auf „Strengenbergstraße 54, 90607 Rückersdorf" bereitwillig mit
// „Strengenbergstraße, 90607 Rückersdorf" – er kennt die Straße, nur nicht das Haus. Dieser
// Vorschlag ist nicht falsch, aber er ist ÄRMER als das, was schon dasteht. Ihn unbeschriftet
// neben „Übernehmen" zu setzen heißt: mit einem Klick eine gute Adresse verschlechtern, und
// die Fahrt endet am Anfang der Straße.
//
// Gesucht wird im Straßenteil (alles vor dem ersten Komma bzw. vor der Postleitzahl) eine Zahl
// am Ende, optional mit Buchstabe: „16b", „54", „3-5". Eine Zahl IM Straßennamen („Straße des
// 17. Juni") steht nicht am Ende und stört deshalb nicht.
export function hausnummerAus(adresse: string | null): string | null {
  if (!adresse) return null;
  let strasse = adresse.split(",")[0];
  if (strasse === adresse) {
    const plz = adresse.match(/(?<!\d)\d{5}(?!\d)/);
    if (plz && plz.index != null) strasse = adresse.slice(0, plz.index);
  }
  const treffer = strasse.trim().match(/(\d+\s*[a-zA-Z]?)$/);
  return treffer ? treffer[1].replace(/\s+/g, "") : null;
}

// Dieselbe Adresse ohne die Hausnummer – der zweite Versuch beim Geokodieren.
// Aus „Allerheiligenweg 36b, 90530 Wendelstein" wird „Allerheiligenweg, 90530 Wendelstein".
// Gibt null zurück, wenn es gar keine Hausnummer gab: Dann wäre der zweite Versuch derselbe
// wie der erste, und eine zweite Anfrage an einen kostenlosen Fremddienst ohne Aussicht auf
// ein anderes Ergebnis ist schlicht unhöflich.
export function adresseOhneHausnummer(adresse: string | null): string | null {
  if (!adresse) return null;
  const nummer = hausnummerAus(adresse);
  if (!nummer) return null;
  const teile = adresse.split(",");
  const strasse = teile[0].replace(/\s*\d+\s*[a-zA-Z]?\s*$/, "").trim();
  if (!strasse) return null;
  return [strasse, ...teile.slice(1).map((t) => t.trim())].filter(Boolean).join(", ");
}

// Ist der Vorschlag in dieser einen Hinsicht schlechter als das, was schon dasteht?
export function vorschlagOhneHausnummer(bisher: string | null, vorschlag: string | null): boolean {
  return hausnummerAus(bisher) !== null && hausnummerAus(vorschlag) === null;
}

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
// Die Anfrage, die an den Kartendienst geht – und die Stelle, an der bis zum 14.09.2026 ein
// stiller Fehler saß.
//
// Die Absicht war gut: Steht in der Adresse kein Ort, hilft „, Nürnberg, Deutschland" dem
// Dienst auf die Sprünge. Die Bedingung war aber „enthält NICHT das Wort Nürnberg" – und
// damit bekam jede Adresse aus dem Umland diesen Zusatz:
//
//     „Strengenbergstraße 54, 90607 Rückersdorf"  →  „…, 90607 Rückersdorf, Nürnberg, Deutschland"
//
// Das ist ein Widerspruch: Rückersdorf liegt nicht in Nürnberg. Der Dienst findet daraufhin
// gar nichts – auch die Straße allein nicht. Betroffen war der halbe Umkreis: Rückersdorf,
// Zirndorf, Fürth, Schwabach, Büchenbach, Wendelstein, Heroldsberg. Genau die Kunden, die
// unter „Ohne Karte" hängen blieben, während die Adressprüfung daneben die Straße mühelos
// vorschlug – die fragt nämlich einen anderen Dienst, ohne diesen Zusatz.
//
// Die richtige Frage ist nicht „steht Nürnberg drin?", sondern „steht überhaupt ein Ort
// drin?". Eine Postleitzahl beantwortet das eindeutig: Wo eine steht, ist der Ort bestimmt,
// und jeder Zusatz kann die Sache nur verschlechtern.
export function geocodeAnfrage(address: string): string {
  const stadt = DEFAULT_GEOCODE_REGION.split(",")[0].trim();
  if (plzAus(address)) return address;
  if (ohneUmlaute(address).includes(ohneUmlaute(stadt))) return address;
  return address + ", " + DEFAULT_GEOCODE_REGION;
}

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; genauigkeit: "exakt" | "ungefaehr" } | null> {
  const ergaenzen = geocodeAnfrage;

  const resp = await fetch("/api/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: ergaenzen(address),
      // Der Rückfallweg wird HIER gebildet und nicht auf dem Server: Was eine Hausnummer ist,
      // weiß `hausnummerAus()`, und diese Regel soll es genau einmal geben (sie entscheidet
      // auch in der Adressprüfung, ob ein Vorschlag ärmer ist als die vorhandene Adresse).
      ohneHausnummer: (() => {
        const kurz = adresseOhneHausnummer(address);
        return kurz ? ergaenzen(kurz) : null;
      })(),
    }),
  });
  if (!resp.ok) throw new Error("Geocoding fehlgeschlagen");
  const data = await resp.json();
  if (data == null || data.lat == null || data.lng == null) return null;
  return {
    lat: data.lat as number,
    lng: data.lng as number,
    genauigkeit: data.genauigkeit === "ungefaehr" ? "ungefaehr" : "exakt",
  };
}

// ---------------------------------------------------------------- Regalwand
//
// Ab hier: die Regeln hinter der Lageransicht (docs/lager-ausbaukonzept.md, „Grafisch
// arbeiten"). Sie stehen bewusst hier und nicht in der Komponente – die Anordnung eines
// Lagers ist eine Aussage über die Daten, keine über die Darstellung, und sie wird an zwei
// Stellen gebraucht (Regalwand am Bildschirm, Reihenliste am Handy).

// Ein Lagerplatz-Code trägt seine Anordnung schon in sich: „BC-01" ist der erste Platz in
// Reihe BC. Genau so legt `buildSlotCodes` sie an – Präfix, Bindestrich, laufende Nummer.
// Deshalb braucht die Regalwand KEINE Migration und keine Koordinatenfelder: Was im Raum
// nebeneinander liegt, steht schon nebeneinander im Code.
//
// Toleranz gegenüber Handeingaben: Wer einen Platz einzeln über „+ Platz" anlegt, tippt
// vielleicht „A01" ohne Strich oder „7" ohne Präfix. Beides wird verstanden. Was gar keine
// Nummer enthält, landet in einer Reihe ohne Namen – sichtbar, aber nicht sortiert.
export function reiheAusCode(code: string): { reihe: string; nummer: number | null } {
  const roh = code.trim();
  const strich = roh.indexOf("-");
  if (strich > 0) {
    const rest = roh.slice(strich + 1).trim();
    return { reihe: roh.slice(0, strich).trim(), nummer: /^\d+$/.test(rest) ? parseInt(rest, 10) : null };
  }
  const geteilt = /^([^\d\s]+)[\s]*(\d+)$/.exec(roh);
  if (geteilt) return { reihe: geteilt[1], nummer: parseInt(geteilt[2], 10) };
  if (/^\d+$/.test(roh)) return { reihe: "", nummer: parseInt(roh, 10) };
  return { reihe: "", nummer: null };
}

// Die Plätze eines Lagers zu Reihen gebündelt, jede Reihe nach Nummer sortiert.
//
// Warum hier sortiert wird, obwohl die Datenbank schon `order("code")` liefert: alphabetisch
// steht „A-10" vor „A-2". Bei zweistelliger Nummerierung fällt das nicht auf, bei einstelliger
// sofort – und die Regalwand behauptet eine räumliche Anordnung. Eine falsche Reihenfolge
// wäre hier keine Schönheitsfrage, sondern eine Falschaussage über das Regal.
//
// Die Reihen selbst behalten die Reihenfolge ihres ersten Auftretens (Map merkt sie sich).
// Das ist die Reihenfolge, in der die Datenbank die Codes liefert – also alphabetisch.
export function nachReihen<T extends { code: string }>(plaetze: T[]): { reihe: string; plaetze: T[] }[] {
  const gruppen = new Map<string, T[]>();
  for (const platz of plaetze) {
    const { reihe } = reiheAusCode(platz.code);
    const liste = gruppen.get(reihe);
    if (liste) liste.push(platz);
    else gruppen.set(reihe, [platz]);
  }
  return [...gruppen.entries()].map(([reihe, liste]) => ({
    reihe,
    plaetze: liste.slice().sort((a, b) => {
      const na = reiheAusCode(a.code).nummer;
      const nb = reiheAusCode(b.code).nummer;
      if (na != null && nb != null) return na - nb;
      // Nummerierte Plätze zuerst, alles Übrige alphabetisch hinten dran.
      if (na != null) return -1;
      if (nb != null) return 1;
      return a.code.localeCompare(b.code, "de");
    }),
  }));
}

// Das DOT-Kürzel „2523" heißt: Kalenderwoche 25 des Jahres 2023. Uns interessiert nur das
// Jahr. Trennzeichen werden geschluckt, damit „25/23" dasselbe ergibt wie „2523".
//
// Die Grenze bei 60: Zweistellige Jahreszahlen über 60 stammen aus dem letzten Jahrhundert.
// Ein Reifen von 1995 ist absurd alt – aber wer ihn so einträgt, soll auch 1995 herausbekommen
// und nicht 2095, was jede Altersrechnung ins Negative kippen ließe.
export function dotJahr(dot: string | null | undefined): number | null {
  const ziffern = (dot ?? "").replace(/\D/g, "");
  if (ziffern.length !== 4) return null;
  const jj = parseInt(ziffern.slice(2), 10);
  if (Number.isNaN(jj)) return null;
  return jj > 60 ? 1900 + jj : 2000 + jj;
}

// Warum leuchtet an diesem Platz ein Punkt? Der Punkt sagt „etwas", diese Liste sagt „was" –
// im Tooltip an der Kachel und oben im Zuordnungsfenster.
//
// Es ist Absicht, dass die Gründe TEXTE sind und keine Kennungen: Sie werden nur gelesen,
// nirgends ausgewertet, und ein Text kann genau das sagen, was der Fall ist („Reifen von
// 2018 – 8 Jahre alt") statt einer Stufe, die man erst wieder übersetzen muss.
//
// Die Grenzen kommen von außen, nicht aus dieser Datei – dieselbe Aufteilung wie bei
// `profilLage`: Die Regel steht hier, die Zahlen in lib/constants.ts.
export function handlungsgruende(
  satz: {
    erfassungsart?: "sammel" | "einzeln";
    profiltiefe_mm: number | null;
    dot_date: string | null;
    created_at: string;
  },
  raeder: { profiltiefe_mm: number | null }[],
  grenzen: { kritischMm: number; dotJahre: number; liegtTage: number },
  heute: Date = new Date()
): string[] {
  const gruende: string[] = [];

  const mm = satzProfilMm(satz, raeder);
  if (mm == null) gruende.push("Profiltiefe nie gemessen");
  else if (mm < grenzen.kritischMm) gruende.push(`Profil ${profilText(mm)} – unter ${profilText(grenzen.kritischMm)}`);

  const jahr = dotJahr(satz.dot_date);
  if (jahr != null) {
    const alter = heute.getFullYear() - jahr;
    if (alter >= grenzen.dotJahre) gruende.push(`Reifen von ${jahr} – ${alter} Jahre alt`);
  }

  const eingelagert = new Date(satz.created_at);
  if (!Number.isNaN(eingelagert.getTime())) {
    const tage = Math.floor((heute.getTime() - eingelagert.getTime()) / 86_400_000);
    if (tage >= grenzen.liegtTage) {
      const monate = Math.floor(tage / 30);
      gruende.push(`liegt seit ${monate} Monaten unberührt`);
    }
  }

  return gruende;
}
