import { weitereGruppen, type ModulEintrag, type TabKey } from "./module";

// Die Seitenleiste am Rechner in Bereichen (v176, Entwurf Claude outputs/Mockup_Navigation_v1.html).
//
// Wunsch Vitali 29.10.2026: Die Leiste hatte 17 Einträge untereinander, und es werden mehr. Am Handy sind die
// Seiten unter „Weitere“ schon gruppiert – dieselben Gruppen (`WEITERE_GRUPPEN` in lib/module.ts) gelten jetzt auch
// am Rechner, damit beide Navigationen nie auseinanderlaufen. Oben die vier Hauptseiten wie bisher, darunter die
// Bereiche zum Ein- und Ausklappen, „System“ (Admin, Einstellungen) unten angeheftet. Entschieden: jeder Bereich
// frei ein- und ausklappbar (Variante A), „Alle zu / Alle auf“ darüber, und die Seite, auf der man gerade ist,
// bleibt auch im zugeklappten Bereich sichtbar.
//
// Welche Bereiche zu sind, merkt sich der Rechner (`localStorage`, je Browser) – nur die Titel, keine Daten.
// Reine Funktionen, geprüft in tests/navGruppen.test.ts; Oberfläche in components/FsmNavigation.tsx.

export const NAV_ZU_MERKER = "mr-nav-zu";
// Dieser Bereich steht unten angeheftet statt in der Reihe – wie vorher Admin und Einstellungen.
export const NAV_UNTEN_GRUPPE = "System";

export type NavGruppe = { titel: string; module: ModulEintrag[] };
export type NavAufbau = { haupt: ModulEintrag[]; gruppen: NavGruppe[]; unten: NavGruppe | null };

// `sichtbar`: nur die Module, die diese Rolle sehen darf. Ein Bereich ohne sichtbares Modul fällt weg.
export function navAufbau(sichtbar: ModulEintrag[]): NavAufbau {
  const alle = weitereGruppen(sichtbar.filter((m) => !m.primaer));
  return {
    haupt: sichtbar.filter((m) => m.primaer),
    gruppen: alle.filter((g) => g.titel !== NAV_UNTEN_GRUPPE),
    unten: alle.find((g) => g.titel === NAV_UNTEN_GRUPPE) ?? null,
  };
}

// Was unter der Überschrift steht: offen alles, zugeklappt nur die Seite, auf der man gerade ist.
export function navSichtbareModule(g: NavGruppe, zu: ReadonlySet<string>, tab: TabKey): ModulEintrag[] {
  return zu.has(g.titel) ? g.module.filter((m) => m.tab === tab) : g.module;
}

export function navUmschalten(zu: ReadonlySet<string>, titel: string): Set<string> {
  const neu = new Set(zu);
  if (neu.has(titel)) neu.delete(titel); else neu.add(titel);
  return neu;
}

// Sind alle zu, gehen alle auf – sonst gehen alle zu (der Knopf sagt vorher, was passiert: `navAlleZu`).
export function navAlleZu(zu: ReadonlySet<string>, titel: string[]): boolean {
  return titel.length > 0 && titel.every((t) => zu.has(t));
}
export function navAlleUmschalten(zu: ReadonlySet<string>, titel: string[]): Set<string> {
  return navAlleZu(zu, titel) ? new Set() : new Set(titel);
}

// Ein gespeicherter Merker: eine Liste von Titeln. Alles andere (kaputt, fremd, zu lang) gilt als „nichts zu“.
export function navZuAusText(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  try {
    const roh: unknown = JSON.parse(text);
    if (!Array.isArray(roh) || roh.length > 30) return new Set();
    return new Set(roh.filter((t): t is string => typeof t === "string" && t.length > 0 && t.length <= 40));
  } catch {
    return new Set();
  }
}

// Gelesen über `useSyncExternalStore` (components/FsmNavigation.tsx): Auf dem Server und beim ersten Zeichnen im
// Browser gilt „alles offen“ (`""`), danach der Merker – sonst passte das vom Server gelieferte HTML nicht zum
// Browser (Hydration-Fehler, gefunden in der Probe v176). Ohne nutzbaren Speicher (privates Fenster, gesperrt)
// hält ein Ersatz im Arbeitsspeicher den Zustand bis zum Neuladen – Einklappen funktioniert dann trotzdem.
let ersatz = "";
const zuhoerer = new Set<() => void>();

function speicher(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
export function navZuRoh(): string {
  try {
    const s = speicher();
    return s ? s.getItem(NAV_ZU_MERKER) ?? "" : ersatz;
  } catch {
    return ersatz;
  }
}
export function navZuRohServer(): string {
  return "";
}
export function navZuAbonnieren(neu: () => void): () => void {
  zuhoerer.add(neu);
  // Ein anderes Fenster derselben App klappt um → hier mitziehen.
  if (typeof window !== "undefined") window.addEventListener("storage", neu);
  return () => {
    zuhoerer.delete(neu);
    if (typeof window !== "undefined") window.removeEventListener("storage", neu);
  };
}
export function navZuMerken(zu: ReadonlySet<string>): void {
  const text = JSON.stringify([...zu].sort());
  ersatz = text;
  try { speicher()?.setItem(NAV_ZU_MERKER, text); } catch { /* privat oder voll – dann gilt der Ersatz */ }
  zuhoerer.forEach((f) => f());
}
