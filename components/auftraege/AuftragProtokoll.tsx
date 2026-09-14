import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import type { AuditEintrag, ProtokollPerson } from "@/lib/types";
import { fetchAuftragProtokoll, fetchProtokollPersonen } from "@/lib/api/audit";
import { ProtokollZeile } from "@/components/admin/ProtokollPanel";
import { PROTOKOLL_TABELLE_LABEL } from "@/lib/constants";

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
export function AuftragProtokoll({ auftragId }: { auftragId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [offen, setOffen] = useState(false);
  const [eintraege, setEintraege] = useState<AuditEintrag[] | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [offeneZeile, setOffeneZeile] = useState<number | null>(null);
  const [personen, setPersonen] = useState<ProtokollPerson[]>([]);

  useEffect(() => {
    if (!offen || eintraege !== null) return;
    let abgebrochen = false;
    setLaedt(true);
    Promise.all([fetchAuftragProtokoll(supabase, auftragId), fetchProtokollPersonen(supabase)])
      .then(([zeilen, leute]) => {
        if (abgebrochen) return;
        setEintraege(zeilen);
        setPersonen(leute);
      })
      .finally(() => { if (!abgebrochen) setLaedt(false); });
    return () => { abgebrochen = true; };
  }, [offen, eintraege, auftragId, supabase]);

  // Ein Auftragswechsel im selben Fenster muss die Liste verwerfen, sonst stünde die Historie
  // des vorigen Auftrags unter dem neuen.
  useEffect(() => { setEintraege(null); setOffeneZeile(null); }, [auftragId]);

  return (
    <div className="auftrag-protokoll">
      <button type="button" className="ap-schalter" onClick={() => setOffen(!offen)} aria-expanded={offen}>
        <span aria-hidden="true">{offen ? "▾" : "▸"}</span> Historie – wer hat was geändert
      </button>
      {offen && (
        <div className="ap-inhalt">
          {laedt && <div className="small">Lädt …</div>}
          {!laedt && eintraege?.length === 0 && (
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
