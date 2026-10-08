import { useEffect, useState } from "react";

// „Jetzt“ für die laufende Anzeige, im Takt neu gesetzt. `versatzMs` gleicht die Uhr des Geräts an
// die der Datenbank an (siehe app/_seite/useZeiterfassung.ts). `aktiv` false: kein Takt – eine
// stehende Uhr braucht keinen.
export function useJetzt(taktMs: number, versatzMs: number, aktiv: boolean): number {
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    if (!aktiv) return;
    const id = setInterval(() => setJetzt(Date.now()), taktMs);
    return () => clearInterval(id);
  }, [taktMs, aktiv]);
  return jetzt + versatzMs;
}
