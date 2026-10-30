"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useBetrieb, useFinBelege, useFinBuchungen, useFinPruefung, useFinRechnungen, useFinUst, useFinZahlauftraege } from "@/lib/queries/hooks";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import { pruefPunkte } from "@/lib/finance/pruefung";
import { rechnungenZuErledigen, FIN_RECHNUNG_KONTEN } from "@/lib/finance/rechnungen";
import { kassenbuch } from "@/lib/finance/bank";
import { ustZuErledigen } from "@/lib/finance/steuern";
import { auftragZustand } from "@/lib/finance/zahlungen";
import { formatEUR } from "@/lib/format";
import type { FinanceAnsicht } from "./FinanceBereich";
import { BerichtDruck } from "./BerichtDruck";

export type PruefRechte = { rechnungen: boolean; belege: boolean; buchen: boolean; steuern: boolean; zahlungen: boolean };

// Finance › Jahresabschluss › Prüfung (Stufe H, Migration 116, v186): die Prüfliste vor Monats- und Jahresabschluss.
// Was die Datenbank prüft (Nummernlücken, Buchungen ohne Beleg, Personenkonten, offene Bankumsätze, alte Entwürfe,
// Festschreibung), dazu was die App weiß (Rechnungen ungebucht, Kasse, Zahlaufträge, Voranmeldungen) – je Punkt mit
// Sprung dorthin, wo er erledigt wird. Nur lesend.
export function FinancePruefung({ supabase, jahr, heute, e, rechte, onSeite }: {
  supabase: SupabaseClient; jahr: number; heute: string; e: FinEinstellungen; rechte: PruefRechte; onSeite: (s: FinanceAnsicht) => void;
}) {
  const pruefQ = useFinPruefung(supabase, jahr, true);
  const rechnungenQ = useFinRechnungen(supabase, jahr, rechte.rechnungen);
  const buchungenQ = useFinBuchungen(supabase, jahr, rechte.buchen);
  const auftraegeQ = useFinZahlauftraege(supabase, rechte.zahlungen && rechte.belege);
  const belegeQ = useFinBelege(supabase, jahr, rechte.zahlungen && rechte.belege);
  const ustQ = useFinUst(supabase, jahr, rechte.steuern);
  const betrieb = useBetrieb(supabase, true).data;
  const [druck, setDruck] = useState(false);

  if (pruefQ.isError) return <div className="fi-hinweis fi-info">Die Prüfliste gibt es ab Migration 116 – im Supabase-SQL-Editor ausführen.</div>;
  if (!pruefQ.data) return <div className="db-karte es-karte"><span className="small">Lädt …</span></div>;
  const p = pruefQ.data;
  const punkte = pruefPunkte(p, {
    rechnungenUngebucht: rechte.rechnungen && rechnungenQ.data ? rechnungenZuErledigen(rechnungenQ.data, heute).nichtGebucht : null,
    kasseNegativ: rechte.buchen && buchungenQ.data ? kassenbuch(buchungenQ.data, FIN_RECHNUNG_KONTEN[e.kontenrahmen].kasse).negativAm != null : null,
    zahlauftraegeOffen: auftraegeQ.data && belegeQ.data
      ? auftraegeQ.data.filter((a) => { const z = auftragZustand(a, belegeQ.data ?? []); return z === "offen" || z === "teilweise"; }).length : null,
    ustOffen: rechte.steuern && ustQ.data ? (() => { const u = ustZuErledigen(ustQ.data, e, heute); return u.ueberfaellig + u.geaendert; })() : null,
  });
  const offen = punkte.filter((x) => !x.ok).length;

  return (
    <>
      <div className={"fi-hinweis " + (offen ? "fi-warn" : "fi-ok")} role="status">
        {offen ? `${offen === 1 ? "1 Punkt" : `${offen} Punkte`} offen – vor dem Festschreiben bzw. vor der Übergabe an die Kanzlei klären.` : "Alles geprüft – nichts offen."}
      </div>
      <div className="fi-werkzeug"><button type="button" className="btn-secondary fi-knopf" onClick={() => setDruck(true)}>Drucken</button></div>
      <div className="db-karte es-karte">
        {punkte.map((x) => (
          <div key={x.key} className="es-zeile statisch fi-buchung">
            <span className={"fi-schritt" + (x.ok ? " fertig" : " fi-schritt-warn")} aria-label={x.ok ? "in Ordnung" : "offen"}>{x.ok ? "✓" : x.anzahl}</span>
            <span className="db-punkt-text"><b>{x.text}</b><span className="small">{x.hinweis}</span></span>
            {!x.ok && x.seite && <button type="button" className="es-knopf" onClick={() => onSeite(x.seite!)}>Öffnen</button>}
          </div>
        ))}
      </div>
      {p.ohne_beleg.length > 0 && (
        <>
          <span className="op-gruppe-titel">BUCHUNGEN OHNE BELEG{p.ohne_beleg_zahl > p.ohne_beleg.length ? ` (die ersten ${p.ohne_beleg.length} von ${p.ohne_beleg_zahl})` : ""}</span>
          <div className="db-karte es-karte">
            {p.ohne_beleg.map((b) => (
              <div key={b.id} className="es-zeile statisch fi-buchung">
                <span className="fi-nr">{b.nr}</span>
                <span className="db-punkt-text"><b>{b.text}</b><span className="small">{datumKurz(b.datum)}</span></span>
                <span className="fi-betrag">{formatEUR(b.betrag)}</span>
              </div>
            ))}
          </div>
          <span className="small es-fuss fi-fuss">Unter Buchungen die Buchung öffnen und „Belegbild anhängen“ – oder beim Erfassen eine Belegnummer eintragen.</span>
        </>
      )}
      {druck && (
        <BerichtDruck titel={`Prüfliste ${jahr}`} unter="Vollständigkeit und Abstimmung" kopf={["Punkt", "Stand", "Hinweis"]}
          zeilen={[...punkte.map((x) => ({ zellen: [x.text, x.ok ? "in Ordnung" : `offen (${x.anzahl})`, x.hinweis] })),
            ...p.ohne_beleg.map((b) => ({ zellen: [`Ohne Beleg: Nr. ${b.nr} vom ${datumKurz(b.datum)}`, b.betrag, b.text], art: "leise" as const }))]}
          firma={betrieb?.firma?.trim() || betrieb?.inhaber?.trim() || ""} stand={datumKurz(heute)} onClose={() => setDruck(false)} />
      )}
    </>
  );
}

function datumKurz(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}
