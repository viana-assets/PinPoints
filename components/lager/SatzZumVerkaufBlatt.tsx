import { useState } from "react";
import type { Customer, EingelagertesRad, TireStorage, Vehicle } from "@/lib/types";
import { SAISON_LABEL, SAISON_LISTE } from "@/lib/constants";
import { notizenText } from "@/lib/lagerNotizen";
import { entwurfAlsPosten, entwurfFehler, groesseAusText, groesseText, postenAusSatz, profilMmText, type PostenEntwurf } from "@/lib/reifenverkauf";

// Ein eingelagerter Satz wird zum Verkaufsposten (Fahrplan E17, v103).
//
// Der Kunde lässt seine alten Reifen da oder verkauft sie an uns. Bisher hieß das: auslagern, dann
// im Reiter „Verkauf" alles noch einmal erfassen, was am Satz längst stand. Jetzt kommen Größe,
// DOT, Profil und Felge aus den Raddaten mit (`postenAusSatz`, lib/reifenverkauf.ts); dazu
// gehören nur noch Hersteller und Preis. Verschiedene DOT oder Größen werden eigene Posten.
//
// Gespeichert wird in EINEM Zug (`satz_zum_verkauf()`, Migration 64): Der Satz wird ausgelagert,
// die Posten liegen auf demselben Platz. Eine Lagergebühr wird dabei nicht berechnet – stand noch
// eine aus, gehört sie in einen Auftrag (oder wird mit dem Ankaufspreis verrechnet).
export function SatzZumVerkaufBlatt({ satz, raeder, fahrzeug, kunde, platzText, onClose, onUebernehmen }: {
  satz: TireStorage;
  raeder: EingelagertesRad[];
  fahrzeug: Vehicle | null;
  kunde: Customer | null;
  platzText: string;
  onClose: () => void;
  onUebernehmen: (posten: Record<string, string | number | boolean | null>[]) => Promise<void>;
}) {
  const [entwuerfe, setEntwuerfe] = useState<PostenEntwurf[]>(() => postenAusSatz(satz, raeder, fahrzeug?.tire_size));
  const [versucht, setVersucht] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const fehlerJe = entwuerfe.map(entwurfFehler);
  const stueck = entwuerfe.reduce((n, e) => n + e.bestand, 0);

  function setze(i: number, teil: Partial<PostenEntwurf>) {
    setEntwuerfe(entwuerfe.map((e, j) => (j === i ? { ...e, ...teil } : e)));
  }
  // Hersteller und Modell gelten meist für alle Posten desselben Satzes – einmal getippt, überall.
  // Mitgezogen wird jeder Posten, der bisher dasselbe stehen hatte (oder nichts); wer einen
  // Posten bewusst anders benennt, behält seinen Text.
  function fuerAlle(feld: "hersteller" | "modell", wert: string, i: number) {
    const bisher = entwuerfe[i][feld];
    setEntwuerfe(entwuerfe.map((e, j) => (j === i || e[feld] === bisher || !e[feld].trim() ? { ...e, [feld]: wert } : e)));
  }

  async function uebernehmen() {
    setVersucht(true);
    if (fehlerJe.some(Boolean)) return;
    setLaeuft(true);
    setFehler(null);
    try {
      await onUebernehmen(entwuerfe.map((e) => entwurfAlsPosten(e, notizenText(satz))));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Das Übernehmen hat nicht geklappt.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="modal-overlay auswahl-overlay" onClick={onClose}>
      <div className="auswahl-blatt am-breit ar-blatt vk-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="In den Reifenverkauf übernehmen">
        <div className="ab-griff" />
        <div className="ar-blatt-kopf">
          <div className="ab-titel">In den Reifenverkauf</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>
        <span className="small">
          Der Satz {kunde ? `von ${kunde.name}` : ""}{fahrzeug?.license_plate ? ` (${fahrzeug.license_plate})` : ""} wird ausgelagert. Die Reifen
          bleiben, wo sie sind ({platzText || "ohne Platz"}), und stehen danach im Reiter „Verkauf“ – {stueck} Stück
          in {entwuerfe.length} {entwuerfe.length === 1 ? "Posten" : "Posten"}. Eine Lagergebühr wird dabei nicht berechnet.
        </span>

        {entwuerfe.map((e, i) => {
          const g = groesseAusText(e.groesse);
          const f = versucht ? fehlerJe[i] : null;
          return (
            <div key={i} className="ar-karte-feld vz-posten">
              {entwuerfe.length > 1 && <span className="op-gruppe-titel">POSTEN {i + 1}</span>}
              <div className="nk-zeile">
                <label className="nk-feld vk-groesse">
                  <span>Größe</span>
                  <input type="text" autoCapitalize="characters" placeholder="205/55 R16" value={e.groesse}
                    onChange={(ev) => setze(i, { groesse: ev.target.value })} onBlur={() => { if (g) setze(i, { groesse: groesseText(g) }); }} />
                </label>
                <label className="nk-feld vk-kennung">
                  <span>Stück</span>
                  <input type="number" min={1} max={999} value={e.bestand}
                    onChange={(ev) => setze(i, { bestand: Math.max(1, Math.min(999, Math.round(Number(ev.target.value) || 1))) })} />
                </label>
              </div>
              <div className="nk-zeile">
                <label className="nk-feld">
                  <span>Hersteller *</span>
                  <input type="text" placeholder="Continental" value={e.hersteller} onChange={(ev) => fuerAlle("hersteller", ev.target.value, i)} />
                </label>
                <label className="nk-feld">
                  <span>Modell</span>
                  <input type="text" placeholder="WinterContact" value={e.modell} onChange={(ev) => fuerAlle("modell", ev.target.value, i)} />
                </label>
              </div>
              <div className="lg-lagerwahl ar-segment" role="group" aria-label="Saison">
                {SAISON_LISTE.map((s) => (
                  <button key={s} type="button" className={e.saison === s ? "aktiv" : ""} aria-pressed={e.saison === s} onClick={() => setze(i, { saison: s })}>{SAISON_LABEL[s]}</button>
                ))}
              </div>
              <div className="nk-zeile">
                <label className="nk-feld">
                  <span>DOT</span>
                  <input type="text" inputMode="numeric" maxLength={5} placeholder="1224" value={e.dot} onChange={(ev) => setze(i, { dot: ev.target.value })} />
                </label>
                <label className="nk-feld">
                  <span>Profil</span>
                  <input type="text" disabled value={e.profiltiefe_mm != null ? profilMmText(e.profiltiefe_mm) : "nicht gemessen"} />
                </label>
              </div>
              <div className="nk-zeile">
                <label className="nk-feld">
                  <span>Verkauf je Stück netto *</span>
                  <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0,00" value={e.preis} onChange={(ev) => setze(i, { preis: ev.target.value })} />
                </label>
                <label className="nk-feld">
                  <span>Ankauf je Stück netto</span>
                  <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0 = geschenkt" value={e.ek} onChange={(ev) => setze(i, { ek: ev.target.value })} />
                </label>
              </div>
              {e.felge && <span className="small">Komplettrad mit {e.felge === "alu" ? "Alufelge" : "Stahlfelge"}</span>}
              {f && <span className="small vk-fehler">{f}</span>}
            </div>
          );
        })}

        {notizenText(satz) && <span className="small">Die Notiz vom Satz kommt mit an den Posten: <b>{notizenText(satz)}</b></span>}
        {fehler && <div className="hinweis-pflicht">{fehler}</div>}
        <div className="ad-knoepfe">
          <span className="ad-luecke" />
          <button type="button" className="es-knopf" onClick={onClose}>Abbrechen</button>
          <button type="button" className="es-knopf vk-speichern" disabled={laeuft} onClick={() => void uebernehmen()}>
            {laeuft ? "Übernimmt …" : "Auslagern und übernehmen"}
          </button>
        </div>
      </div>
    </div>
  );
}
