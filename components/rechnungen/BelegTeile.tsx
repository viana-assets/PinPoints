"use client";

import type { Rechnung } from "@/lib/types";
import { formatDate } from "@/lib/helpers";
import { mailtoRechnung } from "@/lib/rechnung";
import { Blatt } from "@/components/Blatt";

// Was das Rechnungsfenster am Auftrag (RechnungModal) und das Belegfenster unter „Rechnungen“
// (RechnungenPanel) gemeinsam haben – seit v135 (Runde 3 der Designprüfung) an EINER Stelle.
// Bis dahin standen die Knöpfe eines ausgestellten Belegs und die Storno-Rückfrage zweimal fast
// wortgleich im Code; eine Änderung an der einen Stelle hätte die andere vergessen.

// Die Knöpfe eines ausgestellten Belegs: drucken, Mail vorbereiten, stornieren.
//
// Der Mail-Knopf bereitet den Entwurf vor und verschickt nichts. Das PDF hängt der Mensch an –
// am iPhone aus der Druckvorschau über das Teilen-Symbol. Ein Knopf, der „Senden“ hieße und nur
// ein Fenster öffnet, wäre eine Behauptung. Er ist ein `a` und kein `button`: `mailto:` gehört
// dem Browser, nicht dem Programm.
export function BelegKnoepfe({ beleg, darfStornieren, laeuft, onStornoFrage }: {
  beleg: Rechnung;
  darfStornieren: boolean;
  laeuft: boolean;
  onStornoFrage: (r: Rechnung) => void;
}) {
  const mail = mailtoRechnung(beleg);
  return (
    <>
      <button type="button" className="btn-primary" onClick={() => window.print()}>
        Drucken / als PDF speichern
      </button>
      {mail && <a className="btn-secondary" href={mail}>E-Mail vorbereiten</a>}
      {beleg.art === "rechnung" && !beleg.storniert_durch && darfStornieren && (
        <button type="button" className="btn-secondary" disabled={laeuft} onClick={() => onStornoFrage(beleg)}>
          Stornieren
        </button>
      )}
    </>
  );
}

// Was über einem ausgestellten Beleg zu sagen ist – nur in der App, nie auf dem Papier.
//
// Der Stornogrund steht in der APP, nicht auf dem gedruckten Beleg: Er ist eine interne Notiz
// („Kunde hat storniert“, „falscher Kunde ausgewählt“) und geht den Empfänger nichts an.
export function BelegHinweise({ beleg, rechnungen }: { beleg: Rechnung; rechnungen: Rechnung[] }) {
  const zeilen: string[] = [];
  if (!mailtoRechnung(beleg)) zeilen.push("Für eine E-Mail fehlt die Adresse des Kunden – drucken geht.");
  if (beleg.storniert_durch) {
    zeilen.push(`Aufgehoben am ${beleg.storniert_am ? formatDate(beleg.storniert_am.slice(0, 10)) : ""} durch ${
      rechnungen.find((r) => r.id === beleg.storniert_durch)?.nummer_text ?? "eine Stornorechnung"}.`);
  }
  if (beleg.art === "storno" && beleg.storno_grund) zeilen.push(`Grund: ${beleg.storno_grund}`);
  if (zeilen.length === 0) return null;
  return <div className="re-notizen druck-weg">{zeilen.map((z) => <span key={z}>{z}</span>)}</div>;
}

// Die Rückfrage vor dem Storno. Wortgleich am Auftrag und unter „Rechnungen“ – dieselbe
// Handlung, dieselbe Erklärung; zwei Texte für dasselbe wären zwei Gelegenheiten, es
// unterschiedlich zu verstehen.
//
// Der Grund ist Pflicht. Beim Auftrag ist der Stornogrund seit Migration 20 Pflicht – bei der
// Rechnung war er es bis Migration 54 nicht, und ausgerechnet der Beleg, der einen anderen
// aufhebt, stand ohne Begründung da. Ebene 10004 (`modal-storno`), über dem Rechnungsfenster.
export function StornoBlatt({ rechnung, grund, onGrund, laeuft, onStornieren, onAbbrechen }: {
  rechnung: Rechnung;
  grund: string;
  onGrund: (g: string) => void;
  laeuft: boolean;
  onStornieren: () => void;
  onAbbrechen: () => void;
}) {
  return (
    <Blatt titel={`Rechnung ${rechnung.nummer_text} stornieren?`} ebene="modal-storno" breite="mittel" onClose={onAbbrechen}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onAbbrechen}>Abbrechen</button>
        <button type="button" className="btn-primary" disabled={laeuft || !grund.trim()} onClick={onStornieren}>
          Stornorechnung erzeugen
        </button>
      </>}>
      <p className="bl-hilfe">
        Die Rechnung bleibt stehen und bekommt eine Stornorechnung mit eigener Nummer daneben – so
        verlangt es der lückenlose Nummernkreis. Gelöscht wird nichts. Danach lässt sich für diesen
        Auftrag eine neue Rechnung ausstellen.
      </p>
      <label className="nk-feld">
        <span>Grund der Stornierung *</span>
        <textarea rows={3} value={grund} autoFocus onChange={(e) => onGrund(e.target.value)}
          placeholder="z. B. falscher Kunde ausgewählt, Leistung nicht erbracht, Preis falsch" />
      </label>
    </Blatt>
  );
}
