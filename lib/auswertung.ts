import type { Article, Employee, Order, OrderArticle, TireStorage } from "./types";
import { orderArticleTotals } from "./helpers";

// Die Rechnung hinter dem Register „Auswertungen" (Block D).
//
// Reine Funktionen, keine Datenbank, keine Oberfläche – damit sie prüfbar sind. Eine
// Auswertung, die man nicht prüfen kann, ist gefährlicher als keine: Sie sieht aus wie eine
// Antwort, und niemand rechnet nach.
//
// EINE REGEL TRÄGT DAS GANZE MODUL:
//
//     Geld wird hier NICHT gerechnet, sondern bei `orderArticleTotals()` erfragt.
//
// Der Grund steht im Fahrplan: Block C stellt den Prozentrabatt auf einen Endpreis um und
// führt den Schalter „Rechnung notwendig" ein. Wenn diese Datei die Preise selbst
// ausrechnete, müsste man nach Block C zwei Stellen ändern – und eine davon vergisst man.
// So ändert sich eine.
//
// WAS ALS UMSATZ ZÄHLT: nur ERLEDIGTE Aufträge. Ein offener Auftrag ist eine Absicht, ein
// stornierter ein Nichts. Beide als Umsatz zu zählen wäre keine Auswertung, sondern eine
// Hoffnung.

export type Zeitraum = { von: string; bis: string };

export type Kennzahlen = {
  auftraegeErledigt: number;
  auftraegeGesamt: number;
  auftraegeStorniert: number;
  umsatzNetto: number;
  umsatzBrutto: number;
  umsatzsteuer: number;
  nachlass: number;
  kundenBedient: number;
  auftraegeJeKunde: number;
  einlagerungen: number;
};

export type Monatswert = { monat: string; auftraege: number; umsatzNetto: number };
export type MitarbeiterWert = { id: string; name: string; auftraege: number; umsatzNetto: number };
export type ArtikelWert = { id: string; name: string; menge: number; umsatzNetto: number };

export type Auswertungsdaten = {
  orders: Order[];
  orderArticles: OrderArticle[];
  orderEmployees: Record<string, string[]>;
  employees: Employee[];
  articles: Article[];
  einlagerungen: TireStorage[];
};

function imZeitraum(datum: string | null | undefined, z: Zeitraum): boolean {
  if (!datum) return false;
  const tag = datum.slice(0, 10);
  return tag >= z.von && tag <= z.bis;
}

// Der Listenwert einer Position OHNE Nachlass – die Vergleichsgröße, aus der sich ergibt, wie
// viel gewährt wurde. Bewusst hier und nicht in `orderArticleTotals`: Dort steht, was zu
// zahlen ist; hier, was ohne Nachlass zu zahlen gewesen wäre.
function listenwert(zeilen: OrderArticle[]): number {
  return zeilen.reduce((summe, z) => summe + z.quantity * z.net_price, 0);
}

export function kennzahlen(daten: Auswertungsdaten, z: Zeitraum): Kennzahlen {
  const auftraege = daten.orders.filter((o) => imZeitraum(o.order_date, z));
  const erledigt = auftraege.filter((o) => o.status === "erledigt");

  let netto = 0, steuer = 0, liste = 0;
  for (const auftrag of erledigt) {
    const zeilen = daten.orderArticles.filter((a) => a.order_id === auftrag.id && !a.deleted_at);
    const summen = orderArticleTotals(zeilen);
    netto += summen.net;
    steuer += summen.vat;
    liste += listenwert(zeilen);
  }

  const kunden = new Set(erledigt.map((o) => o.customer_id));
  return {
    auftraegeErledigt: erledigt.length,
    auftraegeGesamt: auftraege.length,
    auftraegeStorniert: auftraege.filter((o) => o.status === "storniert").length,
    umsatzNetto: netto,
    umsatzBrutto: netto + steuer,
    umsatzsteuer: steuer,
    // Nie negativ: Steht am Ende mehr da als auf der Liste, ist das ein Aufschlag und kein
    // Nachlass – als „minus Rabatt" wäre es eine Falschaussage.
    nachlass: Math.max(0, liste - netto),
    kundenBedient: kunden.size,
    auftraegeJeKunde: kunden.size === 0 ? 0 : erledigt.length / kunden.size,
    einlagerungen: daten.einlagerungen.filter((e) => imZeitraum(e.created_at, z)).length,
  };
}

// Aufträge und Umsatz je Monat – daraus liest man die Saisonalität.
//
// Es werden ALLE Monate des Zeitraums ausgegeben, auch die leeren. Ein Balkendiagramm, das
// nur die Monate zeigt, in denen etwas passiert ist, behauptet einen gleichmäßigen Verlauf,
// wo in Wahrheit eine Lücke ist – und genau die Lücken sind bei einem Saisongeschäft die
// Aussage.
export function jeMonat(daten: Auswertungsdaten, z: Zeitraum): Monatswert[] {
  const reihe = new Map<string, Monatswert>();
  const start = new Date(z.von + "T00:00:00");
  const ende = new Date(z.bis + "T00:00:00");
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= ende; d.setMonth(d.getMonth() + 1)) {
    const schluessel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    reihe.set(schluessel, { monat: schluessel, auftraege: 0, umsatzNetto: 0 });
  }

  for (const auftrag of daten.orders) {
    if (!imZeitraum(auftrag.order_date, z) || auftrag.status !== "erledigt") continue;
    const schluessel = auftrag.order_date.slice(0, 7);
    const eintrag = reihe.get(schluessel);
    if (!eintrag) continue;
    eintrag.auftraege += 1;
    eintrag.umsatzNetto += orderArticleTotals(
      daten.orderArticles.filter((a) => a.order_id === auftrag.id && !a.deleted_at)
    ).net;
  }
  return [...reihe.values()];
}

// Wer hat was erledigt.
//
// Ein Auftrag mit zwei Technikern zählt bei BEIDEN voll – und die Summe der Spalte ist dann
// größer als die Gesamtzahl der Aufträge. Das ist Absicht und steht auch so in der Ansicht:
// Die Frage lautet „woran war Max beteiligt", nicht „welchen Anteil hat Max". Den Umsatz
// halb zu teilen wäre eine erfundene Zahl; ihn doppelt zu zählen, ohne es zu sagen, wäre
// schlimmer.
export function jeMitarbeiter(daten: Auswertungsdaten, z: Zeitraum): MitarbeiterWert[] {
  const werte = new Map<string, MitarbeiterWert>();
  const ohne: MitarbeiterWert = { id: "", name: "niemandem zugeteilt", auftraege: 0, umsatzNetto: 0 };

  for (const auftrag of daten.orders) {
    if (!imZeitraum(auftrag.order_date, z) || auftrag.status !== "erledigt") continue;
    const netto = orderArticleTotals(
      daten.orderArticles.filter((a) => a.order_id === auftrag.id && !a.deleted_at)
    ).net;
    const ids = daten.orderEmployees[auftrag.id] ?? [];
    if (ids.length === 0) { ohne.auftraege += 1; ohne.umsatzNetto += netto; continue; }
    for (const id of ids) {
      const vorhanden = werte.get(id) ?? {
        id,
        name: daten.employees.find((e) => e.id === id)?.name ?? "Unbekannt",
        auftraege: 0, umsatzNetto: 0,
      };
      vorhanden.auftraege += 1;
      vorhanden.umsatzNetto += netto;
      werte.set(id, vorhanden);
    }
  }

  const liste = [...werte.values()].sort((a, b) => b.umsatzNetto - a.umsatzNetto || a.name.localeCompare(b.name, "de"));
  if (ohne.auftraege > 0) liste.push(ohne);
  return liste;
}

// Was wird verbraucht – Menge und Umsatz je Artikel.
export function jeArtikel(daten: Auswertungsdaten, z: Zeitraum): ArtikelWert[] {
  const erledigteIds = new Set(
    daten.orders.filter((o) => imZeitraum(o.order_date, z) && o.status === "erledigt").map((o) => o.id)
  );
  const werte = new Map<string, ArtikelWert>();

  for (const zeile of daten.orderArticles) {
    if (zeile.deleted_at || !erledigteIds.has(zeile.order_id)) continue;
    const vorhanden = werte.get(zeile.article_id) ?? {
      id: zeile.article_id,
      name: daten.articles.find((a) => a.id === zeile.article_id)?.short_name ?? "Unbekannter Artikel",
      menge: 0, umsatzNetto: 0,
    };
    vorhanden.menge += zeile.quantity;
    // Auch hier über orderArticleTotals, obwohl es nur eine Zeile ist: Der Nachlass steckt in
    // derselben Rechnung, und nach Block C steckt dort noch mehr.
    vorhanden.umsatzNetto += orderArticleTotals([zeile]).net;
    werte.set(zeile.article_id, vorhanden);
  }
  return [...werte.values()].sort((a, b) => b.umsatzNetto - a.umsatzNetto || a.name.localeCompare(b.name, "de"));
}

// Vorgefertigte Zeiträume. Sie stehen hier und nicht in der Ansicht, weil „dieses Jahr"
// eine Rechnung ist und keine Beschriftung.
export function zeitraumVorgabe(art: "jahr" | "letzte12" | "quartal", heute = new Date()): Zeitraum {
  const j = heute.getFullYear();
  const t = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (art === "jahr") return { von: `${j}-01-01`, bis: t(heute) };
  if (art === "quartal") {
    const q = Math.floor(heute.getMonth() / 3);
    return { von: `${j}-${String(q * 3 + 1).padStart(2, "0")}-01`, bis: t(heute) };
  }
  const start = new Date(heute); start.setFullYear(start.getFullYear() - 1); start.setDate(start.getDate() + 1);
  return { von: t(start), bis: t(heute) };
}
