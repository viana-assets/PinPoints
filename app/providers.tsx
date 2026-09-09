"use client";
import { useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";

// Zwischenspeicher für alle Datenabfragen (Roadmap Phase 10, siehe lib/queries/hooks.ts),
// seit 09.09.2026 zusätzlich dauerhaft auf dem Gerät (PWA-Stufe 3, siehe docs/pwa-plan.md).
//
// WAS DAS BEDEUTET: Kundennamen, Adressen, Telefonnummern und Aufträge liegen nach dem ersten
// Laden in der IndexedDB des Browsers – auch wenn die App geschlossen ist. Das ist der Preis
// für „funktioniert in der Tiefgarage", und er wurde bewusst bezahlt. Daran hängen drei
// Schutzmaßnahmen, die zusammengehören und nicht einzeln entfernt werden dürfen:
//
//   1. HOECHSTALTER_MS – nach sieben Tagen ohne Kontakt wird der Bestand verworfen statt
//      angezeigt. Ein Monate alter Stand ist gefährlicher als gar keiner.
//   2. datenSpeicherLeeren() beim Abmelden – siehe handleLogout in app/page.tsx. Ohne das
//      läge der Bestand des Vorgängers auf einem weitergegebenen Gerät weiter herum.
//   3. SCHEMA – ändert sich die Form der Daten, wird der alte Bestand verworfen, statt ihn
//      in eine Oberfläche zu laden, die ihn nicht mehr versteht.

const SPEICHER_SCHLUESSEL = "pinpoints-daten";
const HOECHSTALTER_MS = 7 * 24 * 60 * 60 * 1000;
// Bei jeder Änderung an der Form der gespeicherten Daten hochzählen (gleiche Regel wie
// FASSUNG in public/sw.js).
const SCHEMA = "v1";

/** Löscht den gespeicherten Datenbestand. Beim Abmelden aufzurufen. */
export async function datenSpeicherLeeren(): Promise<void> {
  try {
    await del(SPEICHER_SCHLUESSEL);
  } catch {
    // Ein fehlgeschlagenes Löschen darf das Abmelden nicht aufhalten – die Sitzung ist dann
    // trotzdem beendet, und nach sieben Tagen verfällt der Bestand ohnehin.
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Der QueryClient wird in einem useState-Initialisierer erzeugt, nicht als Modul-Konstante:
  // so gehört er zur Komponenteninstanz und kann sich zwischen zwei Server-Anfragen nicht
  // versehentlich Daten teilen.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Fehler werden zentral angezeigt (siehe app/page.tsx), nicht stillschweigend
            // wiederholt. Ein einziger erneuter Versuch fängt kurze Netzaussetzer ab.
            retry: 1,
            // Beim Zurückkehren ins Fenster nicht automatisch neu laden – die Anwendung wird
            // im Außendienst am Handy benutzt, dort ist jeder unnötige Abruf teuer.
            refetchOnWindowFocus: false,
            // Muss mindestens so lang sein wie das Höchstalter des Speichers: ein Bestand,
            // den der Zwischenspeicher nach fünf Minuten wegwirft (Voreinstellung), wird beim
            // nächsten Start gar nicht erst wiederhergestellt.
            gcTime: HOECHSTALTER_MS,
          },
        },
      })
  );

  const [persister] = useState(() =>
    createAsyncStoragePersister({
      // IndexedDB statt localStorage: der Kundenbestand sprengt die rund 5 MB, die
      // localStorage bietet, und dessen Zugriffe blockieren zudem den Hauptthread.
      storage: {
        getItem: (key) => get(key).then((wert) => wert ?? null),
        setItem: (key, wert) => set(key, wert),
        removeItem: (key) => del(key),
      },
      key: SPEICHER_SCHLUESSEL,
      throttleTime: 2000,
    })
  );

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: HOECHSTALTER_MS,
        buster: SCHEMA,
        dehydrateOptions: {
          // Nur erfolgreiche Abfragen aufheben. Einen Fehlversuch zu speichern und beim
          // nächsten Start als Zustand wiederherzustellen hilft niemandem.
          shouldDehydrateQuery: (abfrage) => abfrage.state.status === "success",
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
