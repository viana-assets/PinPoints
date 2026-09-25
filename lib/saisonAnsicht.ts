import { plzAus } from "./helpers";

// Die Regeln hinter der neu gestalteten Saisonliste (26.09.2026, Entwurf „I · Saisonliste").
//
// Die Liste war eine Tabelle mit einer Zeile je SATZ. Telefoniert wird aber je KUNDE, und
// angerufen wird am besten Gebiet für Gebiet – wer in 90482 anruft, plant die Tour gleich mit.
// Deshalb hier: Sätze zu Kunden bündeln, Kunden nach Postleitzahl gruppieren, Gebiete
// vorschlagen. Reine Funktionen, geprüft in tests/saisonAnsicht.test.ts.

type MitKunde = { cust: { id: string; name: string; address: string | null } };

// Der Ort aus einer einzeiligen Adresse: was nach der Postleitzahl bis zum nächsten Komma steht.
// „Hauptstr. 3, 90482 Nürnberg" → „Nürnberg". Ohne Postleitzahl kein Ort – geraten wird nicht.
export function ortAus(adresse: string | null): string | null {
  if (!adresse) return null;
  const treffer = /(?<!\d)\d{5}(?!\d)\s*([^,\n]+)/.exec(adresse);
  const ort = treffer?.[1]?.trim();
  return ort ? ort : null;
}

export type SaisonGruppe<Z extends MitKunde> = {
  plz: string | null;
  ort: string | null;
  kunden: { kunde: Z["cust"]; saetze: Z[] }[];
};

// Sätze → Kunden → Gruppen nach Postleitzahl. Ein Kunde mit zwei Autos steht EINMAL da, mit
// beiden Sätzen darunter – dieselbe Regel wie beim Erzeugen der Anrufliste (je Kunde, nicht je
// Satz). Gruppen aufsteigend nach PLZ, Kunden darin nach Name; wer keine Postleitzahl in der
// Adresse hat, steht am Ende in einer eigenen Gruppe, statt zu verschwinden.
export function saisonGruppen<Z extends MitKunde>(zeilen: Z[]): SaisonGruppe<Z>[] {
  const jeKunde = new Map<string, { kunde: Z["cust"]; saetze: Z[] }>();
  for (const z of zeilen) {
    const eintrag = jeKunde.get(z.cust.id);
    if (eintrag) eintrag.saetze.push(z);
    else jeKunde.set(z.cust.id, { kunde: z.cust, saetze: [z] });
  }
  const gruppen = new Map<string, SaisonGruppe<Z>>();
  for (const k of jeKunde.values()) {
    const plz = plzAus(k.kunde.address);
    const schluessel = plz ?? "";
    const g = gruppen.get(schluessel);
    if (g) g.kunden.push(k);
    else gruppen.set(schluessel, { plz, ort: ortAus(k.kunde.address), kunden: [k] });
  }
  return [...gruppen.values()]
    .map((g) => ({ ...g, kunden: g.kunden.sort((a, b) => a.kunde.name.localeCompare(b.kunde.name, "de")) }))
    .sort((a, b) => (a.plz == null ? 1 : b.plz == null ? -1 : a.plz.localeCompare(b.plz)));
}

// Gebiete zum Antippen: die ersten drei Ziffern der Postleitzahl, mit der Zahl der KUNDEN und
// dem häufigsten Ort darin. Die größten zuerst – dort lohnt das Telefonieren am meisten.
export function plzVorschlaege<Z extends MitKunde>(zeilen: Z[], hoechstens = 8): { praefix: string; ort: string | null; kunden: number }[] {
  const jePraefix = new Map<string, { kunden: Set<string>; orte: Map<string, number> }>();
  for (const z of zeilen) {
    const plz = plzAus(z.cust.address);
    if (!plz) continue;
    const praefix = plz.slice(0, 3);
    const e = jePraefix.get(praefix) ?? { kunden: new Set<string>(), orte: new Map<string, number>() };
    if (!e.kunden.has(z.cust.id)) {
      e.kunden.add(z.cust.id);
      const ort = ortAus(z.cust.address);
      if (ort) e.orte.set(ort, (e.orte.get(ort) ?? 0) + 1);
    }
    jePraefix.set(praefix, e);
  }
  return [...jePraefix.entries()]
    .map(([praefix, e]) => ({
      praefix,
      ort: [...e.orte.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"))[0]?.[0] ?? null,
      kunden: e.kunden.size,
    }))
    .sort((a, b) => b.kunden - a.kunden || a.praefix.localeCompare(b.praefix))
    .slice(0, hoechstens);
}

// Das Datum „in N Wochen" als YYYY-MM-DD, für die Wiedervorlage. Ortszeit, nicht UTC – sonst
// springt es abends um einen Tag.
export function inWochen(wochen: number, heute: Date = new Date()): string {
  const d = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + wochen * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
