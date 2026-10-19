// Mehrere Fenster derselben App auf einem Rechner gleichen sich ab (v167).
//
// Wunsch Vitali (19.10.2026): Zwei Fenster der Einsatzplanung nebeneinander; im einen wird ein Termin einem anderen
// Mitarbeiter zugeordnet, das andere zeigte es erst nach F5. Jede Änderung in der App endet damit, dass sie die
// betroffenen Abfragen verwirft (`neuLaden` / `invalidateQueries`). Genau dieses Verwerfen meldet ein Fenster jetzt
// über einen `BroadcastChannel` an die anderen Fenster desselben Browsers, und die verwerfen dieselben Abfragen (gibt
// es die genaue nicht, alle derselben Art) – was sichtbar ist, lädt sofort nach. Übertragen werden nur die
// Abfrage-Schlüssel, keine Daten.
//
// Grenzen: nur Fenster im selben Browser auf demselben Gerät. Ein anderes Gerät (Handy des Technikers) sieht die
// Änderung wie bisher beim nächsten Hervorholen bzw. nach spätestens einer Minute (`refetchOnWindowFocus`,
// `staleTime`). Damit ein empfangenes Verwerfen nicht als neue Meldung zurückläuft (Ping-Pong), merkt sich das
// Fenster kurz, was es selbst empfangen hat. Geprüft in tests/fensterAbgleich.test.ts.

import type { QueryClient, QueryKey } from "@tanstack/react-query";

const KANAL = "mr-abgleich";
const ECHO_MS = 3000;
const SAMMELN_MS = 40;

type Kanal = Pick<BroadcastChannel, "postMessage" | "close"> & { onmessage: ((e: MessageEvent) => void) | null };

export function fensterAbgleichStarten(queryClient: QueryClient, kanalBauen?: () => Kanal | null): () => void {
  const kanal = kanalBauen ? kanalBauen() : (typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(KANAL) as unknown as Kanal);
  if (!kanal) return () => {};
  const empfangen = new Map<string, number>();
  const offen = new Map<string, QueryKey>();
  let zeitgeber: ReturnType<typeof setTimeout> | null = null;

  const aus = queryClient.getQueryCache().subscribe((ereignis) => {
    if (ereignis.type !== "updated" || ereignis.action.type !== "invalidate") return;
    const hash = ereignis.query.queryHash;
    const wann = empfangen.get(hash);
    if (wann !== undefined && Date.now() - wann < ECHO_MS) return;
    offen.set(hash, ereignis.query.queryKey);
    if (!zeitgeber) {
      zeitgeber = setTimeout(() => {
        zeitgeber = null;
        const schluessel = [...offen.values()];
        offen.clear();
        try { kanal.postMessage({ art: "verworfen", schluessel }); } catch { /* Schlüssel nicht übertragbar – dann eben nicht */ }
      }, SAMMELN_MS);
    }
  });

  kanal.onmessage = (e: MessageEvent) => {
    const d = e.data as { art?: string; schluessel?: unknown };
    if (d?.art !== "verworfen" || !Array.isArray(d.schluessel)) return;
    const jetzt = Date.now();
    const cache = queryClient.getQueryCache();
    const treffer = new Set<string>();
    for (const key of d.schluessel) {
      if (!Array.isArray(key) || key.length === 0) continue;
      // Dieselbe Abfrage gibt es hier – dann genau die. Sonst alle derselben Art: Die Aufträge hängen am Zeitfenster
      // (`qk.auftraege(fenster)`), und das andere Fenster zeigt oft einen anderen Ausschnitt.
      const genau = cache.find({ queryKey: key, exact: true });
      const liste = genau ? [genau] : cache.findAll({ queryKey: [key[0]] });
      for (const q of liste) treffer.add(q.queryHash);
    }
    if (!treffer.size) return;
    for (const h of treffer) empfangen.set(h, jetzt);
    void queryClient.invalidateQueries({ predicate: (q) => treffer.has(q.queryHash) });
  };

  return () => {
    aus();
    if (zeitgeber) clearTimeout(zeitgeber);
    kanal.onmessage = null;
    kanal.close();
  };
}
