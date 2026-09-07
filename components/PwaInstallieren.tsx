"use client";

import { useEffect, useState } from "react";
import {
  beiAenderung, installationAnstossen, installationslage, type Installationslage,
} from "@/lib/pwaInstallation";

// Block "App installieren" in den Einstellungen. Siehe docs/pwa-plan.md.
//
// Der Weg zur Installation ist je Browser ein anderer, und auf dem iPhone gibt es überhaupt
// keinen Knopf, den eine Web-App drücken könnte – Apple erlaubt das nicht. Deshalb zeigt
// dieser Block nicht immer dasselbe, sondern das, was hier und jetzt tatsächlich geht.
export function PwaInstallieren() {
  // Erst nach dem Einhängen bestimmen: auf dem Server gibt es keinen navigator, und ein
  // abweichendes erstes Bild würde React beim Abgleich beanstanden.
  const [lage, setLage] = useState<Installationslage | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  useEffect(() => {
    setLage(installationslage());
    return beiAenderung(() => setLage(installationslage()));
  }, []);

  if (lage === null) return null;

  const adresse = typeof window !== "undefined" ? window.location.host : "";

  if (lage === "installiert") {
    return (
      <div className="pwa-block">
        <h4>App</h4>
        <div className="small">
          PinPoints läuft bereits als installierte App. Vom Startbildschirm aus öffnet sie sich
          ohne Adressleiste und startet schneller.
        </div>
      </div>
    );
  }

  if (lage === "knopf") {
    return (
      <div className="pwa-block">
        <h4>App installieren</h4>
        <div className="small" style={{ marginBottom: 8 }}>
          PinPoints als App einrichten: eigenes Symbol, Start ohne Adressleiste, schnellerer
          Start.
        </div>
        <button
          className="btn-primary btn-block"
          type="button"
          onClick={async () => {
            const ergebnis = await installationAnstossen();
            if (ergebnis === "abgelehnt") setMeldung("Abgebrochen – du kannst es jederzeit erneut versuchen.");
            if (ergebnis === "nicht-moeglich") setMeldung("Dieser Browser bietet die Installation gerade nicht an.");
          }}
        >
          App installieren
        </button>
        {meldung && <div className="small" style={{ marginTop: 8 }}>{meldung}</div>}
      </div>
    );
  }

  if (lage === "ios-fremd") {
    return (
      <div className="pwa-block">
        <h4>App installieren</h4>
        <div className="pwa-warnung">
          Auf dem iPhone und iPad kann <b>nur Safari</b> eine Web-App auf den Startbildschirm
          legen – in Chrome, Firefox oder Edge fehlt die Funktion.
        </div>
        <ol className="pwa-schritte">
          <li>Safari öffnen und <b>{adresse}</b> aufrufen.</li>
          <li>Unten auf das Teilen-Symbol tippen – das Quadrat mit dem Pfeil nach oben.</li>
          <li>In der Liste nach unten wischen bis <b>&bdquo;Zum Home-Bildschirm&ldquo;</b>.</li>
          <li>Oben rechts auf <b>Hinzufügen</b> tippen.</li>
        </ol>
        <div className="small">Danach meldest du dich in der App einmal neu an – das ist normal.</div>
      </div>
    );
  }

  if (lage === "ios-safari") {
    return (
      <div className="pwa-block">
        <h4>App installieren</h4>
        <div className="small" style={{ marginBottom: 8 }}>
          Apple lässt Web-Apps keinen Installationsknopf anbieten. Auf dem iPhone geht es in
          vier Schritten von Hand:
        </div>
        <ol className="pwa-schritte">
          <li>Unten auf das Teilen-Symbol tippen – das Quadrat mit dem Pfeil nach oben.</li>
          <li>In der Liste nach unten wischen bis <b>&bdquo;Zum Home-Bildschirm&ldquo;</b>.</li>
          <li>Oben rechts auf <b>Hinzufügen</b> tippen.</li>
          <li>PinPoints künftig über das neue Symbol starten, nicht mehr über Safari.</li>
        </ol>
        <div className="small">Danach meldest du dich in der App einmal neu an – das ist normal.</div>
      </div>
    );
  }

  return (
    <div className="pwa-block">
      <h4>App installieren</h4>
      <div className="small" style={{ marginBottom: 8 }}>
        Dieser Browser bietet die Installation gerade nicht selbst an. In Chrome und Edge
        findest du sie im Menü oben rechts:
      </div>
      <ol className="pwa-schritte">
        <li>Menü öffnen (die drei Punkte oben rechts).</li>
        <li><b>&bdquo;PinPoints installieren&ldquo;</b> oder <b>&bdquo;Zum Startbildschirm hinzufügen&ldquo;</b> wählen.</li>
      </ol>
      <div className="small">
        Fehlt der Eintrag, läuft PinPoints als normale Seite weiter – funktional fehlt dir
        nichts.
      </div>
    </div>
  );
}
