import { useRef, useState } from "react";
import { unterschriftSatz } from "@/lib/belege";
import { formatDate } from "@/lib/helpers";

// Der Kunde unterschreibt auf dem Handy (Fahrplan E3, Migration 65, v105).
//
// Gezeichnet wird mit dem Finger auf einer Fläche. Gespeichert wird EIN Bild, in das der Satz
// („Arbeiten zu Auftrag … ausgeführt, Fahrzeug übernommen."), die Unterschrift, der Name und das
// Datum zusammen gezeichnet sind – eine Unterschrift ohne den Satz, unter den sie gesetzt wurde,
// belegt nichts. Der Name steht zusätzlich in `beschriftung`, damit Auftrag und Auskunft ihn
// nennen können, ohne das Bild zu laden.
//
// Bewusst kein Zwang: Der Auftrag lässt sich auch ohne Unterschrift abschließen (der Kunde ist
// nicht da, der Wagen stand in der Firmenhalle). Der Fuß des Auftragsfensters erinnert daran.

const BREITE = 900;
const HOEHE = 320;

export function UnterschriftBlatt({ auftragsNr, datum, vorschlagName, onSpeichern, onClose }: {
  auftragsNr: string;
  // Der Tag des Auftrags – das Datum des Termins, nicht das der Erfassung.
  datum: string;
  vorschlagName: string;
  onSpeichern: (bild: Blob, masse: { breite: number; hoehe: number }, name: string) => Promise<void>;
  onClose: () => void;
}) {
  const flaeche = useRef<HTMLCanvasElement>(null);
  const zeichnet = useRef(false);
  const letzter = useRef<{ x: number; y: number } | null>(null);
  const [striche, setStriche] = useState(0);
  const [name, setName] = useState(vorschlagName);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const satz = unterschriftSatz(auftragsNr, datum);

  function punkt(e: React.PointerEvent<HTMLCanvasElement>) {
    // Die Fläche ist in CSS-Pixeln schmaler als ihr Raster – auf das Raster umrechnen. Gegen das
    // Element selbst gemessen (getBoundingClientRect), nicht über offsetX: Das misst gegen das
    // getroffene Element, und der Zoom am großen Monitor (html{zoom}) kommt so mit heraus.
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * BREITE, y: ((e.clientY - r.top) / r.height) * HOEHE };
  }
  function stift(): CanvasRenderingContext2D | null {
    const ctx = flaeche.current?.getContext("2d") ?? null;
    if (ctx) { ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#14213d"; }
    return ctx;
  }
  function runter(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    // Ohne Zeigerfang (ältere Browser, Testumgebung) bricht der Strich am Rand ab – mehr nicht.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    zeichnet.current = true;
    const p = punkt(e);
    letzter.current = p;
    const ctx = stift();
    if (ctx) { ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fillStyle = "#14213d"; ctx.fill(); }
  }
  function bewegen(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!zeichnet.current || !letzter.current) return;
    const p = punkt(e);
    const ctx = stift();
    if (ctx) { ctx.beginPath(); ctx.moveTo(letzter.current.x, letzter.current.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    letzter.current = p;
  }
  function hoch() {
    if (zeichnet.current) setStriche((n) => n + 1);
    zeichnet.current = false;
    letzter.current = null;
  }
  function leeren() {
    const c = flaeche.current;
    c?.getContext("2d")?.clearRect(0, 0, BREITE, HOEHE);
    setStriche(0);
  }

  async function speichern() {
    const c = flaeche.current;
    if (!c || striche === 0 || !name.trim()) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setFehler("Keine Verbindung – die Unterschrift geht nur mit Netz. Bitte nicht schließen: Sobald wieder Netz da ist, hier noch einmal „Speichern“ tippen.");
      return;
    }
    setLaeuft(true);
    setFehler(null);
    try {
      // Das Belegbild: weißer Grund, oben der Satz, darunter die Unterschrift, eine Linie, Name und Datum.
      const rand = 30;
      const breite = BREITE + 2 * rand;
      const hoehe = HOEHE + 150;
      const bild = document.createElement("canvas");
      bild.width = breite;
      bild.height = hoehe;
      const ctx = bild.getContext("2d");
      if (!ctx) throw new Error("Die Unterschrift konnte nicht verarbeitet werden.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, breite, hoehe);
      ctx.fillStyle = "#14213d";
      ctx.font = "26px sans-serif";
      ctx.fillText(satz, rand, 44, breite - 2 * rand);
      ctx.drawImage(c, rand, 60);
      ctx.strokeStyle = "#6b7280";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rand, 60 + HOEHE - 30);
      ctx.lineTo(breite - rand, 60 + HOEHE - 30);
      ctx.stroke();
      ctx.font = "bold 28px sans-serif";
      ctx.fillText(name.trim(), rand, 60 + HOEHE + 14, breite - 2 * rand - 260);
      ctx.font = "26px sans-serif";
      const stempel = `${formatDate(new Date().toISOString().slice(0, 10))} ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
      ctx.textAlign = "right";
      ctx.fillText(stempel, breite - rand, 60 + HOEHE + 14);
      const blob = await new Promise<Blob | null>((ok) => bild.toBlob(ok, "image/png"));
      if (!blob) throw new Error("Die Unterschrift konnte nicht verarbeitet werden.");
      await onSpeichern(blob, { breite, hoehe }, name.trim());
      onClose();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Die Unterschrift konnte nicht gespeichert werden.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="modal-overlay auswahl-overlay modal-foto" onClick={(e) => { e.stopPropagation(); if (!laeuft && striche === 0) onClose(); }}>
      <div className="auswahl-blatt am-breit ar-blatt us-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Unterschrift des Kunden">
        <div className="ab-griff" />
        <div className="ar-blatt-kopf">
          <div className="ab-titel">Unterschrift des Kunden</div>
          <button type="button" className="modal-close" onClick={onClose} disabled={laeuft} aria-label="Schließen">×</button>
        </div>
        <span className="us-satz">{satz}</span>
        <canvas
          ref={flaeche} className="us-flaeche" width={BREITE} height={HOEHE}
          aria-label="Hier mit dem Finger unterschreiben"
          onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch} onPointerLeave={hoch}
        />
        <div className="us-zeile">
          <span className="small">{striche === 0 ? "Hier mit dem Finger unterschreiben." : "Unterschrieben – zum Neuanfang „Leeren“."}</span>
          <button type="button" className="am-mini" onClick={leeren} disabled={laeuft || striche === 0}>Leeren</button>
        </div>
        <label className="nk-feld"><span>Name in Druckbuchstaben</span>
          <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </label>
        {fehler && <div className="hinweis-pflicht">{fehler}</div>}
        <button type="button" className="am-knopf gruen" disabled={laeuft || striche === 0 || !name.trim()} onClick={() => void speichern()}>
          {laeuft ? "speichert …" : "Unterschrift speichern"}
        </button>
      </div>
    </div>
  );
}
