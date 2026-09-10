"use client";

import { useEffect, useState } from "react";
import { fassungAbfragen, nachNeuerFassungSuchen } from "@/lib/pwaAktualisierung";

// Block „App-Version" in den Einstellungen.
//
// Warum es ihn gibt: Am 10.09.2026 lief auf dem iPhone tagelang eine alte Fassung – ohne
// Balken, ohne neue Reiter, ohne Fehlermeldung. Von außen war nicht zu unterscheiden, ob eine
// Auslieferung nicht angekommen war oder nur nichts Sichtbares enthielt. Auf einem Handy gibt
// es keine Entwicklerkonsole; ohne diese Anzeige bleibt nur Raten.
//
// Der Knopf ist zugleich der Notausgang: Er fragt aktiv nach einer neuen Fassung, statt auf
// den Browser zu warten.
export function PwaFassung() {
  const [fassung, setFassung] = useState<string | null | "laedt">("laedt");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => { void fassungAbfragen().then(setFassung); }, []);

  if (typeof navigator !== "undefined" && !("serviceWorker" in navigator)) return null;

  return (
    <div className="pwa-block">
      <h4>App-Version</h4>
      <div className="small" style={{ marginBottom: 8 }}>
        {fassung === "laedt"
          ? "Wird ermittelt …"
          : fassung
            ? `Diese App läuft in Fassung ${fassung}.`
            : "Diese App läuft in einer älteren Fassung (sie meldet ihre Version noch nicht) oder ohne Service Worker."}
      </div>
      <button
        className="btn-secondary btn-block"
        type="button"
        disabled={laeuft}
        onClick={async () => {
          setLaeuft(true);
          setMeldung(null);
          try {
            const ergebnis = await nachNeuerFassungSuchen();
            setFassung(await fassungAbfragen());
            setMeldung(
              ergebnis === "neu-bereit"
                ? "Eine neue Version liegt bereit – oben erscheint der Balken „Neue Version verfügbar“. Tippe ihn an, um sie zu laden."
                : ergebnis === "aktuell"
                  ? "Diese App ist auf dem neuesten Stand."
                  : "Es ist kein Service Worker angemeldet. Die App läuft dann wie eine normale Webseite – Benachrichtigungen und Offline-Betrieb gibt es so nicht."
            );
          } finally {
            setLaeuft(false);
          }
        }}
      >
        {laeuft ? "Wird geprüft …" : "Nach neuer Version suchen"}
      </button>
      {meldung && <div className="small" style={{ marginTop: 8 }}>{meldung}</div>}
      <div className="small" style={{ marginTop: 8, color: "var(--muted)" }}>
        Kommt hier nichts an, obwohl längst eine neue Fassung veröffentlicht wurde: die App vom
        Startbildschirm löschen und über Safari neu installieren. Es gehen dabei keine Daten
        verloren – sie liegen auf dem Server.
      </div>
    </div>
  );
}
