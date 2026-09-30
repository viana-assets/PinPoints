import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import type { AuditEintrag, ProtokollPerson } from "@/lib/types";
import { fetchAuftragProtokoll, fetchProtokollPersonen } from "@/lib/api/audit";
import { ProtokollZeile } from "@/components/admin/ProtokollPanel";
import { PROTOKOLL_TABELLE_LABEL } from "@/lib/constants";
import type { TerminStand } from "@/lib/terminAenderung";

// Die Historie EINES Auftrags im Auftragsfenster (Migration 36).
//
// Es ist dasselbe Protokoll wie im Adminbereich, nur auf diesen Auftrag gefiltert – und
// bewusst dieselbe Zeilenkomponente. Zwei Darstellungen derselben Aufzeichnung wären zwei
// Gelegenheiten, dieselbe Änderung unterschiedlich zu beschreiben.
//
// Mit drin sind die Leistungen des Auftrags: Der Trigger schreibt an jeder Zeile von
// `order_articles` die `order_id` als Auftragsbezug mit. „Wer hat die Leistung gelöscht?" ist
// eine Frage an den Auftrag, nicht an eine Tabelle, von der der Nutzer nichts weiß.
//
// Geladen wird erst beim Aufklappen. Das Auftragsfenster wird oft geöffnet, um schnell etwas
// nachzusehen; eine zusätzliche Abfrage bei jedem Öffnen wäre Aufwand für eine Frage, die
// meistens niemand stellt. Wer nicht lesen darf, bekommt laut RLS eine leere Liste – dann
// bleibt hier der Hinweis stehen, dass nichts zu sehen ist, und kein Fehler.
export function AuftragProtokoll({ auftragId, stand, onTerminUebernehmen }: {
  auftragId: string;
  // Wann der Auftrag zuletzt geändert wurde (`updated_at`). Ändert er sich, ist die geladene
  // Liste veraltet – bis v90 stand nach einem Verschieben die alte Liste da, bis das Fenster
  // zuging, und die Änderung fehlte scheinbar.
  stand?: string;
  onTerminUebernehmen?: (termin: TerminStand) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [offen, setOffen] = useState(false);
  // Wie oft aufgeklappt – jedes Aufklappen lädt neu. Die Leistungen und die Einlagerung
  // ändern `stand` nicht, ihre Einträge sollen trotzdem nicht erst beim nächsten Fenster kommen.
  const [aufgeklappt, setAufgeklappt] = useState(0);
  // Wofür die Liste geladen wurde. Passt der Schlüssel nicht mehr (anderer Auftrag, neuer
  // Stand, erneut aufgeklappt), gilt sie als nicht geladen – ohne Effekt, der sie leert.
  const schluessel = `${auftragId}|${stand ?? ""}|${aufgeklappt}`;
  const [geladen, setGeladen] = useState<{ schluessel: string; eintraege: AuditEintrag[]; personen: ProtokollPerson[]; fehler?: boolean } | null>(null);
  const aktuell = geladen?.schluessel === schluessel ? geladen : null;
  const eintraege = aktuell?.eintraege ?? null;
  const personen = aktuell?.personen ?? [];
  const laedt = offen && !aktuell;
  const [offeneZeile, setOffeneZeile] = useState<number | null>(null);

  useEffect(() => {
    if (!offen || aktuell) return;
    let abgebrochen = false;
    Promise.all([fetchAuftragProtokoll(supabase, auftragId), fetchProtokollPersonen(supabase)])
      .then(([zeilen, leute]) => {
        if (!abgebrochen) setGeladen({ schluessel, eintraege: zeilen, personen: leute });
      })
      // Den Fehler zeigt die zentrale Anzeige; hier bleibt dann nicht ewig „Lädt …" stehen.
      .catch((fehler) => { if (!abgebrochen) setGeladen({ schluessel, eintraege: [], personen: [], fehler: true }); throw fehler; });
    return () => { abgebrochen = true; };
  }, [offen, aktuell, schluessel, auftragId, supabase]);

  function umschalten() {
    if (!offen) { setAufgeklappt((n) => n + 1); setOffeneZeile(null); }
    setOffen(!offen);
  }

  return (
    <div className="auftrag-protokoll">
      <button type="button" className="ap-schalter" onClick={umschalten} aria-expanded={offen}>
        <span aria-hidden="true">{offen ? "▾" : "▸"}</span> Historie – wer hat was geändert
      </button>
      {offen && (
        <div className="ap-inhalt">
          {laedt && <div className="small">Lädt …</div>}
          {!laedt && aktuell?.fehler && <div className="small">Die Historie konnte nicht geladen werden.</div>}
          {!laedt && !aktuell?.fehler && eintraege?.length === 0 && (
            <div className="small">
              Zu diesem Auftrag ist nichts aufgezeichnet. Das Protokoll kennt nur Änderungen ab
              seiner Einführung – ältere Aufträge sind deshalb leer.
            </div>
          )}
          {!laedt && eintraege && eintraege.length > 0 && (
            <div className="protokoll-liste">
              {eintraege.map((e) => (
                <ProtokollZeile
                  key={e.id}
                  eintrag={e}
                  personen={personen}
                  offen={offeneZeile === e.id}
                  onUmschalten={() => setOffeneZeile(offeneZeile === e.id ? null : e.id)}
                  // Im Auftragsfenster ist „Auftrag" selbstverständlich – aber „Leistung im
                  // Auftrag" ist es nicht, deshalb bleibt der Bereich sichtbar, sobald er
                  // etwas anderes als den Auftrag selbst meint.
                  ohneBereich={e.tabelle === "orders"}
                  // Im Auftragsfenster ist der Auftrag selbstverständlich – die Kontextzeile
                  // stünde an jeder Zeile gleich da und sagte nichts.
                  ohneKontext
                  onTerminUebernehmen={onTerminUebernehmen}
                />
              ))}
              <div className="small" style={{ color: "var(--muted)" }}>
                Enthält auch Änderungen an den Leistungen
                ({PROTOKOLL_TABELLE_LABEL.order_articles}) und an der Einlagerung.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
