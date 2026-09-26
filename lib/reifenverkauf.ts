import type { Article, ReifenZustand, Verkaufsreifen } from "./types";
import {
  DOT_ALT_JAHRE, NEUREIFEN_ALT_JAHRE, PROFIL_GESETZLICH_MM, PROFIL_HINWEIS_MM, PROFIL_KRITISCH_MM,
  REIFEN_ZUSTAND_LABEL, REIFENVERKAUF_ART, SAISON_LABEL,
} from "./constants";
import { dotJahr } from "./helpers";

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
