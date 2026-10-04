import type { Vehicle } from "./types";

// Kennzeichen vergleichen (01.10.2026).
//
// Anlass: Beim Kunden stand dasselbe Kennzeichen dreimal in der Fahrzeugliste. Jedes „+ anlegen"
// im Auftragsfenster legte ein neues Fahrzeug an – auch wenn der Kunde das Auto längst hatte.
// In der Auswahl „+ weiteres Fahrzeug" stand es dann dreimal, und man wusste nicht, welches
// gemeint ist.
//
// Verglichen wird ohne Leerzeichen, Bindestriche und Punkte und ohne Groß-/Kleinschreibung:
// „N-KK 1012", „N KK1012" und „n kk 1012" sind dasselbe Auto. Mehr wird nicht geraten – ein
// Zahlendreher bleibt ein anderes Kennzeichen. Geprüft in tests/kennzeichen.test.ts.
export function kennzeichenSchluessel(kennzeichen: string | null | undefined): string {
  return (kennzeichen ?? "").toUpperCase().replace(/[\s\-–.·]/g, "");
}

// So, wie ein Kennzeichen eingetippt gespeichert wird: in Großbuchstaben (v108, KennzeichenFeld).
// Leerzeichen und Bindestriche bleiben, wie sie getippt wurden – „FÜ-AB 123" ist die übliche
// Schreibweise, und der Vergleich oben sieht ohnehin über sie hinweg. „ß" bleibt stehen (es
// käme in einem Kennzeichen nicht vor, und „SS" verschöbe die Schreibmarke).
export function kennzeichenGross(text: string): string {
  return text.replace(/[^ß]+/g, (t) => t.toLocaleUpperCase("de-DE"));
}

// Das Fahrzeug mit diesem Kennzeichen, falls der Kunde es schon hat. Ein leeres Kennzeichen
// passt zu nichts – „ohne Kennzeichen" ist keine Gleichheit.
export function fahrzeugMitKennzeichen(fahrzeuge: Vehicle[], kennzeichen: string): Vehicle | null {
  const k = kennzeichenSchluessel(kennzeichen);
  if (!k) return null;
  return fahrzeuge.find((v) => kennzeichenSchluessel(v.license_plate) === k) ?? null;
}

// Welche Kennzeichen in einer Liste mehrfach vorkommen (als Schlüssel).
export function doppelteKennzeichen(fahrzeuge: Vehicle[]): Set<string> {
  const gesehen = new Set<string>();
  const doppelt = new Set<string>();
  for (const v of fahrzeuge) {
    const k = kennzeichenSchluessel(v.license_plate);
    if (!k) continue;
    if (gesehen.has(k)) doppelt.add(k);
    gesehen.add(k);
  }
  return doppelt;
}

// Die Zeile in einer Auswahlliste: Kennzeichen, Modell, Reifengröße – so viel, dass zwei
// Einträge mit gleichem Kennzeichen sich unterscheiden lassen.
export function fahrzeugAuswahlText(v: Vehicle, doppelt?: Set<string>): string {
  const teile = [v.license_plate?.trim(), v.make_model?.trim(), v.tire_size?.trim()].filter(Boolean);
  const text = teile.join(" · ") || "Fahrzeug ohne Kennzeichen";
  return doppelt?.has(kennzeichenSchluessel(v.license_plate)) ? `${text} (doppelt angelegt)` : text;
}
