import { APP_VERSION, NEUIGKEITEN, neuigkeitenUngelesen } from "@/lib/version";
import { formatDate } from "@/lib/helpers";

// „Was gibt es Neues" (26.09.2026): je Fassung, was sich geändert hat – für Admin und
// Superadmin, damit das Büro sieht, was getan wurde. Techniker bekommen die Seite nicht
// angeboten; die Fassung selbst steht für alle in den Einstellungen.
//
// `gesehen` ist die Fassung, die diese Person zuletzt geöffnet hatte, BEVOR das Blatt aufging –
// die Einträge danach tragen „neu". Das Öffnen selbst merkt die Seite (user_settings).
export function NeuigkeitenBlatt({ gesehen, onClose }: { gesehen: string | null | undefined; onClose: () => void }) {
  const neu = new Set(neuigkeitenUngelesen(gesehen).map((n) => n.version));
  return (
    <div className="modal-overlay auswahl-overlay" onClick={onClose}>
      <div className="auswahl-blatt am-breit nw-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Was gibt es Neues">
        <div className="ab-griff" />
        <div className="ar-blatt-kopf">
          <div className="ab-titel">Was gibt es Neues</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>
        <span className="small">Diese App läuft in Fassung <b>{APP_VERSION}</b>.</span>
        {NEUIGKEITEN.map((n) => (
          <div key={n.version} className={"nw-eintrag" + (neu.has(n.version) ? " neu" : "")}>
            <div className="nw-kopf">
              <span className="nw-version">{n.version}</span>
              <b>{n.titel}</b>
              {neu.has(n.version) && <span className="nw-neu">neu</span>}
              <span className="small nw-datum">{formatDate(n.datum)}</span>
            </div>
            <ul>
              {n.punkte.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
