import { useState } from "react";
import { dauerText, ZEIT_URLAUB_VORGABEN, type ZeitPerson } from "@/lib/zeiterfassung";
import { Blatt } from "@/components/Blatt";

// Urlaub eintragen oder entfernen (Migration 83, v136). Nur mit „Zeiten aller · schreiben“, immer
// mit Grund – die Datenbank prüft beides noch einmal. Eingetragen werden die Werktage (Mo–Fr) im
// Zeitraum; Feiertage kennt die App nicht, die nimmt man danach mit „Entfernen“ wieder heraus.
export function UrlaubBlatt({ personen, vorgabe, onSetzen, onLoeschen, onClose }: {
  personen: ZeitPerson[];
  vorgabe: { personId?: string; tag?: string };
  onSetzen: (u: { profileId: string; von: string; bis: string; minuten: number; grund: string }) => Promise<number>;
  onLoeschen: (u: { profileId: string; von: string; bis: string; grund: string }) => Promise<number>;
  onClose: () => void;
}) {
  const [personId, setPersonId] = useState(vorgabe.personId ?? personen[0]?.id ?? "");
  const [modus, setModus] = useState<"setzen" | "loeschen">("setzen");
  const [von, setVon] = useState(vorgabe.tag ?? "");
  const [bis, setBis] = useState(vorgabe.tag ?? "");
  const [minuten, setMinuten] = useState<number>(ZEIT_URLAUB_VORGABEN[0].minuten);
  const [eigene, setEigene] = useState("");
  const [grund, setGrund] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const eigeneMinuten = (() => {
    const m = /^(\d{1,2})(?:[:,.](\d{1,2}))?$/.exec(eigene.trim());
    if (!m) return null;
    const h = Number(m[1]); const min = m[2] ? (eigene.includes(":") ? Number(m[2]) : Math.round(Number(`0.${m[2]}`) * 60)) : 0;
    const gesamt = h * 60 + min;
    return gesamt >= 1 && gesamt <= 720 ? gesamt : null;
  })();
  const vorgabeAktiv = ZEIT_URLAUB_VORGABEN.some((v) => v.minuten === minuten) && !eigene;

  async function ausfuehren() {
    setFehler(null); setErgebnis(null);
    if (!personId) { setFehler("Bitte die Person wählen."); return; }
    if (!von || !bis) { setFehler("Bitte „von“ und „bis“ angeben."); return; }
    if (bis < von) { setFehler("„bis“ muss am oder nach „von“ liegen."); return; }
    if (grund.trim().length < 3) { setFehler("Bitte einen Grund angeben (Pflicht)."); return; }
    const min = eigene ? eigeneMinuten : minuten;
    if (modus === "setzen" && !min) { setFehler("Die Stunden je Tag bitte als z. B. 6 oder 6:30 angeben (höchstens 12)."); return; }
    setLaeuft(true);
    try {
      const n = modus === "setzen"
        ? await onSetzen({ profileId: personId, von, bis, minuten: min as number, grund: grund.trim() })
        : await onLoeschen({ profileId: personId, von, bis, grund: grund.trim() });
      setErgebnis(modus === "setzen"
        ? (n === 0 ? "Nichts geändert – im Zeitraum war das schon so eingetragen (oder nur Wochenende)." : `${n} ${n === 1 ? "Tag" : "Tage"} eingetragen.`)
        : (n === 0 ? "Im Zeitraum war kein Urlaub eingetragen." : `${n} ${n === 1 ? "Tag" : "Tage"} entfernt.`));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Blatt titel="Urlaub" breite="mittel" ebene="zt-overlay" onClose={onClose}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>{ergebnis ? "Fertig" : "Abbrechen"}</button>
        <button type="button" className={modus === "setzen" ? "btn-primary" : "btn-danger"} onClick={() => void ausfuehren()} disabled={laeuft}>
          {laeuft ? "speichert …" : modus === "setzen" ? "Urlaub eintragen" : "Urlaub entfernen"}
        </button>
      </>}>
      <div className="lg-lagerwahl ar-segment" role="group" aria-label="Was tun">
        <button type="button" className={modus === "setzen" ? "aktiv" : ""} aria-pressed={modus === "setzen"} onClick={() => setModus("setzen")}>Eintragen</button>
        <button type="button" className={modus === "loeschen" ? "aktiv" : ""} aria-pressed={modus === "loeschen"} onClick={() => setModus("loeschen")}>Entfernen</button>
      </div>
      <div className="ar-karte-feld">
        <label className="nk-feld">
          <span>Person</span>
          <select value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Person">
            {personen.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="nk-zeile">
          <label className="nk-feld"><span>von</span><input type="date" value={von} onChange={(e) => { setVon(e.target.value); if (!bis || bis < e.target.value) setBis(e.target.value); }} aria-label="von" /></label>
          <label className="nk-feld"><span>bis</span><input type="date" value={bis} onChange={(e) => setBis(e.target.value)} aria-label="bis" /></label>
        </div>
        {modus === "setzen" && (
          <div className="nk-feld">
            <span>Je Tag</span>
            <div className="lg-lagerwahl ar-segment" role="group" aria-label="Umfang">
              {ZEIT_URLAUB_VORGABEN.map((v) => (
                <button key={v.minuten} type="button" className={vorgabeAktiv && minuten === v.minuten ? "aktiv" : ""} aria-pressed={vorgabeAktiv && minuten === v.minuten}
                  onClick={() => { setMinuten(v.minuten); setEigene(""); }}>{v.text}</button>
              ))}
            </div>
            <input type="text" inputMode="decimal" value={eigene} onChange={(e) => setEigene(e.target.value)} placeholder="oder eigene Stunden, z. B. 6:30" aria-label="Eigene Stunden je Tag" />
            {eigene && eigeneMinuten && <span className="bl-hilfe">= {dauerText(eigeneMinuten * 60_000)} h je Tag</span>}
          </div>
        )}
      </div>
      <label className="nk-feld">
        <span>Grund (Pflicht)</span>
        <input type="text" value={grund} onChange={(e) => setGrund(e.target.value)} maxLength={300}
          placeholder={modus === "setzen" ? "z. B. Urlaubsantrag vom 1.10." : "z. B. Feiertag, Urlaub verschoben"} aria-label="Grund" />
      </label>
      <p className="bl-hilfe">
        {modus === "setzen"
          ? "Eingetragen werden die Werktage Mo–Fr im Zeitraum. Ein Feiertag darin wird mitgezählt – dann diesen Tag danach entfernen."
          : "Entfernt den eingetragenen Urlaub im Zeitraum. Vorher und Grund bleiben bei den Korrekturen festgehalten."}
      </p>
      {fehler && <div className="zt-hinweis fehler" role="alert">{fehler}</div>}
      {ergebnis && <div className="zt-hinweis info" role="status">{ergebnis}</div>}
    </Blatt>
  );
}
