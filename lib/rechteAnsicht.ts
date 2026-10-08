import type { Role } from "./types";
import {
  RECHTE_ABHAENGIGKEITEN, RECHTE_KATALOG, VERBEN, VERB_LABEL, rechtSchluessel,
  type RechtBereich, type Verb,
} from "./constants";

// Die Rechtematrix lesbarer machen (v124, Schritt 1 der Überarbeitung vom 08.10.2026): Gruppen
// zum Einklappen, „x von y“ je Gruppe, Hinweise auf Haken, die ins Leere laufen, und „Ansehen als
// …“ in Klartext. Alles hier rechnet nur – entschieden wird weiter in der Datenbank
// (`public.darf()`, Migration 42), und die Anzeige darf ihr nicht widersprechen.

// Was für einen Bereich gilt: Rollen je Verb (aus `module_permissions`, sonst aus der Vorgabe).
export type RechteLesen = (bereich: string) => Partial<Record<Verb, string[]>>;

export type RechteGruppe = { modul: RechtBereich; unter: RechtBereich[] };

// Der Katalog ist eine flache Liste: eine Modulzeile, darunter ihre eingerückten Zeilen.
export function rechteGruppen(katalog: RechtBereich[] = RECHTE_KATALOG): RechteGruppe[] {
  const gruppen: RechteGruppe[] = [];
  for (const b of katalog) {
    if (b.unter && gruppen.length > 0) gruppen[gruppen.length - 1].unter.push(b);
    else gruppen.push({ modul: b, unter: [] });
  }
  return gruppen;
}

export function hatRecht(rechte: RechteLesen, bereich: string, verb: Verb, rolle: Role): boolean {
  if (rolle === "superadmin") return true;
  const b = RECHTE_KATALOG.find((x) => x.schluessel === bereich);
  if (b?.gesperrt) return true;
  if (b && !b.verben.includes(verb)) return false;
  return (rechte(bereich)[verb] ?? []).includes(rolle);
}

// „5 von 9“: gesetzte Haken der Gruppe gegenüber denen, die es gibt. Gesperrte Zeilen (immer an)
// zählen nicht – man kann sie weder setzen noch wegnehmen.
export function gruppeZaehlung(g: RechteGruppe, rechte: RechteLesen, rolle: Role): { an: number; von: number } {
  let an = 0, von = 0;
  for (const b of [g.modul, ...g.unter]) {
    if (b.gesperrt) continue;
    for (const v of b.verben) {
      von++;
      if (hatRecht(rechte, b.schluessel, v, rolle)) an++;
    }
  }
  return { an, von };
}

function nameOhneStrich(b: RechtBereich): string {
  return b.label.replace(/^–\s*/, "");
}
function bereichName(schluessel: string): string {
  const b = RECHTE_KATALOG.find((x) => x.schluessel === schluessel);
  return b ? nameOhneStrich(b) : schluessel;
}
function rechtText(schluessel: string, verb: Verb): string {
  const b = RECHTE_KATALOG.find((x) => x.schluessel === schluessel);
  return b?.klartext?.[verb] ?? `${bereichName(schluessel)} – ${VERB_LABEL[verb]}`;
}

export type RechtHinweis = { bereich: string; schluessel: string; text: string };

// Haken, die für diese Rolle ins Leere laufen. Je Hinweis die Zeile, an der er steht.
export function rechteHinweise(rechte: RechteLesen, rolle: Role): RechtHinweis[] {
  if (rolle === "superadmin") return [];
  const hinweise: RechtHinweis[] = [];
  const an = (bereich: string, verb: Verb) => hatRecht(rechte, bereich, verb, rolle);

  // 1. Schreiben oder Löschen ohne Lesen in derselben Zeile.
  for (const b of RECHTE_KATALOG) {
    if (b.gesperrt || !b.verben.includes("lesen") || an(b.schluessel, "lesen")) continue;
    const ohne = VERBEN.filter((v) => v !== "lesen" && b.verben.includes(v) && an(b.schluessel, v));
    if (ohne.length > 0) {
      hinweise.push({
        bereich: b.schluessel, schluessel: rechtSchluessel(b.schluessel, ohne[0]),
        text: `„${ohne.map((v) => VERB_LABEL[v]).join("“ und „")}“ ohne „Lesen“ läuft ins Leere: Was die Rolle nicht sieht, kann sie nicht ändern.`,
      });
    }
  }

  // 2. Eingerückte Zeile mit Haken, ihr Reiter aber aus.
  for (const g of rechteGruppen()) {
    if (g.unter.length === 0 || an(g.modul.schluessel, "lesen")) continue;
    const mitHaken = g.unter.filter((u) => u.verben.some((v) => an(u.schluessel, v)));
    if (mitHaken.length > 0) {
      hinweise.push({
        bereich: g.modul.schluessel, schluessel: rechtSchluessel(g.modul.schluessel, "lesen"),
        text: `Der Reiter „${nameOhneStrich(g.modul)}“ ist aus. Die Haken darunter gelten trotzdem – überall, wo die App den Bereich an anderer Stelle zeigt (etwa im Auftrag).`,
      });
    }
  }

  // 3. Die bekannten Voraussetzungen zwischen Bereichen.
  for (const a of RECHTE_ABHAENGIGKEITEN) {
    if (!an(a.bereich, a.verb)) continue;
    const fehlt = a.braucht.filter((x) => !an(x.bereich, x.verb));
    if (fehlt.length === 0) continue;
    hinweise.push({
      bereich: a.bereich, schluessel: rechtSchluessel(a.bereich, a.verb),
      text: `Braucht ${fehlt.map((x) => `„${rechtText(x.bereich, x.verb)}“`).join(" und ")}. ${a.grund}`,
    });
  }
  return hinweise;
}

// „Ansehen als …“: je Gruppe, was die Rolle kann und was nicht – in Sätzen statt Haken.
export type KlartextGruppe = { titel: string; kann: string[]; kannNicht: string[] };

export function rolleKlartext(rechte: RechteLesen, rolle: Role): KlartextGruppe[] {
  return rechteGruppen().map((g) => {
    const kann: string[] = [], kannNicht: string[] = [];
    for (const b of [g.modul, ...g.unter]) {
      for (const v of b.verben) {
        (hatRecht(rechte, b.schluessel, v, rolle) ? kann : kannNicht).push(rechtText(b.schluessel, v));
      }
    }
    return { titel: nameOhneStrich(g.modul), kann, kannNicht };
  });
}
