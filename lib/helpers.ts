import type { ArticlePrice, Customer, Order, OrderArticle } from "./types";
import { formatDate, todayStr } from "./format";

// Die vier früheren Termin-Hilfsfunktionen (formatApptDateTime/apptDateTime/isApptPast/
// nextAppointment) sind entfallen: seit Migration 07 ist ein Termin ein Auftrag mit
// Uhrzeit, die Entsprechungen heißen formatOrderDateTime/orderDateTime/isOrderPast/
// nextOrder. Sie wurden nirgends mehr aufgerufen (Review-Befund D7).

// Datum und Zeitraum in EINER Zeile: „17.09.2026, 15:15 – 16:00 Uhr". Für Kartenpunkte,
// Kundenfenster und überall sonst, wo kein Platz für zwei Zeilen ist.
//
// Die Endzeit stand hier bis zum 17.09.2026 nicht – Migration 37 hatte sie eingeführt, aber
// nur die zweizeilige Darstellung nutzte sie. Man sah, wann der Techniker kommt, und nicht,
// wie lange er bleibt; genau daran hängt aber, ob der nächste Termin noch draufpasst. Die
// Regel steht in `terminZeitraum` und wird hier nur um das Datum ergänzt: zwei Rechenwege für
// dieselbe Uhrzeitangabe wären zwei Uhrzeiten.
export function formatOrderDateTime(o: Order): string {
  const zeit = terminZeitraum(o);
  return formatDate(o.order_date) + (zeit ? `, ${zeit}` : "");
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
export type KundenZustand = "green" | "termin" | "wiedervorlage" | "red" | "kein-interesse" | "laufkundschaft" | "einmalkunde";

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
// `hatTermin` wird ABGELEITET und nicht gespeichert (17.09.2026). Der Unterschied ist der
// ganze Punkt:
//
// Die naheliegende Lösung wäre, beim Anlegen eines Auftrags `last_contact` zu setzen – dann
// wäre die Nadel sofort grün. Nur hängt an `last_contact` die Wiedervorlage-Uhr: Der Kunde
// bliebe drei Monate grün, AUCH wenn der Termin danach storniert wird. Jemand, mit dem nie
// jemand gesprochen hat, verschwände für ein Quartal von der Anrufliste, und nichts wiese
// darauf hin. Genau dieser Fehler wurde am 29.08.2026 einmal ausgebaut
// (siehe docs/termine-kontakt-auftrag-analyse.md), er soll nicht zurückkommen.
//
// Abgeleitet stimmt die Aussage dagegen immer: Wird der Termin storniert oder abgeschlossen,
// fällt der Kunde in derselben Sekunde in seinen Rhythmus zurück. Es gibt nichts
// nachzupflegen, weil nichts gespeichert wurde.
//
// Der Termin steht GANZ OBEN, auch über „kein Interesse": Wer einen Termin vereinbart hat,
// hat das Desinteresse von damals überholt. Sagt er wieder ab, ist er wieder grau – auch das
// ergibt sich von selbst.
export function effectiveColor(
  cust: Customer, periodMonths: number, heute: string = todayStr(), hatTermin = false
): KundenZustand {
  // Die Laufkundschaft steht VOR allem anderen, auch vor einem Termin: Sie ist kein Kunde, den
  // man anruft, sondern ein Sammelposten für Barverkäufe (Migration 53). Ohne diesen Ausstieg
  // stünde sie für immer rot in der Anrufliste – „noch nicht kontaktiert" bei jemandem, den es
  // als Person gar nicht gibt.
  if (cust.laufkundschaft) return "laufkundschaft";
  if (hatTermin) return "termin";
  // Der Einmalkunde (Migration 57) steht NACH dem Termin: Solange ein Termin vor ihm liegt, ist
  // er ein Termin wie jeder andere – dunkelblaue Nadel, in der Liste „Termin". Danach fällt er
  // nicht auf Rot zurück, sondern aus der Anrufliste und von der Karte: Man weiß ja schon, dass
  // er nicht wiederkommt. Haken heraus, und er läuft wieder im normalen Rhythmus.
  if (cust.einmalkunde) return "einmalkunde";
  if (cust.kontakt_ergebnis === "kein_interesse") return "kein-interesse";
  if (cust.wiedervorlage_am && cust.wiedervorlage_am > heute) return "wiedervorlage";
  if (cust.wiedervorlage_am) return "red";
  return isContactedActive(cust, periodMonths) ? "green" : "red";
}

// Welche Kunden haben einen Termin vor sich? Einmal gebildet statt je Kunde durch alle
// Aufträge zu laufen – bei 4500 Kunden und ein paar tausend Aufträgen ist das der Unterschied
// zwischen einer Schleife und einer Multiplikation.
//
// „Vor sich" heißt: offen oder in Arbeit, Datum ab heute. Ein erledigter Auftrag zählt nicht –
// der schreibt seinen Kontakt beim Abschließen selbst (Migration 47). Ein stornierter oder
// gelöschter erst recht nicht.
export function kundenMitTermin(
  auftraege: { customer_id: string; order_date: string; status: string; deleted_at?: string | null }[],
  heute: string = todayStr()
): Set<string> {
  const ids = new Set<string>();
  auftraege.forEach((o) => {
    if (o.deleted_at) return;
    if (o.status !== "offen" && o.status !== "in_arbeit") return;
    if (!o.order_date || o.order_date < heute) return;
    ids.add(o.customer_id);
  });
  return ids;
}

// Beschriftung der Zustände – einmal zentral, damit Karte, Liste und Kundenfenster nicht drei
// verschiedene Wörter für dasselbe benutzen.
export const KUNDEN_ZUSTAND_LABEL: Record<KundenZustand, string> = {
  green: "kontaktiert",
  termin: "Termin",
  wiedervorlage: "Wiedervorlage",
  red: "offen",
  "kein-interesse": "kein Interesse",
  laufkundschaft: "Laufkundschaft",
  einmalkunde: "Einmalkunde",
};


// Reihenfolge in Legenden und Auswahlen: nach Dringlichkeit, nicht alphabetisch und nicht in
// der Reihenfolge, in der die Zustände zufällig im Typ stehen. Wer eine Liste der Zustände
// braucht, nimmt diese – damit sie überall gleich sortiert erscheint.
//
// Die Laufkundschaft steht hier bewusst NICHT: Diese Liste treibt die Kartenlegende und den
// Kartenfilter, und die Laufkundschaft hat keine Anschrift, also auch keine Nadel. Ein
// Filterknopf für einen einzigen Datensatz, der nie auf der Karte erscheint, wäre eine
// Schaltfläche, die immer null zeigt.
//
// Der Einmalkunde (Migration 57) steht aus demselben Grund nicht hier – aber mit anderem
// Ergebnis: Er HAT eine Anschrift, und genau deshalb muss er hier fehlen. Die Karte zeichnet nur
// Zustände aus dieser Liste; ein Einmalkunde ohne Termin bekommt so keine Nadel. Mit Termin ist
// sein Zustand „termin", und dann steht er da.
export const KUNDEN_ZUSTAND_REIHENFOLGE: readonly KundenZustand[] = [
  "red", "wiedervorlage", "termin", "green", "kein-interesse",
];

// ---------------------------------------------------------------- Handy oder Rechner?
//
// Gebraucht für genau EINE Entscheidung: Soll der Anrufknopf „Auf dem Handy anrufen" anbieten?
// Am Handy wäre das eine Meldung an sich selbst.
//
// WARUM NICHT `matchMedia("(hover: hover) and (pointer: fine)")`, was die naheliegende und
// eigentlich empfohlene Antwort wäre: Am 22.09.2026 auf dem Arbeitsnotebook gemessen – es
// liefert dort `false`. Ein Windows-Notebook mit Touchscreen meldet den Finger als primären
// Zeiger, auch wenn eine Maus angeschlossen ist und niemand den Bildschirm anfasst. Der Knopf
// erschien damit nie, und der Anrufknopf fiel auf „sofort wählen" zurück. Die Medienabfrage
// beantwortet die Frage „kann man hier zeigen und schweben" – nicht die Frage, die hier zählt.
//
// Also andersherum: Die Geräte, die ein Handy SIND, sind eine kurze, bekannte Liste; alles
// andere ist ein Rechner. Das iPad meldet sich seit iPadOS 13 als „Macintosh" und ist nur an
// den Berührungspunkten zu erkennen – deshalb der zweite Teil.
//
// Kennungen zu lesen ist unschön und altert schlecht. Bei einer Ja/Nein-Frage, deren falsche
// Antwort nur einen zusätzlichen Menüeintrag kostet, ist es die verlässlichere Wahl.
export function istHandy(kennung: string, beruehrpunkte: number): boolean {
  if (/iPhone|iPod|Android|Windows Phone/i.test(kennung)) return true;
  // iPad (und ein Mac mit Touch Bar hat keine Berührungspunkte, ist also nicht betroffen).
  if (/iPad/i.test(kennung)) return true;
  return /Macintosh/i.test(kennung) && beruehrpunkte > 1;
}

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
// Das Ziel als Text – Koordinate oder Adresse nach genau dieser Regel. Auch die Tagesroute (E5,
// lib/route.ts) nimmt es, damit beide Wege an dieselbe Einfahrt führen.
export function navigationsZiel(cust: Pick<Customer, "lat" | "lng" | "geo_genauigkeit" | "address">): string {
  const hatPunkt = cust.lat != null && cust.lng != null;
  const punktIstGenauer = hatPunkt && (cust.geo_genauigkeit ?? "exakt") !== "ungefaehr";
  return punktIstGenauer ? `${cust.lat},${cust.lng}` : cust.address;
}

export function navigationUrls(cust: Customer): { google: string; apple: string } {
  const hasCoords = cust.lat != null && cust.lng != null && (cust.geo_genauigkeit ?? "exakt") !== "ungefaehr";
  const dest = navigationsZiel(cust);
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

// ---------------------------------------------------------------- Saison
//
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
// Die EINE Preisrechnung der Anwendung. Alles, was irgendwo einen Betrag anzeigt, fragt hier.
//
// Zwei Dinge sind seit Migration 38 anders, und beide kommen aus dem Betrieb:
//
//  1. STATT PROZENTRABATT EIN ENDPREIS. Im Gespräch läuft es so: „das kostet 50, wir machen
//     40." Der Endpreis ist die Aussage, der Nachlass die Ableitung. `endpreis_netto = null`
//     heißt „kein Sonderpreis" und ist etwas anderes als 0 – 0 heißt „geschenkt".
//
//  2. DIE STEUER HÄNGT AM AUFTRAG, NICHT AN DER ZEILE. Ist am Auftrag „Rechnung benötigt"
//     gesetzt, kommt der Steuersatz der Position obendrauf; sonst bleibt es beim Netto.
//     Deshalb braucht diese Funktion den Schalter als zweites Argument – sie kann ihn nicht
//     aus den Zeilen ableiten, und ihn zu raten hieße, Beträge zu erfinden.
export function orderArticleTotals(
  rows: OrderArticle[],
  rechnungNoetig: boolean
): { net: number; vat: number; gross: number } {
  let net = 0, vat = 0;
  rows.forEach((r) => {
    const lineNet = r.endpreis_netto ?? r.quantity * r.net_price;
    net += lineNet;
    if (rechnungNoetig) vat += lineNet * (r.vat_rate / 100);
  });
  return { net, vat, gross: net + vat };
}

// Was die Position ohne Sonderpreis gekostet hätte. Die Vergleichsgröße, aus der sich der
// gewährte Nachlass ergibt – gebraucht in der Auswertung und im Auftragsfenster.
export function positionListenwert(r: Pick<OrderArticle, "quantity" | "net_price">): number {
  return r.quantity * r.net_price;
}

// ---------------------------------------------------------------- Hinweis aus der Vorgeschichte
//
// D2/D3 aus docs/lager-ausbaukonzept.md: Wenn ein Kunde wiederkommt, soll im Auftragsfenster
// stehen, was beim LETZTEN Mal gemessen wurde – „HL 3,1 mm" oder „Reifen von 2018". Das ist
// der Augenblick, in dem man Neureifen anbietet, und ohne den Hinweis fällt er aus.
//
// Gesucht wird der jüngste Satz zu EINEM DER Fahrzeuge dieses Auftrags; steht am Auftrag
// keines, der jüngste dieses Kunden. Der Satz des laufenden Auftrags bleibt außen vor – er ist
// die Gegenwart, nicht die Vorgeschichte.
//
// `fahrzeugIds` ist eine Liste, seit ein Auftrag mehrere Autos tragen kann (Migration 44). Der
// Parameter `ausserSatzId` ist am 21.09.2026 entfallen: Er wurde seit dem 17.09. von niemandem
// mehr mit einem Wert aufgerufen, weil die Ausnahme inzwischen über `order_id` läuft.
export function letzterSatzFuer<T extends {
  id: string; customer_id: string; vehicle_id: string | null; created_at: string;
}>(
  saetze: T[],
  kundeId: string | null | undefined,
  fahrzeugIds: readonly (string | null)[] | null | undefined
): T | null {
  if (!kundeId) return null;
  const desKunden = saetze
    .filter((s) => s.customer_id === kundeId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (desKunden.length === 0) return null;
  // Erst die passenden Fahrzeuge – ein Kunde mit zwei Autos hat zwei Vorgeschichten, und die
  // des anderen Wagens wäre hier eine Falschaussage.
  const gesucht = new Set((fahrzeugIds ?? []).filter((id): id is string => !!id));
  if (gesucht.size > 0) {
    const zumFahrzeug = desKunden.find((s) => s.vehicle_id && gesucht.has(s.vehicle_id));
    if (zumFahrzeug) return zumFahrzeug;
    // Kein Satz zu DIESEN Fahrzeugen: dann lieber nichts sagen als etwas über ein anderes Auto.
    return null;
  }
  return desKunden[0];
}

// ---------------------------------------------------------------- Rechnung
//
// Steht für diesen Auftrag noch eine Rechnung aus? Die Regel steht hier und nicht in der
// Auftragsliste, weil sie an DREI Stellen gebraucht wird – Filter, Zähler und
// Auftragsfenster – und drei Fassungen derselben Regel drei Wahrheiten wären.
//
// Warum „erledigt" dazugehört: Ein offener Auftrag ist noch nicht fertig, und was auf ihm
// steht, kann sich noch ändern. Erst beim Abschluss frieren die Positionen ein (Migration 20),
// erst dann steht fest, was abgerechnet wird. Eine Arbeitsliste, die Beträge nennt, die sich
// noch ändern, ist keine Arbeitsliste, sondern eine Vorschau.
//
// Ein stornierter Auftrag fällt heraus, weil `status` dann nicht „erledigt" ist – ohne dass
// das eigens geprüft werden müsste.
export function rechnungOffen(auftrag: {
  status: string;
  rechnung_noetig: boolean;
  rechnung_erstellt_am: string | null;
  deleted_at?: string | null;
}): boolean {
  return (
    auftrag.rechnung_noetig &&
    auftrag.rechnung_erstellt_am == null &&
    auftrag.status === "erledigt" &&
    auftrag.deleted_at == null
  );
}

// ---------------------------------------------------------------- Termin
//
// Der Zeitraum eines Termins, ohne Datum: „09:00 – 10:30 Uhr", oder nur „09:00 Uhr", wenn
// kein Ende gesetzt ist. Die EINE Stelle, an der entschieden wird, wie eine Terminzeit
// aussieht – `formatOrderDateTime` setzt nur noch das Datum davor.
export function terminZeitraum(o: { time: string | null; end_time: string | null }): string | null {
  if (!o.time) return null;
  return o.end_time ? `${o.time} – ${o.end_time} Uhr` : `${o.time} Uhr`;
}

// ---------------------------------------------------------------- Rechnungsdaten
//
// Was fehlt noch, damit aus diesem Auftrag eine Rechnung werden kann?
//
// Die Regel steht hier, weil sie an drei Stellen gebraucht wird: in der Abhakliste im
// Auftragsfenster, an der Schaltfläche „Auftrag erledigt" (bis v93 „Auftrag abschließen") und – als eigenständige
// Umsetzung – im Trigger `pruefe_rechnungsdaten()` (Migration 44). Die Datenbank ist die
// Instanz, die es durchsetzt; diese Fassung hier sagt dem Nutzer nur vorher, was ihn erwartet.
//
// Dass es zweimal dasteht, ist Absicht und keine Doppelung im schlechten Sinn: Eine Prüfung
// im Browser ist eine Bitte, eine im Trigger eine Regel. Wer nur die Bitte hat, verhindert
// den Fehler bei dem, der die Maske benutzt – und bei niemandem sonst.
// `pflicht` (seit v128, Migration 79): Hält der Mangel den Abschluss auf? Die E-Mail-Adresse nicht
// mehr – sie fehlt unterwegs oft und wird später nachgetragen; bis dahin steht in der Liste der
// offenen Rechnungen „E-Mail hinterlegen“ (`rechnungOhneEmail`).
export type RechnungsMangel = { schluessel: string; text: string; behebbarHier: boolean; pflicht: boolean };

export function rechnungsdatenMaengel(
  kunde: { name: string; address: string; email: string | null; laufkundschaft?: boolean } | null,
  fahrzeuge: { kennzeichen: string | null; kilometerstand: number | null }[]
): RechnungsMangel[] {
  const leer = (t: string | null | undefined) => (t ?? "").trim() === "";
  const maengel: RechnungsMangel[] = [];

  // Laufkundschaft (Migration 53): Der Beleg ist eine Kleinbetragsrechnung nach § 33 UStDV und
  // braucht weder Empfängerangaben noch ein Fahrzeug. Dieselbe Ausnahme steht im Trigger
  // `pruefe_rechnungsdaten()` – und muss dort auch stehen: Die Oberfläche darf die Datenbank
  // nicht widerlegen, aber sie ersetzt sie auch nicht. Wer hier eine der beiden Stellen
  // ändert, ändert beide.
  if (kunde?.laufkundschaft) return maengel;

  if (!kunde || leer(kunde.name)) {
    maengel.push({ schluessel: "name", text: "Name des Kunden", behebbarHier: false, pflicht: true });
  }
  if (!kunde || leer(kunde.address)) {
    maengel.push({ schluessel: "adresse", text: "Anschrift des Kunden", behebbarHier: false, pflicht: true });
  }
  if (!kunde || leer(kunde.email)) {
    // Die einzige Angabe, die man unterwegs nachtragen kann, ohne das Fenster zu verlassen –
    // deshalb als einzige `behebbarHier`. Name und Anschrift gehören ins Kundenfenster, wo
    // auch die Geokodierung daranhängt.
    maengel.push({ schluessel: "email", text: "E-Mail-Adresse des Kunden", behebbarHier: true, pflicht: false });
  }

  if (fahrzeuge.length === 0) {
    maengel.push({ schluessel: "fahrzeug", text: "mindestens ein Fahrzeug", behebbarHier: true, pflicht: true });
  } else {
    const ohneKennzeichen = fahrzeuge.filter((f) => leer(f.kennzeichen)).length;
    if (ohneKennzeichen > 0) {
      maengel.push({
        schluessel: "kennzeichen",
        text: `${ohneKennzeichen} Fahrzeug${ohneKennzeichen === 1 ? "" : "e"} ohne Kennzeichen`,
        behebbarHier: true,
        pflicht: true,
      });
    }
    const ohneKm = fahrzeuge.filter((f) => f.kilometerstand == null).length;
    if (ohneKm > 0) {
      maengel.push({
        schluessel: "kilometerstand",
        text: `${ohneKm} Fahrzeug${ohneKm === 1 ? "" : "e"} ohne Kilometerstand`,
        behebbarHier: true,
        pflicht: true,
      });
    }
  }

  return maengel;
}

// Fehlt für die Rechnung die E-Mail-Adresse des Kunden? Seit v128 kein Hindernis mehr beim
// Abschließen, aber ein Hinweis in der Liste „Rechnungen noch nicht ausgestellt“. Die
// Laufkundschaft hat nie eine (Kleinbetragsrechnung, Migration 53).
export function rechnungOhneEmail(kunde: { email: string | null; laufkundschaft?: boolean } | null | undefined): boolean {
  return !!kunde && !kunde.laufkundschaft && (kunde.email ?? "").trim() === "";
}

// ---------------------------------------------------------------- Ausgelagert (C5, v106)
//
// Diese Datei war auf über 1.100 Zeilen gewachsen. Die folgenden Themen stehen seit v106 in eigenen
// Dateien und werden hier nur weitergereicht – rund 90 Stellen importieren sie über
// "@/lib/helpers", und die alle anzufassen hätte eine Runde mit über hundert Dateien bedeutet.
// Neuer Code importiert direkt aus der Themendatei.
export { todayStr, datumStr, formatDate, formatEUR } from "./format";
export { satzProfilMm, profilAufteilung, profilLage, profilText, profilZahl, profilAusText, raederNachSatz } from "./profiltiefe";
export type { ProfilLage } from "./profiltiefe";
export { hausnummerAus, adresseOhneHausnummer, vorschlagOhneHausnummer, plzAus } from "./adresse";
export { DEFAULT_GEOCODE_REGION, geocodeAnfrage, ZuVieleAbfragen, geocodeAddress } from "./geocode";
export { reiheAusCode, nachReihen, dotJahr, handlungsgruende } from "./regalwand";
export { IST_KENNUNG, protokollWert, protokollFelder, protokollWer, PROTOKOLL_AKTION_LABEL } from "./protokollText";
export { suchtreffer, vergleiche, sortiere } from "./sortieren";
export type { SortRichtung } from "./sortieren";
export { lagermonate, LANGLIEGER_MONATE, LANGLIEGER_EURO, istLanglieger } from "./lagerdauer";
export { menuLage, seitenZoom } from "./menuLage";
