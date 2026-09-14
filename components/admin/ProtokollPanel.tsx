import { useMemo, useState } from "react";
import type { AuditEintrag, ProtokollPerson } from "@/lib/types";
import { PROTOKOLL_FELD_LABEL, PROTOKOLL_TABELLE_LABEL, PROTOKOLL_TAGE_STANDARD } from "@/lib/constants";
import { PROTOKOLL_AKTION_LABEL, protokollFelder, protokollWer } from "@/lib/helpers";

// Das Protokoll im Adminbereich (Migration 36): wer hat wann was geändert.
//
// Die Liste zeigt EINEN Vorgang je Zeile und die geänderten Felder darunter – nicht die
// ganze geänderte Zeile. Ein Protokoll, in dem bei jeder Änderung dreißig unveränderte
// Felder mitstehen, versteckt die eine Änderung, um die es geht.
//
// Warum die Filter oben und nicht in einer Werkzeugleiste: Wer dieses Fenster öffnet, sucht
// fast immer etwas Bestimmtes („was hat Max gestern gemacht"), nicht „alles". Die
// Voreinstellung sind die letzten 90 Tage – ältere Einträge bleiben erhalten und sind über
// das Datumsfeld erreichbar.

function tageZurueck(tage: number): string {
  const d = new Date();
  d.setDate(d.getDate() - tage);
  return d.toISOString().slice(0, 10);
}

export function ProtokollPanel({ eintraege, personen, laedt, vonDatum, onVonDatum }: {
  eintraege: AuditEintrag[];
  // Kennung → E-Mail. Kommt aus `protokoll_personen()`; ein gelöschter Zugang steht nicht
  // mehr darin, dann bleibt in der Zeile die gekürzte Kennung.
  personen: ProtokollPerson[];
  laedt: boolean;
  vonDatum: string;
  onVonDatum: (d: string) => void;
}) {
  const [tabelle, setTabelle] = useState("");
  const [wer, setWer] = useState("");
  const [offen, setOffen] = useState<number | null>(null);

  // Die Auswahllisten aus dem, was tatsächlich da ist – nicht aus dem Katalog aller
  // denkbaren Tabellen. Ein Filter, der auf nichts trifft, ist eine Sackgasse.
  const tabellen = useMemo(
    () => [...new Set(eintraege.map((e) => e.tabelle))]
      .sort((a, b) => (PROTOKOLL_TABELLE_LABEL[a] ?? a).localeCompare(PROTOKOLL_TABELLE_LABEL[b] ?? b, "de")),
    [eintraege]
  );
  const leute = useMemo(
    () => [...new Set(eintraege.map((e) => protokollWer(e.geaendert_von, personen)))]
      .sort((a, b) => a.localeCompare(b, "de")),
    [eintraege, personen]
  );

  const gefiltert = eintraege.filter(
    (e) => (!tabelle || e.tabelle === tabelle)
        && (!wer || protokollWer(e.geaendert_von, personen) === wer)
  );

  return (
    <div className="admin-card">
      <h4 style={{ margin: 0 }}>Protokoll</h4>
      <p className="small" style={{ marginTop: 2 }}>
        Jede Änderung an Aufträgen, Kunden, Lager, Artikeln, Zugängen und Rechten – mit Person
        und Zeitpunkt. Wird von der Datenbank geschrieben und lässt sich aus der App heraus
        weder ändern noch löschen.
      </p>

      <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0, minWidth: 150 }}>
          <label>Ab Datum</label>
          <input type="date" value={vonDatum} onChange={(e) => onVonDatum(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0, minWidth: 170 }}>
          <label>Bereich</label>
          <select value={tabelle} onChange={(e) => setTabelle(e.target.value)}>
            <option value="">alle</option>
            {tabellen.map((t) => (
              <option key={t} value={t}>{PROTOKOLL_TABELLE_LABEL[t] ?? t}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, minWidth: 190 }}>
          <label>Person</label>
          <select value={wer} onChange={(e) => setWer(e.target.value)}>
            <option value="">alle</option>
            {leute.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="small" style={{ margin: "8px 0 4px", color: "var(--muted)" }}>
        {laedt ? "Lädt …"
          : gefiltert.length === 0 ? "Keine Einträge für diese Auswahl."
          : `${gefiltert.length} ${gefiltert.length === 1 ? "Eintrag" : "Einträge"}`}
        {eintraege.length >= 200 && " – es werden höchstens 200 auf einmal geladen; für Älteres das Datum zurücksetzen."}
      </div>

      <div className="protokoll-liste">
        {gefiltert.map((e) => (
          <ProtokollZeile
            key={e.id}
            eintrag={e}
            personen={personen}
            offen={offen === e.id}
            onUmschalten={() => setOffen(offen === e.id ? null : e.id)}
          />
        ))}
      </div>
    </div>
  );
}

// Eine Zeile ist zugeklappt eine Aussage („Max hat gestern 14:03 eine Leistung gelöscht") und
// aufgeklappt der Beleg dazu. Beides gleichzeitig zu zeigen macht die Liste unlesbar; nur die
// Aussage zu zeigen macht sie wertlos.
export function ProtokollZeile({ eintrag, personen = [], offen, onUmschalten, ohneBereich = false }: {
  eintrag: AuditEintrag;
  personen?: ProtokollPerson[];
  offen: boolean;
  onUmschalten: () => void;
  // Im Auftragsfenster steht der Bereich schon in der Überschrift.
  ohneBereich?: boolean;
}) {
  const zeit = new Date(eintrag.geaendert_am);
  const wer = protokollWer(eintrag.geaendert_von, personen);
  const felder = protokollFelder(eintrag.alt, eintrag.neu, PROTOKOLL_FELD_LABEL);

  return (
    <div className={"protokoll-zeile" + (offen ? " offen" : "")}>
      <button type="button" className="pz-kopf" onClick={onUmschalten} aria-expanded={offen}>
        <span className="pz-zeit">
          {zeit.toLocaleDateString("de-DE")}
          <span className="pz-uhr">{zeit.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
        </span>
        <span className="pz-text">
          <b>{wer}</b>{" "}hat{" "}
          {!ohneBereich && <>{PROTOKOLL_TABELLE_LABEL[eintrag.tabelle] ?? eintrag.tabelle}{" "}</>}
          <span className={`pz-aktion pz-${eintrag.aktion.toLowerCase()}`}>
            {PROTOKOLL_AKTION_LABEL[eintrag.aktion] ?? eintrag.aktion}
          </span>
          {felder.length > 0 && (
            <span className="pz-anzahl">
              {" · "}{felder.length} {felder.length === 1 ? "Feld" : "Felder"}
            </span>
          )}
        </span>
        <span className="pz-pfeil" aria-hidden="true">{offen ? "▾" : "▸"}</span>
      </button>

      {offen && (
        <div className="pz-felder">
          {felder.length === 0 ? (
            <div className="small">Keine Feldangaben zu diesem Vorgang.</div>
          ) : (
            <table className="pz-tabelle">
              <thead>
                <tr><th>Feld</th><th>vorher</th><th>nachher</th></tr>
              </thead>
              <tbody>
                {felder.map((f) => (
                  <tr key={f.feld}>
                    <td>{f.label}</td>
                    <td title={f.rohAlt || undefined}>{f.alt}</td>
                    <td title={f.rohNeu || undefined}>{f.neu}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="small pz-kennung" title={eintrag.datensatz_id ?? undefined}>
            {eintrag.datensatz_id ? `Datensatz ${eintrag.datensatz_id.slice(0, 8)}… · ` : ""}
            Protokoll-Nr. {eintrag.id}
          </div>
        </div>
      )}
    </div>
  );
}

export { tageZurueck, PROTOKOLL_TAGE_STANDARD };
