// Telefonnummern vergleichen (D10, Migration 63).
//
// „0911 12345", „0911/12345" und „+49 911 12345" sind dieselbe Nummer. Die Vergleichsform ist
// „+<Ländervorwahl><Rest>", nur Ziffern: führende 00 → +, führende 0 → +49, „+49 (0)" → +49.
// Eine Nummer ohne Vorwahl („12345") bleibt, wie sie ist – woher sie stammt, weiß niemand.
//
// DIESELBE Regel steht in der Datenbank (`public.telefon_vergleich()`, Migration 63), die daraus
// `customers.mobil_vergleich` / `festnetz_vergleich` berechnet. Wer eine Stelle ändert, ändert
// beide; tests/telefon.test.ts hält die Fälle fest.

export function telefonVergleich(nummer: string | null | undefined): string | null {
  const roh = (nummer ?? "").trim();
  const ziffern = roh.replace(/[^0-9]/g, "");
  const z = roh.startsWith("+") ? "+" + ziffern : ziffern;
  if (z === "" || z === "+") return null;
  if (z.startsWith("+490")) return "+49" + z.slice(4);
  if (z.startsWith("+")) return z;
  if (z.startsWith("00")) return "+" + z.slice(2);
  if (z.startsWith("0")) return "+49" + z.slice(1);
  return z;
}

// Trifft eine Sucheingabe eine der Nummern? Erst ab vier Ziffern – „91" fände sonst jeden.
// Verglichen wird in der Vergleichsform UND als bloße Ziffernfolge: „12345" (ohne Vorwahl
// getippt) findet „0911 12345".
export function telefonPasst(nummern: (string | null | undefined)[], suche: string): boolean {
  const ziffern = suche.replace(/[^0-9]/g, "");
  if (ziffern.length < 4) return false;
  // Nur, wenn die Eingabe überwiegend eine Nummer ist – „Bahnhofstr. 12345" ist keine.
  if (suche.replace(/[\s0-9+/()-]/g, "").length > 0) return false;
  const gesucht = telefonVergleich(suche)?.replace("+", "") ?? ziffern;
  return nummern.some((n) => {
    const v = telefonVergleich(n)?.replace("+", "");
    return !!v && (v.includes(gesucht) || v.includes(ziffern));
  });
}

// Zwei Nummern derselben Person? Für die Dublettenprüfung (E1).
export function gleicheNummer(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = telefonVergleich(a);
  return !!x && x.length >= 6 && x === telefonVergleich(b);
}
