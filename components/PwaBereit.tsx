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
    const aufraeumer: (() => void)[] = [];
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

    // `updateViaCache: "none"`: Beim Prüfen auf eine neue Fassung darf der Browser die Datei
    // sw.js NICHT aus seinem eigenen Zwischenspeicher beantworten. Sonst vergleicht er die
    // alte Fassung mit sich selbst, findet nichts Neues – und das Handy bleibt wochenlang auf
    // einem Stand von gestern, ohne dass irgendwo ein Fehler auftaucht.
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((anmeldung) => {
        if (beendet) return;
        if (anmeldung.waiting) setWartendeFassung(anmeldung.waiting);

        // Aktiv nachfragen, statt auf den Browser zu hoffen: Eine installierte App auf iOS
        // wird nie geschlossen, sondern weggelegt und hervorgeholt. Ohne echten Seitenaufruf
        // prüft der Browser von sich aus nie wieder – hier passiert es beim Start und bei
        // jedem Hervorholen, höchstens einmal pro Minute.
        let zuletztGeprueft = 0;
        const pruefen = () => {
          if (document.visibilityState !== "visible") return;
          const jetzt = Date.now();
          if (jetzt - zuletztGeprueft < 60_000) return;
          zuletztGeprueft = jetzt;
          anmeldung.update().catch(() => {});
          if (anmeldung.waiting) setWartendeFassung(anmeldung.waiting);
        };
        pruefen();
        document.addEventListener("visibilitychange", pruefen);
        aufraeumer.push(() => document.removeEventListener("visibilitychange", pruefen));

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
      aufraeumer.forEach((f) => f());
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
