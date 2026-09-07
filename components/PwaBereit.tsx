"use client";

import { useEffect, useState } from "react";
import { pwaInstallationBeobachten } from "@/lib/pwaInstallation";

// Meldet den Service Worker an und zeigt einen Hinweisbalken, sobald eine neue Fassung
// bereitliegt. Siehe docs/pwa-plan.md, Stufe 2.
//
// Warum der Balken und kein stilles Austauschen: Ein Service Worker liefert die alte Fassung
// weiter, bis das letzte Fenster geschlossen wurde – am Handy passiert das wochenlang nicht.
// Ohne diesen Balken säße jemand beliebig lange auf einem alten Stand und niemand wüsste es.
// Umgekehrt darf die neue Fassung auch nicht einfach übernehmen: ein Neuladen mitten in einem
// halb ausgefüllten Auftragsfenster verliert die Eingabe. Deshalb entscheidet der Nutzer.
export function PwaBereit() {
  const [wartendeFassung, setWartendeFassung] = useState<ServiceWorker | null>(null);

  // Das Angebot des Browsers zur Installation kommt kurz nach dem Laden und nur einmal.
  // Hier zuzuhören ist der früheste Zeitpunkt, den die Anwendung hat – der Knopf in den
  // Einstellungen holt es sich später aus lib/pwaInstallation.ts ab.
  useEffect(() => { pwaInstallationBeobachten(); }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let beendet = false;
    // `controllerchange` feuert, wenn die wartende Fassung übernommen hat. Das Neuladen
    // steht hier und nicht am Knopf: so lädt die Seite erst neu, wenn der neue Worker
    // tatsächlich das Steuer hat, und nicht Sekundenbruchteile davor.
    let schonNeuGeladen = false;
    function beiWechsel() {
      if (schonNeuGeladen) return;
      schonNeuGeladen = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener("controllerchange", beiWechsel);

    navigator.serviceWorker
      .register("/sw.js")
      .then((anmeldung) => {
        if (beendet) return;
        if (anmeldung.waiting) setWartendeFassung(anmeldung.waiting);
        anmeldung.addEventListener("updatefound", () => {
          const neue = anmeldung.installing;
          if (!neue) return;
          neue.addEventListener("statechange", () => {
            // `controller` ist nur gesetzt, wenn schon ein Worker läuft. Fehlt er, ist das
            // die ERSTE Anmeldung – dann gibt es nichts zu aktualisieren und kein Balken.
            if (neue.state === "installed" && navigator.serviceWorker.controller) {
              setWartendeFassung(neue);
            }
          });
        });
      })
      // Scheitert die Anmeldung (privater Modus, abgeschaltete Worker), läuft die Anwendung
      // ohne Service Worker weiter – sie ist auf ihn nicht angewiesen.
      .catch(() => {});

    return () => {
      beendet = true;
      navigator.serviceWorker.removeEventListener("controllerchange", beiWechsel);
    };
  }, []);

  if (!wartendeFassung) return null;

  return (
    <div className="pwa-hinweis" role="status">
      <span>Neue Version verfügbar</span>
      <button type="button" onClick={() => wartendeFassung.postMessage("UEBERNIMM")}>
        Jetzt laden
      </button>
    </div>
  );
}
