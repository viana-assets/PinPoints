import type { PostgrestError } from "@supabase/supabase-js";

// Gemeinsame Grundlage aller lib/api-Funktionen (Roadmap Phase 9 + 10.1).
//
// Vorher wurde in dieser Schicht praktisch nie `error` ausgewertet: 58 Supabase-Aufrufe,
// vier Prüfungen. Eine abgelehnte Schreiboperation – RLS-Verweigerung, Netzabbruch,
// verletzte Constraint – verschwand damit spurlos, und das anschließende `refreshX()`
// überschrieb die Eingabe des Nutzers mit dem alten Serverstand. Der Nutzer sah seine
// Eingabe verschwinden und hielt es für einen Anzeigefehler.
//
// Ab hier wirft jede Datenzugriffsfunktion bei einem Fehler eine `ApiError`. Das ist einem
// Fehler-Rückgabewert aus drei Gründen vorzuziehen: der Aufrufer kann ihn nicht versehentlich
// ignorieren, das nachfolgende `refreshX()` wird übersprungen (die Eingabe bleibt also
// stehen), und es ist genau die Form, die eine Server-Cache-Bibliothek wie TanStack Query in
// Phase 10 erwartet. app/page.tsx fängt alles zentral ab und zeigt eine Meldung an – siehe
// dort `unhandledrejection`.
//
// Ausnahme, bewusst: fachlich ERWARTETE Fehler (z. B. eine bereits vergebene Artikelnummer)
// werden weiterhin als Rückgabewert gemeldet, nicht als Ausnahme – das ist kein Defekt,
// sondern eine normale Rückmeldung an den Nutzer.

export class ApiError extends Error {
  readonly kontext: string;
  readonly code: string | null;

  constructor(kontext: string, ursache: { message: string; code?: string | null }) {
    super(`${kontext}: ${ursache.message}`);
    this.name = "ApiError";
    this.kontext = kontext;
    this.code = ursache.code ?? null;
  }
}

// Eine Supabase-Antwort, wie sie jeder Query-Builder liefert.
type Antwort<T> = { data: T | null; error: PostgrestError | null };

// PostgREST liefert pro Anfrage höchstens so viele Zeilen (Standardeinstellung von Supabase).
// Genau daran wären die Vollabzüge unten bei den geplanten ~4500 Kunden still gescheitert:
// ohne `range()` kommen 1000 Zeilen zurück, ohne Fehler und ohne Hinweis – Suche, Karte und
// Kennzahlen hätten auf einem Viertel des Bestands gearbeitet und trotzdem plausibel
// ausgesehen. `fetchPaged()` blättert deshalb, bis eine Seite nicht mehr voll ist.
export const PAGE_SIZE = 1000;

// Führt eine Abfrage aus und wirft bei einem Fehler. `kontext` ist der Text, den der Nutzer
// zu sehen bekommt ("Kunden konnten nicht geladen werden").
export async function q<T>(kontext: string, abfrage: PromiseLike<Antwort<T>>): Promise<T | null> {
  const { data, error } = await abfrage;
  if (error) throw new ApiError(kontext, error);
  return data;
}

// Wie q(), aber für Abfragen, die zwingend eine Zeile liefern müssen (`.single()`).
export async function qOne<T>(kontext: string, abfrage: PromiseLike<Antwort<T>>): Promise<T> {
  const data = await q<T>(kontext, abfrage);
  if (data === null || data === undefined) {
    throw new ApiError(kontext, { message: "Es wurde kein Datensatz zurückgegeben." });
  }
  return data;
}

// Führt eine schreibende Abfrage aus und wirft bei einem Fehler.
export async function qWrite(kontext: string, abfrage: PromiseLike<{ error: PostgrestError | null }>): Promise<void> {
  const { error } = await abfrage;
  if (error) throw new ApiError(kontext, error);
}

// Lädt eine Tabelle vollständig, seitenweise. `seite(von, bis)` baut dieselbe Abfrage mit
// unterschiedlichem `range()` – abgebrochen wird, sobald eine Seite nicht mehr voll ist.
export async function fetchPaged<T>(
  kontext: string,
  seite: (von: number, bis: number) => PromiseLike<Antwort<T[]>>
): Promise<T[]> {
  const alle: T[] = [];
  for (let von = 0; ; von += PAGE_SIZE) {
    const { data, error } = await seite(von, von + PAGE_SIZE - 1);
    if (error) throw new ApiError(kontext, error);
    const teil = (data as T[] | null) || [];
    alle.push(...teil);
    if (teil.length < PAGE_SIZE) break;
  }
  return alle;
}
