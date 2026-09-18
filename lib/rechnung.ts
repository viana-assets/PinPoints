import type {
  Article, Betrieb, Customer, Order, OrderArticle,
  Rechnung, RechnungAbsender, RechnungEmpfaenger, RechnungPosition, RechnungTexte,
} from "@/lib/types";

// Alles, was eine Rechnung ausmacht, OHNE Datenbank und ohne React – damit es prüfbar ist.
// Die Zahlen auf einem Beleg sind die einzige Stelle in dieser Anwendung, an der ein Fehler
// nicht beim nächsten Speichern verschwindet.

// Auf wie viele Nachkommastellen ein Geldbetrag festgelegt wird, bevor mit ihm weitergerechnet
// wird. Steht als Konstante hier und nicht als literale 100 in vier Rechnungen (siehe
// docs/konstanten-register.md).
export const CENT = 100;

// Kaufmännisch auf den Cent. `Math.round` allein reicht nicht: 1.005 liegt in Fließkomma
// minimal unter der Mitte und würde abgerundet.
export function aufCent(betrag: number): number {
  return Math.round((betrag + Number.EPSILON) * CENT) / CENT;
}

// ---------------------------------------------------------------- Die Positionen
//
// DER HEIKLE PUNKT: der Sonderpreis.
//
// `order_articles.endpreis_netto` ist der Preis für die GANZE Position, nicht je Stück. Auf
// der Rechnung stehen aber Menge, Einzelpreis und Gesamt nebeneinander, und ein Kunde
// multipliziert das nach. Eine Zeile, die nicht aufgeht, kostet einen Anruf – oder Vertrauen.
//
// Drei Fälle, jeder für sich richtig:
//
//   1. Kein Sonderpreis  → Einzelpreis = Listenpreis, Gesamt = Menge × Einzelpreis.
//   2. Sonderpreis, der sich glatt auf die Menge verteilt (der Normalfall, vor allem bei
//      Menge 1) → Einzelpreis = Sonderpreis / Menge. Die Zeile geht auf, der Nachlass fällt
//      nicht weiter auf.
//   3. Sonderpreis, der sich NICHT glatt verteilt → die Position steht zum Listenpreis da,
//      und der Nachlass bekommt eine eigene Zeile mit negativem Betrag. Das ist die einzige
//      Fassung, die immer stimmt, und zugleich die ehrlichste: Der Kunde sieht, was die
//      Leistung kostet und was er nachgelassen bekommen hat.
export const NACHLASS_BEZEICHNUNG = "Nachlass";

export function positionenAusAuftrag(
  zeilen: OrderArticle[],
  artikel: Article[]
): RechnungPosition[] {
  const raus: RechnungPosition[] = [];

  zeilen.forEach((z) => {
    const a = artikel.find((x) => x.id === z.article_id) ?? null;
    const bezeichnung = a?.long_name?.trim() || a?.short_name?.trim() || "Leistung";
    const basis = {
      artikelnummer: a?.article_number ?? null,
      bezeichnung,
      zusatz: z.note?.trim() || null,
      menge: z.quantity,
      einheit: a?.einheit?.trim() || "Stück",
      steuersatz: z.vat_rate,
    };

    if (z.endpreis_netto == null) {
      raus.push({ ...basis, einzelpreis: aufCent(z.net_price), netto: aufCent(z.quantity * z.net_price) });
      return;
    }

    const jeStueck = aufCent(z.endpreis_netto / z.quantity);
    if (z.quantity > 0 && aufCent(jeStueck * z.quantity) === aufCent(z.endpreis_netto)) {
      raus.push({ ...basis, einzelpreis: jeStueck, netto: aufCent(z.endpreis_netto) });
      return;
    }

    raus.push({ ...basis, einzelpreis: aufCent(z.net_price), netto: aufCent(z.quantity * z.net_price) });
    raus.push({
      artikelnummer: null,
      bezeichnung: NACHLASS_BEZEICHNUNG,
      zusatz: bezeichnung,
      menge: 1,
      einheit: "",
      steuersatz: z.vat_rate,
      einzelpreis: aufCent(z.endpreis_netto - z.quantity * z.net_price),
      netto: aufCent(z.endpreis_netto - z.quantity * z.net_price),
    });
  });

  return raus;
}

// ---------------------------------------------------------------- Die Summen
//
// Je Steuersatz getrennt, weil genau so der Ausweis auf der Rechnung verlangt ist: „19 % aus
// 260,00 € = 49,40 €". Ein einziger Steuerbetrag über alles wäre nicht nachvollziehbar,
// sobald zwei Sätze vorkommen.
//
// `mitSteuer` ist der Schalter „Rechnung benötigt" vom Auftrag. Ohne ihn bleibt es beim Netto –
// dieselbe Regel wie in `orderArticleTotals()`, nur für den Beleg.
export type SteuerZeile = { satz: number; netto: number; steuer: number };

export function rechnungSummen(
  positionen: RechnungPosition[],
  mitSteuer: boolean
): { netto: number; steuer: number; brutto: number; saetze: SteuerZeile[] } {
  const nachSatz = new Map<number, number>();
  let netto = 0;
  positionen.forEach((p) => {
    netto = aufCent(netto + p.netto);
    nachSatz.set(p.steuersatz, aufCent((nachSatz.get(p.steuersatz) ?? 0) + p.netto));
  });

  const saetze: SteuerZeile[] = [...nachSatz.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([satz, summe]) => ({ satz, netto: summe, steuer: mitSteuer ? aufCent(summe * (satz / 100)) : 0 }));

  const steuer = saetze.reduce((s, z) => aufCent(s + z.steuer), 0);
  return { netto, steuer, brutto: aufCent(netto + steuer), saetze };
}

// ---------------------------------------------------------------- Der Anschriftenblock
//
// Die Anschrift ist beim Kunden EIN Textfeld. Für das Fenster im Briefumschlag braucht es
// Zeilen. Zeilenumbrüche gewinnen, weil jemand, der sie gesetzt hat, damit etwas gemeint hat;
// gibt es keine, wird am Komma getrennt.
export function anschriftZeilen(e: RechnungEmpfaenger): string[] {
  const kopf: string[] = [];
  if (e.company?.trim()) kopf.push(e.company.trim());
  const person = [e.anrede?.trim(), e.name?.trim()].filter(Boolean).join(" ");
  if (person) kopf.push(person);

  const roh = (e.address || "").trim();
  const teile = roh.includes("\n")
    ? roh.split("\n")
    : roh.split(",");
  return [...kopf, ...teile.map((t) => t.trim()).filter(Boolean)];
}

// ---------------------------------------------------------------- Der Girocode
//
// EPC-QR nach Fassung 002 der European Payments Council: elf Zeilen, durch Zeilenvorschub
// getrennt, nachlaufende Leerzeilen dürfen fehlen. Version 002 ist die, bei der die BIC
// entfallen darf – innerhalb des SEPA-Raums reicht die IBAN.
//
// Der Betrag MUSS im Punktformat stehen („EUR123.45"), auch auf einer deutschen Rechnung:
// Das liest kein Mensch, sondern eine Banking-App.
export const GIROCODE_KENNUNG = "BCD";
export const GIROCODE_FASSUNG = "002";
// Der Verwendungszweck darf 140 Zeichen tragen; der Name des Empfängers 70.
export const GIROCODE_NAME_MAX = 70;
export const GIROCODE_ZWECK_MAX = 140;

export function girocodeText(r: Pick<Rechnung, "absender" | "brutto" | "nummer_text">): string | null {
  const iban = (r.absender.iban || "").replace(/\s+/g, "").toUpperCase();
  const name = (r.absender.kontoinhaber || r.absender.firma || "").trim().slice(0, GIROCODE_NAME_MAX);
  // Ohne IBAN, ohne Namen oder ohne positiven Betrag gibt es nichts zu überweisen. Eine
  // Stornorechnung hat einen negativen Betrag – ein QR-Code darauf wäre eine Aufforderung,
  // Geld zu schicken, das man zurückbekommt.
  if (!iban || !name || r.brutto <= 0) return null;

  return [
    GIROCODE_KENNUNG,
    GIROCODE_FASSUNG,
    "1",                                   // Zeichensatz 1 = UTF-8
    "SCT",                                 // SEPA Credit Transfer
    (r.absender.bic || "").replace(/\s+/g, "").toUpperCase(),
    name,
    iban,
    `EUR${r.brutto.toFixed(2)}`,
    "",                                    // Zweckcode – keiner
    "",                                    // Referenz – keine strukturierte
    `Rechnung ${r.nummer_text}`.slice(0, GIROCODE_ZWECK_MAX),
  ].join("\n");
}

// ---------------------------------------------------------------- Der Entwurf
//
// Was im Rechnungsfenster zu sehen ist, BEVOR eine Nummer vergeben wurde. Derselbe Inhalt,
// der beim Ausstellen in die Datenbank geht – deshalb entsteht er genau einmal, hier.
//
// `nummer_text` ist leer und `datum` das heutige: Beides setzt beim Ausstellen die Datenbank.
// Ein Entwurf, der schon eine Nummer trägt, wäre eine Behauptung.
export type RechnungEntwurf = Omit<Rechnung, "id" | "nummer" | "nummer_text" | "created_at" | "created_by"
  | "storniert_durch" | "storniert_am" | "hebt_auf">;

export function absenderAus(b: Betrieb): RechnungAbsender {
  return {
    firma: b.firma, inhaber: b.inhaber, strasse: b.strasse, plz: b.plz, ort: b.ort,
    telefon: b.telefon, email: b.email, webseite: b.webseite,
    ust_id: b.ust_id, steuernummer: b.steuernummer,
    kontoinhaber: b.kontoinhaber, bank: b.bank, iban: b.iban, bic: b.bic,
    logo: b.logo,
  };
}

export function empfaengerAus(k: Customer): RechnungEmpfaenger {
  return {
    name: k.name ?? "",
    company: k.company,
    anrede: k.anrede,
    address: k.address ?? "",
    email: k.email,
    kundennummer: k.kundennummer,
  };
}

export function entwurfBauen(opts: {
  auftrag: Order;
  kunde: Customer;
  betrieb: Betrieb;
  zeilen: OrderArticle[];
  artikel: Article[];
  kennzeichen: string[];
  heute: string;
}): RechnungEntwurf {
  const positionen = positionenAusAuftrag(opts.zeilen, opts.artikel);
  const summen = rechnungSummen(positionen, opts.auftrag.rechnung_noetig);
  const empfaenger = empfaengerAus(opts.kunde);
  const texte: RechnungTexte = {
    mit_steuer: opts.auftrag.rechnung_noetig,
    anschreiben: opts.betrieb.anschreiben,
    fuss_zahlung: opts.betrieb.fuss_zahlung,
    fuss_hinweis: opts.betrieb.fuss_hinweis,
    fuss_dank: opts.betrieb.fuss_dank,
    auftragsnummer: opts.auftrag.order_number,
    kennzeichen: opts.kennzeichen,
  };
  return {
    art: "rechnung",
    order_id: opts.auftrag.id,
    customer_id: opts.kunde.id,
    kundennummer: empfaenger.kundennummer,
    datum: opts.heute,
    // Das Lieferdatum ist der Tag, an dem die Leistung erbracht wurde – für den Steuerausweis
    // die maßgebliche Angabe, und bei einem Auftrag von vorletzter Woche eine andere als das
    // Rechnungsdatum.
    lieferdatum: opts.auftrag.order_date,
    empfaenger,
    absender: absenderAus(opts.betrieb),
    positionen,
    texte,
    netto: summen.netto,
    steuer: summen.steuer,
    brutto: summen.brutto,
  };
}

// Die Stornorechnung: derselbe Inhalt mit umgekehrtem Vorzeichen. Kein neuer Beleg mit
// eigenem Inhalt, sondern die Aufhebung eines bestimmten – deshalb wird kopiert und nicht
// neu gerechnet. Was auf der Originalrechnung stand, steht auch auf ihrer Aufhebung.
export function stornoAus(r: Rechnung, heute: string): RechnungEntwurf & { hebt_auf: string } {
  return {
    art: "storno",
    hebt_auf: r.id,
    order_id: r.order_id,
    customer_id: r.customer_id,
    kundennummer: r.kundennummer,
    datum: heute,
    lieferdatum: r.lieferdatum,
    empfaenger: r.empfaenger,
    absender: r.absender,
    positionen: r.positionen.map((p) => ({ ...p, einzelpreis: -p.einzelpreis, netto: -p.netto })),
    texte: r.texte,
    netto: -r.netto,
    steuer: -r.steuer,
    brutto: -r.brutto,
  };
}

// ---------------------------------------------------------------- Der Firmenname in der Fußzeile
//
// Oben im Briefkopf steht der vollständige Name: „Mobiler Reifenservice Paul Geiger". In der
// Fußzeile steht direkt darunter „Inhaber: Paul Geiger" – derselbe Name zweimal untereinander.
// Dort wird er deshalb aus dem Firmennamen herausgenommen:
//
//     Mobiler Reifenservice
//     Inhaber: Paul Geiger
//
// Betroffen ist NUR die Fußzeile. Briefkopf und Absenderzeile über dem Anschriftenfeld führen
// weiter den vollständigen Namen – dort ist er die Angabe, hier wäre er die Wiederholung.
//
// Bleibt nach dem Herausnehmen nichts übrig (der Betrieb heißt genau wie sein Inhaber), bleibt
// der Name stehen; eine leere Zeile wäre schlimmer als eine doppelte.
//
// Das ist bewusst eine Regel und kein zweites Eingabefeld: Ein „Kurzname" in den
// Betriebsdaten wäre eine weitere Stelle, die jemand pflegen muss und die beim nächsten
// Umbenennen vergessen wird. Wer wirklich einen anderen Namen unten haben will als oben,
// braucht dieses Feld – dann aber als bewusste Entscheidung mit eigener Migration.
export function firmaOhneInhaber(firma: string, inhaber: string): string {
  const f = (firma || "").trim();
  const i = (inhaber || "").trim();
  if (!f || !i) return f;

  const stelle = f.toLowerCase().indexOf(i.toLowerCase());
  if (stelle < 0) return f;

  // Trennzeichen am Rand mit wegnehmen: aus „Reifenservice - Paul Geiger" soll nicht
  // „Reifenservice -" werden.
  const rest = (f.slice(0, stelle) + " " + f.slice(stelle + i.length))
    .replace(/\s+/g, " ")
    .replace(/^[\s,\-–·]+|[\s,\-–·]+$/g, "")
    .trim();

  return rest || f;
}

// Die Nummer, die eine jetzt ausgestellte Rechnung voraussichtlich bekäme.
//
// VORAUSSICHTLICH und nicht reserviert: Ein Entwurf, der eine Nummer zieht, verbraucht sie
// auch dann, wenn ihn niemand ausstellt – und eine Lücke im Nummernkreis erklärt man bei der
// nächsten Prüfung. Zwischen dem Blick auf den Entwurf und dem Ausstellen kann jemand anders
// ausgestellt haben; dann wird es die nächste. Deshalb steht auf dem Entwurf „voraussichtlich"
// und nicht die Nummer allein.
export function voraussichtlicheNummer(b: Pick<Betrieb, "rechnung_praefix" | "rechnung_naechste_nummer">): string {
  return `${b.rechnung_praefix || "RE"}${b.rechnung_naechste_nummer}`;
}

// Ist diese Rechnung noch gültig? Eine stornierte zählt nicht mehr – weder in der Liste noch
// bei der Frage, ob ein Auftrag abgerechnet ist.
export function istGueltig(r: Rechnung): boolean {
  return r.art === "rechnung" && !r.storniert_durch;
}
