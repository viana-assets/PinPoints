import { useState } from "react";
import type { Article, Auftragsvorlage } from "@/lib/types";
import type { VorlageFelder } from "@/lib/api/vorlagen";

// Auftragsvorlagen pflegen (Migration 63, E6) – unter der Artikelliste, weil eine Vorlage nichts
// anderes ist als eine Auswahl von Artikeln mit Menge. „Saisonwechsel mobil" = Räderwechsel +
// 4× Auswuchten + 4× Ventil: im Auftrag ein Tipp statt vier.
//
// Eine Vorlage kennt keine Preise. Eingetragen wird sie als ganz normale Positionen mit dem
// Preis des Tages; ein Artikel, der inzwischen inaktiv ist, wird dabei übersprungen.
export function VorlagenBlock({ vorlagen, articles, darfPflegen, onSpeichern, onLoeschen }: {
  vorlagen: Auftragsvorlage[];
  articles: Article[];
  darfPflegen: boolean;
  onSpeichern: (id: string | null, felder: VorlageFelder) => Promise<void>;
  onLoeschen: (id: string) => Promise<void>;
}) {
  const [offen, setOffen] = useState<Auftragsvorlage | "neu" | null>(null);
  const name = (id: string) => articles.find((a) => a.id === id)?.short_name ?? "unbekannter Artikel";

  return (
    <div className="db-karte vl-block">
      <div className="db-karte-kopf">
        <span className="db-karte-titel">Auftragsvorlagen</span>
        {darfPflegen && <button type="button" className="kl-neu" onClick={() => setOffen("neu")}>+ Vorlage</button>}
      </div>
      <span className="small">Mehrere Leistungen mit einem Tipp in den Auftrag – im Auftrag unter &bdquo;+ Vorlage&ldquo;.</span>
      {vorlagen.length === 0 && <div className="db-leer">Noch keine Vorlage angelegt.</div>}
      {vorlagen.map((v) => (
        <button key={v.id} type="button" className={"vl-zeile" + (v.aktiv ? "" : " inaktiv")} disabled={!darfPflegen} onClick={() => setOffen(v)}>
          <b>{v.name}</b>
          <span className="small">
            {v.positionen.length === 0 ? "noch leer" : v.positionen.map((p) => `${p.quantity > 1 ? p.quantity + "× " : ""}${name(p.article_id)}`).join(" · ")}
            {!v.aktiv ? " · inaktiv" : ""}
          </span>
        </button>
      ))}
      {offen && (
        <VorlageBlatt
          vorlage={offen === "neu" ? null : offen}
          articles={articles}
          onClose={() => setOffen(null)}
          onSpeichern={async (felder) => { await onSpeichern(offen === "neu" ? null : offen.id, felder); setOffen(null); }}
          onLoeschen={offen === "neu" ? undefined : async () => {
            if (!confirm(`Vorlage „${offen.name}" löschen? Aufträge, in die sie schon eingetragen wurde, bleiben, wie sie sind.`)) return;
            await onLoeschen(offen.id); setOffen(null);
          }}
        />
      )}
    </div>
  );
}

function VorlageBlatt({ vorlage, articles, onClose, onSpeichern, onLoeschen }: {
  vorlage: Auftragsvorlage | null;
  articles: Article[];
  onClose: () => void;
  onSpeichern: (felder: VorlageFelder) => Promise<void>;
  onLoeschen?: () => Promise<void>;
}) {
  const [name, setName] = useState(vorlage?.name ?? "");
  const [zeilen, setZeilen] = useState(vorlage?.positionen ?? []);
  const [aktiv, setAktiv] = useState(vorlage?.aktiv ?? true);
  const [neuArtikel, setNeuArtikel] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const waehlbar = articles.filter((a) => a.active).sort((a, b) => a.article_number - b.article_number);

  async function speichern() {
    setLaeuft(true);
    try { await onSpeichern({ name, positionen: zeilen, aktiv, sortierung: vorlage?.sortierung ?? 0 }); }
    finally { setLaeuft(false); }
  }

  return (
    <div className="modal-overlay auswahl-overlay" onClick={onClose}>
      <div className="auswahl-blatt am-breit ar-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Auftragsvorlage">
        <div className="ab-griff" />
        <div className="ab-titel">{vorlage ? "Vorlage bearbeiten" : "Neue Vorlage"}</div>
        <label className="nk-feld"><span>Name</span>
          <input type="text" value={name} placeholder="z. B. Saisonwechsel mobil" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="vl-positionen">
          {zeilen.map((z, i) => (
            <div key={i} className="vl-position">
              <input type="number" min={1} max={99} value={z.quantity} aria-label="Menge"
                onChange={(e) => {
                  const n = Math.max(1, Math.min(99, Math.round(Number(e.target.value) || 1)));
                  setZeilen(zeilen.map((x, j) => (j === i ? { ...x, quantity: n } : x)));
                }} />
              <span>{articles.find((a) => a.id === z.article_id)?.short_name ?? "unbekannter Artikel"}</span>
              <button type="button" className="btn-secondary btn-rand ag-klein" onClick={() => setZeilen(zeilen.filter((_, j) => j !== i))}>Entfernen</button>
            </div>
          ))}
          <div className="vl-position">
            <select value={neuArtikel} onChange={(e) => setNeuArtikel(e.target.value)} aria-label="Leistung hinzufügen">
              <option value="">– Leistung hinzufügen –</option>
              {waehlbar.map((a) => <option key={a.id} value={a.id}>{a.article_number} · {a.short_name}</option>)}
            </select>
            <button type="button" className="btn-secondary btn-rand ag-klein" disabled={!neuArtikel}
              onClick={() => { setZeilen([...zeilen, { article_id: neuArtikel, quantity: 1 }]); setNeuArtikel(""); }}>Dazu</button>
          </div>
        </div>
        <label className="vl-aktiv"><input type="checkbox" checked={aktiv} onChange={(e) => setAktiv(e.target.checked)} /> im Auftrag anbieten</label>
        <button type="button" className="am-knopf" disabled={laeuft || !name.trim() || zeilen.length === 0} onClick={() => void speichern()}>
          {laeuft ? "speichert …" : "Speichern"}
        </button>
        {onLoeschen && <button type="button" className="es-knopf ad-gefahr" style={{ marginTop: 8 }} onClick={() => void onLoeschen()}>Vorlage löschen</button>}
      </div>
    </div>
  );
}
