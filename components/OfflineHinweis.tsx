"use client";

import { useEffect, useState } from "react";

// Erkennt, ob das Gerät gerade ohne Netz ist.
//
// Was `navigator.onLine` wirklich sagt: „es gibt eine Netzwerkverbindung" – nicht „der Server
// ist erreichbar". Im WLAN eines Hotels mit Anmeldeseite steht die Anzeige auf online, obwohl
// nichts durchkommt. Für den Fall, um den es hier geht – Flugmodus, Funkloch, Tiefgarage –
// stimmt sie zuverlässig, und mehr behauptet der Hinweis auch nicht.
export function useIstOffline(): boolean {
  // Beim ersten Rendern bewusst `false`: auf dem Server gibt es keinen navigator, und ein
  // abweichendes erstes Bild würde React beim Abgleich beanstanden.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    function pruefen() {
      setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    }
    pruefen();
    window.addEventListener("online", pruefen);
    window.addEventListener("offline", pruefen);
    return () => {
      window.removeEventListener("online", pruefen);
      window.removeEventListener("offline", pruefen);
    };
  }, []);

  return offline;
}

// Wann wurde der angezeigte Bestand zuletzt wirklich geladen? Ohne diese Angabe weiß niemand,
// ob er auf Daten von vor zehn Minuten oder von vor drei Tagen schaut – und genau das
// entscheidet, ob man danach handeln darf.
function standText(zeitpunkt: number): string {
  const d = new Date(zeitpunkt);
  const uhrzeit = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const heute = new Date();
  const gleicherTag =
    d.getFullYear() === heute.getFullYear() && d.getMonth() === heute.getMonth() && d.getDate() === heute.getDate();
  if (gleicherTag) return `Stand von ${uhrzeit} Uhr`;
  return `Stand vom ${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}, ${uhrzeit} Uhr`;
}

// Schmaler Balken am Rand, solange kein Netz da ist.
//
// Warum überhaupt: Ohne Netz zeigt die App den zuletzt geladenen Stand (PWA-Stufe 3). Das ist
// gewollt – aber nur dann harmlos, wenn unübersehbar dabeisteht, dass es ein gespeicherter
// Stand ist und wie alt er ist. Eine Anwendung, die stillschweigend Alte Daten zeigt, ist
// gefährlicher als eine, die gar nichts zeigt.
//
// Der Balken liegt über der Karte (z-index), aber unter den Dialogen: Er soll immer sichtbar
// sein, darf aber kein offenes Fenster überdecken.
export function OfflineHinweis({ standVon }: { standVon?: number }) {
  const offline = useIstOffline();
  if (!offline) return null;
  return (
    <div className="offline-hinweis" role="status">
      {standVon ? `Offline – ${standText(standVon)}` : "Offline – es sind keine gespeicherten Daten vorhanden."}
    </div>
  );
}
