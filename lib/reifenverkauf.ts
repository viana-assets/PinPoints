import type { Article, EingelagertesRad, Order, OrderArticle, ReifenZustand, Saison, TireStorage, Verkaufsreifen } from "./types";
import {
  DOT_ALT_JAHRE, NEUREIFEN_ALT_JAHRE, PROFIL_GESETZLICH_MM, PROFIL_HINWEIS_MM, PROFIL_KRITISCH_MM,
  REIFEN_ZUSTAND_LABEL, REIFENVERKAUF_ART, SAISON_LABEL,
} from "./constants";
import { dotJahr, orderArticleTotals } from "./helpers";

// Die Regeln hinter dem Reifenverkauf (Migration 61, docs/lager.md „Reifenverkauf").
//
// Die Oberfläche (components/lager/VerkaufPanel.tsx, components/auftraege/ReifenSuche.tsx)
// zeichnet nur. Wie eine Größe gelesen wird, was die Suche findet, welcher Text auf die
// Rechnung kommt und wann ein Reifen nicht mehr angeboten wird, steht hier – als reine
// Funktionen, geprüft in tests/reifenverkauf.test.ts.
//
// Was die Oberfläche hier ausrechnet (frei, Warnungen), entscheidet sie nicht: Ob ein Reifen
// noch frei ist, entscheidet die Datenbank beim Eintragen (`verkaufsreifen_zaehlen`).

export type Reifengroesse = { breite: number; querschnitt: number | null; zoll: number };

type MitGroesse = Pick<Verkaufsreifen, "breite" | "querschnitt" | "zoll">;
type MitName = Pick<Verkaufsreifen, "hersteller" | "modell">;

// ---------------------------------------------------------------- Größe

// Liest eine Größe so, wie sie Menschen schreiben: „235/55 R17 103V", „235/55R17", „235 55 17",
// „2355517", „235/55 ZR 17", „195 R14 C", „215/65 R17.5". Was danach kommt (Index, „XL"), wird
// überlesen. Keine Größe erkennbar → null, statt etwas zu raten.
export function groesseAusText(text: string | null | undefined): Reifengroesse | null {
  const t = (text ?? "").toUpperCase().replace(",", ".").trim();
  if (!t) return null;
  // Mit Querschnitt: 235/55 R17 · 235 55 17 · 235/55-17
  let m = t.match(/(\d{3})\s*[/\s-]\s*(\d{2})\s*(?:Z?R|-|\s)?\s*(\d{2}(?:\.\d)?)(?!\d)/);
  if (m) return fertig(+m[1], +m[2], +m[3]);
  // Ohne Trenner: 2355517
  m = t.match(/(?<!\d)(\d{3})(\d{2})(\d{2})(?!\d)/);
  if (m) return fertig(+m[1], +m[2], +m[3]);
  // Ohne Querschnitt: 195 R14 C
  m = t.match(/(?<!\d)(\d{3})\s*Z?R\s*(\d{2}(?:\.\d)?)(?!\d)/);
  if (m) return fertig(+m[1], null, +m[2]);
  return null;
}

// Die Grenzen dieselben wie in der Datenbank (`verkaufsreifen_groesse_moeglich`). Wer eine Stelle
// ändert, ändert beide.
function fertig(breite: number, querschnitt: number | null, zoll: number): Reifengroesse | null {
  if (breite < 100 || breite > 400) return null;
  if (querschnitt != null && (querschnitt < 20 || querschnitt > 95)) return null;
  if (zoll < 10 || zoll > 24) return null;
  return { breite, querschnitt, zoll };
}

export function zollText(zoll: number): string {
  return Number.isInteger(zoll) ? String(zoll) : String(zoll).replace(".", ",");
}

// „235/55 R17" – so steht es auf der Rechnung, auf der Karte und im Suchfeld.
export function groesseText(g: MitGroesse): string {
  return `${g.breite}${g.querschnitt != null ? `/${g.querschnitt}` : ""} R${zollText(g.zoll)}`;
}

// Die Ziffernfolge einer Größe, gegen die die Suche vergleicht: 235/55 R17 → „2355517".
function groessenZiffern(g: MitGroesse): string {
  return `${g.breite}${g.querschnitt ?? ""}${String(g.zoll).replace(".", "")}`;
}

// Passen die gemessenen Räder zur Reifengröße des Fahrzeugs? (E8, v102)
//
// Am Fahrzeug steht eine Größe, an jedem einzeln erfassten Rad ebenfalls – verglichen wurde nie.
// Ein Satz, der zum falschen Auto gebucht ist, fällt sonst erst beim Montieren auf. Verglichen
// werden Breite, Querschnitt und Zoll (Index und „XL" zählen nicht). Kein Befund, wenn eine der
// beiden Größen fehlt oder nicht lesbar ist – dann gibt es nichts zu vergleichen, und eine
// Warnung „unbekannt" wäre Lärm. Mischbereifung (vorne/hinten verschieden) meldet das auch;
// der Text sagt deshalb „prüfen", nicht „falsch".
export function groessenAbweichung(
  fahrzeugGroesse: string | null | undefined,
  raeder: { position: string | null; reifengroesse: string | null }[]
): string | null {
  const soll = groesseAusText(fahrzeugGroesse);
  if (!soll) return null;
  const gleich = (g: Reifengroesse) => g.breite === soll.breite && g.zoll === soll.zoll
    && (g.querschnitt == null || soll.querschnitt == null || g.querschnitt === soll.querschnitt);
  const abweichend = raeder
    .map((r) => ({ pos: r.position, g: groesseAusText(r.reifengroesse) }))
    .filter((x): x is { pos: string | null; g: Reifengroesse } => !!x.g && !gleich(x.g));
  if (abweichend.length === 0) return null;
  const liste = abweichend.map((x) => `${x.pos ? x.pos + " " : ""}${groesseText(x.g)}`).join(", ");
  return `Reifengröße prüfen: ${liste} – am Fahrzeug steht ${groesseText(soll)}`;
}

// Die Reifengröße eines Fahrzeugs als Vorschlag für die Suche – die erste, die sich lesen lässt.
export function groessenVorschlag(reifengroessen: (string | null | undefined)[]): string {
  for (const r of reifengroessen) {
    const g = groesseAusText(r);
    if (g) return groesseText(g);
  }
  return "";
}

// ---------------------------------------------------------------- Texte

export function reifenName(p: MitName): string {
  return [p.hersteller.trim(), p.modell?.trim()].filter(Boolean).join(" ");
}

// Die Merkmale hinter der Größe: „103V XL Runflat".
function merkmale(p: Pick<Verkaufsreifen, "kennung" | "xl" | "runflat">): string {
  return [p.kennung?.trim(), p.xl ? "XL" : null, p.runflat ? "Runflat" : null].filter(Boolean).join(" ");
}

export function profilMmText(mm: number): string {
  return `${String(mm).replace(".", ",")} mm`;
}

// Der Text der Position auf Auftrag und Rechnung. Er wird beim Eintragen als Text der Position
// gespeichert – ein Schnappschuss wie der Preis: Wird der Posten später geändert, bleibt die
// Rechnung, wie sie war.
//
//   „Michelin Pilot Sport 4 · 235/55 R17 103V XL · Sommer · DOT 1224"
//   „Conti WinterContact · 205/55 R16 91H · Winter · DOT 3821 · 5,5 mm · Komplettrad Alu"
export function positionsText(p: Omit<Verkaufsreifen, "id" | "created_at" | "updated_at" | "bestand" | "reserviert" | "verkauft">): string {
  const groesse = [groesseText(p), merkmale(p)].filter(Boolean).join(" ");
  const teile = [
    reifenName(p),
    groesse,
    SAISON_LABEL[p.saison],
    p.dot?.trim() ? `DOT ${p.dot.trim()}` : null,
    p.zustand === "gebraucht" && p.profiltiefe_mm != null ? profilMmText(p.profiltiefe_mm) : null,
    p.felge ? `Komplettrad ${p.felge === "alu" ? "Alu" : "Stahl"}` : null,
  ];
  return teile.filter(Boolean).join(" · ");
}

export function reifenUnterzeile(p: Verkaufsreifen): string {
  return [
    REIFEN_ZUSTAND_LABEL[p.zustand], SAISON_LABEL[p.saison], merkmale(p) || null,
    p.dot?.trim() ? `DOT ${p.dot.trim()}` : null,
    p.profiltiefe_mm != null ? profilMmText(p.profiltiefe_mm) : null,
    p.felge ? `Komplettrad ${p.felge === "alu" ? "Alu" : "Stahl"}` : null,
  ].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------- Zahlen

export function reifenFrei(p: Pick<Verkaufsreifen, "bestand" | "reserviert">): number {
  return Math.max(0, p.bestand - p.reserviert);
}

export type Lagerwert = { stueck: number; vk: number; ek: number; stueckMitEk: number };

// Was im Regal liegt, bewertet – reservierte eingeschlossen, sie sind noch nicht verkauft.
// Der Einkaufswert zählt nur Posten, bei denen ein Einkaufspreis gepflegt ist; wie viele Stück
// das sind, steht dabei, damit eine halbe Zahl nicht als ganze gelesen wird.
export function lagerwert(posten: Pick<Verkaufsreifen, "bestand" | "preis_netto" | "ek_netto">[]): Lagerwert {
  let stueck = 0, vk = 0, ek = 0, stueckMitEk = 0;
  for (const p of posten) {
    if (p.bestand <= 0) continue;
    stueck += p.bestand;
    vk += p.bestand * p.preis_netto;
    if (p.ek_netto != null) { ek += p.bestand * p.ek_netto; stueckMitEk += p.bestand; }
  }
  return { stueck, vk: runden(vk), ek: runden(ek), stueckMitEk };
}

function runden(x: number): number {
  return Math.round(x * 100) / 100;
}

// ---------------------------------------------------------------- Hinweise

export type ReifenHinweis = { text: string; sperrt: boolean };

// Was man vor dem Verkauf wissen sollte. `sperrt` heißt: nicht anbieten – ein Reifen unter dem
// gesetzlichen Mindestprofil darf nicht mehr ans Auto. Alles andere ist ein Hinweis fürs
// Gespräch, kein Verbot.
export function reifenHinweise(
  p: Pick<Verkaufsreifen, "zustand" | "dot" | "profiltiefe_mm" | "saison">,
  heute: Date = new Date()
): ReifenHinweis[] {
  const raus: ReifenHinweis[] = [];
  const jahr = dotJahr(p.dot);
  if (jahr != null) {
    const alter = heute.getFullYear() - jahr;
    const grenze = p.zustand === "neu" ? NEUREIFEN_ALT_JAHRE : DOT_ALT_JAHRE;
    if (alter >= grenze) {
      raus.push({ text: `Reifen von ${jahr} – ${alter} Jahre alt`, sperrt: false });
    }
  }
  if (p.zustand === "gebraucht" && p.profiltiefe_mm != null) {
    const mm = p.profiltiefe_mm;
    // Winterreifen brauchen mehr: Unter 4 mm lässt die Wintertauglichkeit spürbar nach.
    const knapp = p.saison === "sommer" ? PROFIL_KRITISCH_MM : PROFIL_HINWEIS_MM;
    if (mm < PROFIL_GESETZLICH_MM) {
      raus.push({ text: `Profil ${profilMmText(mm)} – unter dem gesetzlichen Mindestprofil, nicht verkaufen`, sperrt: true });
    } else if (mm < knapp) {
      raus.push({ text: `Profil ${profilMmText(mm)} – knapp`, sperrt: false });
    }
  }
  return raus;
}

// DOT als Woche und Jahr, vier Ziffern: „1224" = Kalenderwoche 12 des Jahres 2024. Leer ist
// erlaubt – bei manchem Posten weiß man es nicht.
export function dotFehler(dot: string): string | null {
  const t = dot.replace(/\D/g, "");
  if (!dot.trim()) return null;
  if (t.length !== 4) return "Vier Ziffern: Woche und Jahr, z. B. 1224.";
  const woche = parseInt(t.slice(0, 2), 10);
  if (woche < 1 || woche > 53) return "Die Woche liegt zwischen 01 und 53.";
  return null;
}

// ---------------------------------------------------------------- Suche

// Die Suche im Auftrag. Sie soll beim Tippen finden, was man meint:
//   „235"          → alles in Breite 235
//   „235 55"       → 235/55, jeder Zoll
//   „235/55 R17", „235 55 17", „2355517", „235/55R17" → genau diese Größe
//   „R17"          → alles in 17 Zoll
//   „michelin", „pilot", „103v" → Hersteller, Modell, Index, Notiz
// Mehrere Begriffe müssen alle passen.
export function passtZurSuche(p: Verkaufsreifen, suche: string): boolean {
  const begriffe = suche.toLowerCase().replace(",", ".").split(/\s+/).filter(Boolean);
  let ziffern = "";
  let zoll: string | null = null;
  const texte: string[] = [];
  for (const b of begriffe) {
    const r = b.match(/^z?r(\d{2}(?:\.\d)?)$/);
    if (r) { zoll = r[1].replace(".", ""); continue; }
    if (/^[\d/]+(?:z?r[\d.]+)?$/.test(b)) { ziffern += b.replace(/\D/g, ""); continue; }
    texte.push(b);
  }
  if (ziffern && !groessenZiffern(p).startsWith(ziffern)) return false;
  if (zoll && String(p.zoll).replace(".", "") !== zoll) return false;
  if (texte.length === 0) return true;
  const heu = [
    p.hersteller, p.modell, p.kennung, p.notiz, p.eprel,
    REIFEN_ZUSTAND_LABEL[p.zustand], SAISON_LABEL[p.saison],
    p.xl ? "xl" : null, p.runflat ? "runflat" : null,
    p.felge ? `komplettrad ${p.felge}` : null,
  ].filter(Boolean).join(" ").toLowerCase();
  return texte.every((t) => heu.includes(t));
}

// Reihenfolge der Treffer: erst was frei ist, dann die genau passende Größe vor den übrigen,
// dann nach Größe und Name – damit dieselbe Größe beieinandersteht.
export function sortiereReifen(posten: Verkaufsreifen[], wunsch: Reifengroesse | null = null): Verkaufsreifen[] {
  const passt = (p: Verkaufsreifen) =>
    !!wunsch && p.breite === wunsch.breite && p.zoll === wunsch.zoll && (wunsch.querschnitt == null || p.querschnitt === wunsch.querschnitt);
  return posten.slice().sort((a, b) =>
    Number(reifenFrei(b) > 0) - Number(reifenFrei(a) > 0)
    || Number(passt(b)) - Number(passt(a))
    || a.zoll - b.zoll || a.breite - b.breite || (a.querschnitt ?? 0) - (b.querschnitt ?? 0)
    || reifenName(a).localeCompare(reifenName(b), "de")
  );
}

// ---------------------------------------------------------------- Artikel

// Welcher Artikel gehört zu diesem Zustand? Der aktive mit der passenden Abrechnungsart; gibt es
// mehrere, der mit der kleinsten Nummer. Keiner → null, dann sagt die Oberfläche, was fehlt.
export function artikelFuer(artikel: Article[], zustand: ReifenZustand): Article | null {
  return artikel
    .filter((a) => a.active && a.abrechnungsart === REIFENVERKAUF_ART[zustand])
    .sort((a, b) => a.article_number - b.article_number)[0] ?? null;
}

export function reifenZustandVonArtikel(a: Pick<Article, "abrechnungsart"> | null | undefined): ReifenZustand | null {
  if (a?.abrechnungsart === "reifenverkauf_neu") return "neu";
  if (a?.abrechnungsart === "reifenverkauf_gebraucht") return "gebraucht";
  return null;
}

// Wie viele Stück die Suche vorschlägt: vier, wenn so viele frei sind – ein Satz ist der
// Normalfall –, sonst alle freien.
export function vorschlagMenge(frei: number): number {
  return Math.max(1, Math.min(4, frei));
}

// ---------------------------------------------------------------- Aus der Einlagerung (E17, v103)
//
// Ein Kunde lässt seine alten Reifen da oder verkauft sie an uns. Aus dem eingelagerten Satz
// werden Verkaufsposten; Größe, DOT, Profil und Felge kommen aus den Raddaten mit, Hersteller und
// Preis tippt man dazu. In der Datenbank lagert `satz_zum_verkauf()` (Migration 64) den Satz aus
// und legt die Posten auf denselben Platz – in einem Zug.
//
// Ein Posten hat EINE Größe und EIN DOT. Vier gleiche Räder sind ein Posten mit Bestand 4; zwei
// verschiedene DOT (vorne neuer als hinten) sind zwei Posten. Gruppiert wird nach Größe, DOT und
// Felge; das Profil ist das schwächste der Gruppe – das schwächste Rad bestimmt den Preis.

export type PostenEntwurf = {
  groesse: string;          // als Text, wie im Erfassen-Blatt – gelesen mit `groesseAusText`
  hersteller: string;
  modell: string;
  saison: Saison | null;
  dot: string;
  profiltiefe_mm: number | null;
  felge: "stahl" | "alu" | null;
  bestand: number;
  preis: string;            // Verkaufspreis je Stück netto, als Eingabe
  ek: string;               // Ankaufspreis je Stück netto, freiwillig
};

function felgeVonRad(f: EingelagertesRad["felge"]): "stahl" | "alu" | null {
  return f === "stahl" || f === "alu" ? f : null;
}

export function postenAusSatz(
  satz: Pick<TireStorage, "erfassungsart" | "anzahl_raeder" | "dot_date" | "profiltiefe_mm" | "saison">,
  raeder: Pick<EingelagertesRad, "reifengroesse" | "dot_date" | "profiltiefe_mm" | "felge">[],
  fahrzeugGroesse: string | null | undefined
): PostenEntwurf[] {
  const vorgabeGroesse = groessenVorschlag([fahrzeugGroesse, ...raeder.map((r) => r.reifengroesse)]);
  const leer = (g: string, dot: string, profil: number | null, felge: PostenEntwurf["felge"], bestand: number): PostenEntwurf => ({
    groesse: g, hersteller: "", modell: "", saison: satz.saison, dot, profiltiefe_mm: profil, felge, bestand, preis: "", ek: "",
  });
  if (satz.erfassungsart !== "einzeln" || raeder.length === 0) {
    const felge = raeder.length > 0 ? felgeVonRad(raeder[0].felge) : null;
    return [leer(vorgabeGroesse, (satz.dot_date ?? "").trim(), satz.profiltiefe_mm, felge, Math.max(1, satz.anzahl_raeder || 4))];
  }
  const gruppen = new Map<string, PostenEntwurf>();
  for (const r of raeder) {
    const g = groesseAusText(r.reifengroesse);
    const groesse = g ? groesseText(g) : vorgabeGroesse;
    const dot = (r.dot_date ?? "").trim();
    const felge = felgeVonRad(r.felge);
    const schluessel = `${groesse}|${dot}|${felge ?? ""}`;
    const da = gruppen.get(schluessel);
    if (!da) { gruppen.set(schluessel, leer(groesse, dot, r.profiltiefe_mm, felge, 1)); continue; }
    da.bestand += 1;
    if (r.profiltiefe_mm != null) da.profiltiefe_mm = da.profiltiefe_mm == null ? r.profiltiefe_mm : Math.min(da.profiltiefe_mm, r.profiltiefe_mm);
  }
  return [...gruppen.values()];
}

function betrag(text: string): number | null {
  const t = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}

// Was an einem Entwurf noch fehlt – null heißt: kann gespeichert werden. Dieselben Grenzen wie im
// Erfassen-Blatt (und in der Datenbank, `verkaufsreifen_groesse_moeglich`).
export function entwurfFehler(e: PostenEntwurf): string | null {
  if (!groesseAusText(e.groesse)) return "Größe nicht lesbar, z. B. 205/55 R16.";
  if (!e.hersteller.trim()) return "Hersteller fehlt.";
  if (!e.saison) return "Saison fehlt.";
  if (!Number.isInteger(e.bestand) || e.bestand < 1 || e.bestand > 999) return "Stückzahl 1 bis 999.";
  const vk = betrag(e.preis);
  if (vk === null || Number.isNaN(vk)) return "Verkaufspreis je Stück fehlt.";
  if (Number.isNaN(betrag(e.ek))) return "Ankaufspreis: eine Zahl oder leer.";
  const dot = dotFehler(e.dot);
  if (dot) return `DOT: ${dot}`;
  return null;
}

// Der Entwurf so, wie `satz_zum_verkauf()` ihn erwartet. Nur für fehlerfreie Entwürfe aufrufen.
// Seit v115 mit der Notiz vom Satz („VR: Schraube“ – Migration 71): Wer die Reifen später verkauft,
// soll es wissen. Sie steht am Posten und lässt sich dort ändern.
export function entwurfAlsPosten(e: PostenEntwurf, notiz?: string | null): Record<string, string | number | boolean | null> {
  const g = groesseAusText(e.groesse)!;
  return {
    zustand: "gebraucht", breite: g.breite, querschnitt: g.querschnitt, zoll: g.zoll,
    hersteller: e.hersteller.trim(), modell: e.modell.trim() || null, saison: e.saison,
    dot: e.dot.replace(/\D/g, "") || null, profiltiefe_mm: e.profiltiefe_mm, felge: e.felge,
    preis_netto: betrag(e.preis), ek_netto: betrag(e.ek), bestand: e.bestand,
    ...(notiz?.trim() ? { notiz: notiz.trim() } : {}),
  };
}

// Was auf dem Etikett eines Verkaufsreifens steht: groß die Größe und der Zustand, fett Hersteller
// und Modell, darunter Saison/DOT/Profil. Kein Preis: Er ändert sich, das Etikett bleibt kleben.
export function etikettTexte(p: Verkaufsreifen): { gross: { links: string; rechts: string }; kopf: string; zeilen: string[] } {
  return {
    gross: { links: groesseText(p), rechts: REIFEN_ZUSTAND_LABEL[p.zustand] },
    kopf: reifenName(p),
    zeilen: [
      [SAISON_LABEL[p.saison], merkmale(p) || null].filter(Boolean).join(" · "),
      [p.dot?.trim() ? `DOT ${p.dot.trim()}` : null, p.profiltiefe_mm != null ? profilMmText(p.profiltiefe_mm) : null,
        p.felge ? `Komplettrad ${p.felge === "alu" ? "Alu" : "Stahl"}` : null].filter(Boolean).join(" · "),
    ].filter(Boolean),
  };
}

// ---------------------------------------------------------------- Auswertung (E18, v103)
//
// Umsatz neu/gebraucht, Marge, Lagerwert im Verlauf und was lange liegt. Gezählt werden nur
// Positionen, die an einem Posten hängen (`verkaufsreifen_id`), auf ERLEDIGTEN Aufträgen – ein
// offener Auftrag hat den Reifen nur reserviert (Migration 61). Testaufträge (negative Nummer)
// zählen nie.
//
// Geld kommt wie überall in der Auswertung aus `orderArticleTotals` (lib/auswertung.ts, „eine
// Regel trägt das ganze Modul"), je Position einzeln.

// Wie lange ein Posten liegen darf, bevor er unter „liegt lange" erscheint.
export const VERKAUF_LANGE_LIEGEND_MONATE = 6;

export type ReifenVerkaufszeile = Pick<OrderArticle, "verkaufsreifen_id" | "quantity" | "net_price" | "vat_rate" | "endpreis_netto">
  & { auftrag: Pick<Order, "order_date" | "status" | "order_number" | "rechnung_noetig" | "deleted_at"> };

export type ZustandSumme = { stueck: number; netto: number };
export type ReifenAuswertung = {
  neu: ZustandSumme;
  gebraucht: ZustandSumme;
  // Marge nur über die Stück, bei denen ein Einkaufspreis gepflegt ist; wie viele das sind, steht dabei.
  marge: { netto: number; ek: number; marge: number; stueckMitEk: number; stueck: number };
  lagerwert: Lagerwert;
  langeLiegend: { posten: number; stueck: number; wertVk: number };
};

function zaehlt(z: ReifenVerkaufszeile): boolean {
  return z.auftrag.status === "erledigt" && !z.auftrag.deleted_at && z.auftrag.order_number > 0 && !!z.verkaufsreifen_id;
}

export function zeileNetto(z: ReifenVerkaufszeile): number {
  return orderArticleTotals([z as unknown as OrderArticle], z.auftrag.rechnung_noetig).net;
}

function monateZurueck(heute: string, monate: number): string {
  const [j, m, t] = heute.slice(0, 10).split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1 - monate, t));
  return d.toISOString().slice(0, 10);
}

export function reifenAuswertung(
  zeilen: ReifenVerkaufszeile[],
  posten: Verkaufsreifen[],
  zeitraum: { von: string; bis: string },
  heute: string
): ReifenAuswertung {
  const jePosten = new Map(posten.map((p) => [p.id, p]));
  const neu: ZustandSumme = { stueck: 0, netto: 0 };
  const gebraucht: ZustandSumme = { stueck: 0, netto: 0 };
  const marge = { netto: 0, ek: 0, marge: 0, stueckMitEk: 0, stueck: 0 };
  for (const z of zeilen) {
    if (!zaehlt(z) || z.auftrag.order_date < zeitraum.von || z.auftrag.order_date > zeitraum.bis) continue;
    const p = jePosten.get(z.verkaufsreifen_id!);
    const netto = zeileNetto(z);
    const ziel = p?.zustand === "neu" ? neu : gebraucht;
    ziel.stueck += z.quantity;
    ziel.netto += netto;
    marge.stueck += z.quantity;
    if (p?.ek_netto != null) {
      marge.stueckMitEk += z.quantity;
      marge.netto += netto;
      marge.ek += z.quantity * p.ek_netto;
    }
  }
  marge.marge = runden(marge.netto - marge.ek);
  marge.netto = runden(marge.netto); marge.ek = runden(marge.ek);
  neu.netto = runden(neu.netto); gebraucht.netto = runden(gebraucht.netto);

  const grenze = monateZurueck(heute, VERKAUF_LANGE_LIEGEND_MONATE);
  const lang = posten.filter((p) => p.bestand > 0 && p.created_at.slice(0, 10) <= grenze);
  return {
    neu, gebraucht, marge,
    lagerwert: lagerwert(posten),
    langeLiegend: { posten: lang.length, stueck: lang.reduce((s, p) => s + p.bestand, 0), wertVk: runden(lang.reduce((s, p) => s + p.bestand * p.preis_netto, 0)) },
  };
}

// Der Lagerwert (zum Verkaufspreis) am Ende jedes Monats – UNGEFÄHR. Gespeichert wird nur der
// heutige Bestand; zurückgerechnet wird über die Verkäufe: Am Monatsende lag, was heute liegt,
// plus was seitdem verkauft wurde, von den Posten, die es damals schon gab. Handkorrekturen am
// Bestand („einer war kaputt") kennt die Rechnung nicht – deshalb „ungefähr" in der Anzeige.
export function lagerwertVerlauf(
  zeilen: ReifenVerkaufszeile[],
  posten: Pick<Verkaufsreifen, "id" | "bestand" | "preis_netto" | "created_at">[],
  monatsenden: string[]
): number[] {
  return monatsenden.map((ende) => {
    let wert = 0;
    for (const p of posten) {
      if (p.created_at.slice(0, 10) > ende) continue;
      const spaeter = zeilen
        .filter((z) => zaehlt(z) && z.verkaufsreifen_id === p.id && z.auftrag.order_date > ende)
        .reduce((s, z) => s + z.quantity, 0);
      wert += (p.bestand + spaeter) * p.preis_netto;
    }
    return runden(wert);
  });
}
