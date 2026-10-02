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
export function standText(zeitpunkt: number): string {
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
// `offline` kommt von außen, weil die Angabe des Browsers allein nicht reicht: auf iOS meldet
// `navigator.onLine` auch im Flugmodus gelegentlich weiterhin "online". app/page.tsx bildet
// den Zustand aus drei Quellen (Browser, angehaltene Abfrage, gescheiterter Abruf) und reicht
// ihn hierher. Fehlt die Angabe, gilt weiterhin das Browser-Signal.
export function OfflineHinweis({ standVon, offline, ausgang, onAusgang }: {
  standVon?: number;
  offline?: boolean;
  // Der Ausgangskorb (F1, lib/offline/): Was auf dem Gerät gespeichert, aber noch nicht
  // übertragen ist. Der Balken erscheint dann auch MIT Netz – „gespeichert" darf nicht heißen
  // „auf dem Gerät gespeichert", ohne dass es dasteht (Konzept „Offline schreiben", Baustein 3).
  ausgang?: { wartet: number; konflikt: number; abgelehnt: number };
  onAusgang?: () => void;
}) {
  const offlineLautBrowser = useIstOffline();
  const ohneNetz = offline ?? offlineLautBrowser;
  const wartet = ausgang?.wartet ?? 0;
  const offen = (ausgang?.konflikt ?? 0) + (ausgang?.abgelehnt ?? 0);
  if (!ohneNetz && wartet === 0 && offen === 0) return null;

  const teile: string[] = [];
  if (ohneNetz) teile.push(standVon ? `Offline – angezeigt wird der ${standText(standVon)}` : "Offline – es sind keine gespeicherten Daten vorhanden.");
  if (wartet > 0) teile.push(ohneNetz
    ? `${wartet} ${wartet === 1 ? "Änderung wartet" : "Änderungen warten"} auf Netz`
    : `${wartet} ${wartet === 1 ? "Änderung wird" : "Änderungen werden"} übertragen …`);
  if ((ausgang?.konflikt ?? 0) > 0) teile.push(`${ausgang!.konflikt} ${ausgang!.konflikt === 1 ? "braucht" : "brauchen"} deine Entscheidung`);
  if ((ausgang?.abgelehnt ?? 0) > 0) teile.push(`${ausgang!.abgelehnt} nicht übernommen`);
  const text = teile.join(" · ");

  if ((wartet > 0 || offen > 0) && onAusgang) {
    return (
      <button type="button" className={"offline-hinweis ausgang" + (offen > 0 ? " achtung" : "")} role="status" onClick={onAusgang}>
        {text} <span className="ausgang-ansehen">ansehen ›</span>
      </button>
    );
  }
  return <div className="offline-hinweis" role="status">{text}</div>;
}
