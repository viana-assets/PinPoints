"use client";

import { useEffect, useState } from "react";
import { geraetAbmelden, geraetAnmelden, pushLage, testNachrichtSenden, type PushLage } from "@/lib/push";
import { letztesAntippen } from "@/lib/benachrichtigungZiel";

// Block „Benachrichtigungen" in den Einstellungen – Vortest für die Terminerinnerung
// (docs/benachrichtigungen-plan.md).
//
// Bewusst pro GERÄT und nicht pro Konto: Eine Push-Anmeldung gehört zu genau einem Browser auf
// genau einem Gerät. Wer sein Handy und den Rechner anmeldet, hat zwei Anmeldungen – und muss
// jede einzeln treffen können.
export function PushEinstellung() {
  const [lage, setLage] = useState<PushLage | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  // Spur des letzten Antippens (siehe lib/benachrichtigungZiel.ts). Auf einem iPhone gibt es
  // keine Entwicklerkonsole – ohne diese Zeile lässt sich nicht unterscheiden, ob eine
  // angetippte Meldung gar nicht ankam oder nur das Öffnen des Fensters scheiterte.
  const [antippen, setAntippen] = useState<{ url: string; zeit: number } | null>(null);
  useEffect(() => { void letztesAntippen().then(setAntippen); }, []);

  async function lageNeuBestimmen() {
    setLage(await pushLage());
  }
  useEffect(() => { void lageNeuBestimmen(); }, []);

  if (lage === null) return null;

  if (lage === "nicht-installiert") {
    return (
      <div className="pwa-block">
        <h4>Benachrichtigungen</h4>
        <div className="pwa-warnung">
          Auf iPhone und iPad gibt es Benachrichtigungen <b>nur in der installierten App</b> –
          nicht in Safari. Lege PinPoints erst über den Block darüber auf den Startbildschirm
          und öffne diese Einstellung dann dort noch einmal.
        </div>
      </div>
    );
  }

  if (lage === "nicht-unterstuetzt") {
    return (
      <div className="pwa-block">
        <h4>Benachrichtigungen</h4>
        <div className="small">Dieser Browser kann keine Benachrichtigungen empfangen.</div>
      </div>
    );
  }

  if (lage === "verweigert") {
    return (
      <div className="pwa-block">
        <h4>Benachrichtigungen</h4>
        <div className="pwa-warnung">
          Die Erlaubnis wurde für diese App abgelehnt. Das lässt sich aus der App heraus nicht
          zurücknehmen – es geht nur in den Systemeinstellungen des Geräts unter Mitteilungen.
        </div>
      </div>
    );
  }

  return (
    <div className="pwa-block">
      <h4>Benachrichtigungen</h4>
      <div className="small" style={{ marginBottom: 8 }}>
        {lage === "an"
          ? "Dieses Gerät ist angemeldet und kann Terminerinnerungen empfangen."
          : "Dieses Gerät ist noch nicht angemeldet."}
      </div>
      {lage === "an" ? (
        <>
          <button
            className="btn-primary btn-block"
            type="button"
            disabled={laeuft}
            onClick={async () => {
              setLaeuft(true); setMeldung(null);
              const ergebnis = await testNachrichtSenden();
              setMeldung(ergebnis.text);
              setLaeuft(false);
            }}
          >
            {laeuft ? "Wird verschickt…" : "Testnachricht an mich"}
          </button>
          <button
            className="btn-secondary btn-block"
            type="button"
            style={{ marginTop: 8 }}
            disabled={laeuft}
            onClick={async () => {
              setLaeuft(true); setMeldung(null);
              await geraetAbmelden();
              await lageNeuBestimmen();
              setMeldung("Dieses Gerät bekommt keine Benachrichtigungen mehr.");
              setLaeuft(false);
            }}
          >
            Dieses Gerät abmelden
          </button>
        </>
      ) : (
        <button
          className="btn-primary btn-block"
          type="button"
          disabled={laeuft}
          onClick={async () => {
            setLaeuft(true); setMeldung(null);
            const ergebnis = await geraetAnmelden();
            await lageNeuBestimmen();
            setMeldung(ergebnis.ok ? "Gerät angemeldet." : ergebnis.grund);
            setLaeuft(false);
          }}
        >
          {laeuft ? "Einen Moment…" : "Dieses Gerät anmelden"}
        </button>
      )}
      {meldung && <div className="small" style={{ marginTop: 8 }}>{meldung}</div>}
      {antippen && (
        <div className="small" style={{ marginTop: 8, color: "var(--muted)" }}>
          Zuletzt angetippt:{" "}
          {new Date(antippen.zeit).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
          {" → "}{antippen.url}
        </div>
      )}
      {lage === "an" && (
        <div className="small" style={{ marginTop: 8, color: "var(--muted)" }}>
          Kommt nichts an, obwohl der Versand gemeldet wurde: iOS unterdrückt Mitteilungen im
          Fokus &bdquo;Fahren&ldquo;. PinPoints muss dort einmal als erlaubte App eingetragen werden.
        </div>
      )}
    </div>
  );
}
