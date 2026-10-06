"use client";

import { useState } from "react";
import type { RadPosition, TireStorage } from "@/lib/types";
import { RAD_NOTIZ_MAX, RAD_NOTIZ_SPALTE, RAD_POSITION_LABEL } from "@/lib/constants";
import { notizAenderungen, radNotizen, satzPositionen, type SatzNotizFeld, type SatzNotizen } from "@/lib/lagerNotizen";

// Notizen am eingelagerten Satz (Migration 71, v115): eine zum ganzen Satz und eine je Rad.
// Anlass: In einem Reifen steckte beim Einlagern eine Schraube – das soll am REIFEN stehen.
//
// Zwei Fassungen:
//   - `ReifenNotizenFelder` gesteuert, für Fenster mit Speichern-Knopf (Lager › Bearbeiten). Dort
//     darf nichts von selbst speichern (CLAUDE.md 4, „Umschalter in einem Fenster mit Speichern“).
//   - `ReifenNotizenAmSatz` speichert beim Verlassen eines Feldes, wie Fahrzeug, Saison und
//     Profiltiefe im Auftrag auch.
// Die Notizen je Rad sind zugeklappt, solange keine da ist – die meisten Sätze haben keine.

function Felder({ werte, positionen, gesperrt, onAendern, onFertig, satzLabel }: {
  werte: SatzNotizen;
  positionen: RadPosition[];
  gesperrt?: boolean;
  onAendern: (feld: SatzNotizFeld, wert: string) => void;
  onFertig?: () => void;
  satzLabel: string;
}) {
  const offenAnfangs = positionen.some((p) => (werte[RAD_NOTIZ_SPALTE[p]] ?? "").trim() !== "");
  const [radOffen, setRadOffen] = useState(offenAnfangs);
  return (
    <div className="rn-block">
      <label className="nk-feld">
        <span>{satzLabel}</span>
        <textarea rows={2} value={werte.note ?? ""} disabled={gesperrt} maxLength={2000} aria-label={satzLabel}
          placeholder="z. B. Kunde möchte vor dem Wechsel angerufen werden"
          onChange={(e) => onAendern("note", e.target.value)} onBlur={onFertig} />
      </label>
      {radOffen ? (
        <div className="rn-raster" role="group" aria-label="Notiz je Rad">
          {positionen.map((p, i) => (
            <label key={p} className="nk-feld">
              <span title={RAD_POSITION_LABEL[p]}>Notiz {p}</span>
              <input type="text" value={werte[RAD_NOTIZ_SPALTE[p]] ?? ""} disabled={gesperrt} maxLength={RAD_NOTIZ_MAX}
                placeholder={i === 0 ? "z. B. Schraube in der Lauffläche" : ""}
                aria-label={`Notiz ${RAD_POSITION_LABEL[p]}`}
                onChange={(e) => onAendern(RAD_NOTIZ_SPALTE[p], e.target.value)} onBlur={onFertig} />
            </label>
          ))}
        </div>
      ) : (
        <button type="button" className="lg-link" disabled={gesperrt} onClick={() => setRadOffen(true)}>
          + Notiz zu einem Rad
        </button>
      )}
    </div>
  );
}

// Gesteuert – der Aufrufer hält die Werte und speichert selbst.
export function ReifenNotizenFelder({ werte, anzahlRaeder, gesperrt, onAendern }: {
  werte: SatzNotizen;
  anzahlRaeder: number;
  gesperrt?: boolean;
  onAendern: (feld: SatzNotizFeld, wert: string) => void;
}) {
  return <Felder werte={werte} positionen={satzPositionen({ anzahl_raeder: anzahlRaeder })} gesperrt={gesperrt} onAendern={onAendern} satzLabel="Notiz zum Satz (optional)" />;
}

// Am Satz im Auftrag: speichert, sobald ein Feld verlassen wird und sich etwas geändert hat.
export function ReifenNotizenAmSatz({ satz, gesperrt, onSpeichern }: {
  satz: TireStorage;
  gesperrt?: boolean;
  onSpeichern: (felder: SatzNotizen) => Promise<void>;
}) {
  const ausSatz = (): SatzNotizen => ({
    note: satz.note ?? "", notiz_vl: satz.notiz_vl ?? "", notiz_vr: satz.notiz_vr ?? "",
    notiz_hl: satz.notiz_hl ?? "", notiz_hr: satz.notiz_hr ?? "",
  });
  const [werte, setWerte] = useState<SatzNotizen>(ausSatz);
  const [fehler, setFehler] = useState<string | null>(null);

  async function fertig() {
    const aenderung = notizAenderungen(ausSatz(), werte);
    if (!aenderung) return;
    setFehler(null);
    try { await onSpeichern(aenderung); }
    catch (e) { setFehler(e instanceof Error ? e.message : "Die Notiz konnte nicht gespeichert werden."); }
  }

  return (
    <>
      <Felder werte={werte} positionen={satzPositionen(satz)} gesperrt={gesperrt}
        onAendern={(feld, wert) => setWerte((w) => ({ ...w, [feld]: wert }))} onFertig={() => void fertig()}
        satzLabel="Notiz zum Satz" />
      {fehler && <div className="hinweis-pflicht">{fehler}</div>}
    </>
  );
}

// Nur lesen: Satznotiz und Notizen je Rad untereinander – im Platz-Blatt, am Auftrag, beim Kunden.
export function ReifenNotizenAnzeige({ satz, klein = false }: {
  satz: Pick<TireStorage, "note" | "notiz_vl" | "notiz_vr" | "notiz_hl" | "notiz_hr">;
  klein?: boolean;
}) {
  const rad = radNotizen(satz);
  const satzNotiz = (satz.note ?? "").trim();
  if (!satzNotiz && rad.length === 0) return null;
  return (
    // Als <span>: Die Anzeige steht auch in Zeilen, die selbst Knöpfe oder <span> sind.
    <span className={"lg-notiz rn-anzeige" + (klein ? " klein" : "")}>
      {rad.map((n) => (
        <span key={n.position}><b title={RAD_POSITION_LABEL[n.position]}>{n.position}</b> {n.text}</span>
      ))}
      {satzNotiz && <span>{satzNotiz}</span>}
    </span>
  );
}
