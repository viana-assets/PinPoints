"use client";

import { FELD_TEXT, wertText, type Absicht } from "@/lib/offline/ausgang";
import { konfliktEntscheiden } from "@/lib/offline/senden";
import { ausgangEntfernen } from "@/lib/offline/speicher";
import { Blatt } from "@/components/Blatt";

// Der Ausgangskorb (F1): was auf diesem Gerät gespeichert, aber noch nicht übertragen ist.
//
// Drei Arten von Einträgen, jede mit dem, was man damit tun kann:
//   * wartet     – geht von selbst, sobald Netz da ist. Verwerfen ist möglich, mit Rückfrage.
//   * Konflikt   – jemand hat dasselbe Feld inzwischen anders gesetzt. Beide Fassungen stehen da,
//                  ein Mensch entscheidet (Konzept „Offline schreiben", Baustein 5). Nie
//                  gewinnt still eine Seite.
//   * nicht übernommen – die Datenbank hat abgelehnt (Auftrag abgeschlossen, keine Berechtigung
//                  …). Der Grund steht dabei; mehr als zur Kenntnis nehmen geht nicht.
export function AusgangFenster({ absichten, online, onSenden, onClose }: {
  absichten: Absicht[];
  online: boolean;
  onSenden: () => void;
  onClose: () => void;
}) {
  const zeit = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  async function entscheiden(a: Absicht, wahl: "meine" | "server") {
    await konfliktEntscheiden(a, wahl);
    if (wahl === "meine" && online) onSenden();
  }

  return (
    <Blatt titel="Noch nicht übertragen" breite="mittel" onClose={onClose}
      fuss={online && absichten.some((a) => a.zustand === "wartet")
        ? <button type="button" className="btn-primary" onClick={onSenden}>Jetzt übertragen</button>
        : undefined}>
      <p className="bl-hilfe">
        Diese Änderungen sind auf diesem Gerät gespeichert. {online
          ? "Sie gehen jetzt der Reihe nach an den Server."
          : "Sobald wieder Netz da ist, gehen sie von selbst an den Server – die App muss dafür nur geöffnet sein."}
      </p>

      {absichten.length === 0 && <div className="db-leer">Alles übertragen.</div>}

      {absichten.map((a) => (
        <div key={a.id} className={"ag-zeile " + a.zustand}>
          <div className="ag-kopf">
            <b>{a.titel}</b>
            <span className="small">{zeit(a.erstellt)}</span>
          </div>
          {a.zustand === "wartet" && (
            <div className="ag-fuss">
              <span className="small">wartet {online ? "– wird übertragen" : "auf Netz"}</span>
              <button type="button" className="btn-secondary btn-rand ag-klein"
                onClick={() => { if (confirm("Diese Änderung verwerfen? Sie ist dann auch auf diesem Gerät weg.")) void ausgangEntfernen(a.id); }}>
                Verwerfen
              </button>
            </div>
          )}
          {a.zustand === "konflikt" && (
            <>
              <span className="small">Inzwischen hat jemand dasselbe geändert. Welche Fassung soll gelten?</span>
              {(a.konflikt ?? []).map((k) => (
                <div key={k.feld} className="ag-konflikt">
                  <span className="ag-feld">{FELD_TEXT[k.feld] ?? k.feld}</span>
                  <span><span className="small">auf diesem Gerät:</span> <b>{wertText(k.meine)}</b></span>
                  <span><span className="small">inzwischen im System:</span> <b>{wertText(k.server)}</b></span>
                </div>
              ))}
              <div className="ag-fuss">
                <button type="button" className="btn-primary ag-klein" onClick={() => void entscheiden(a, "meine")}>Meine Fassung</button>
                <button type="button" className="btn-secondary btn-rand ag-klein" onClick={() => void entscheiden(a, "server")}>Fassung im System behalten</button>
              </div>
            </>
          )}
          {a.zustand === "abgelehnt" && (
            <>
              <span className="small ag-grund">Nicht übernommen: {a.grund}</span>
              <div className="ag-fuss">
                <button type="button" className="btn-secondary btn-rand ag-klein" onClick={() => void ausgangEntfernen(a.id)}>Zur Kenntnis genommen</button>
              </div>
            </>
          )}
        </div>
      ))}

    </Blatt>
  );
}
