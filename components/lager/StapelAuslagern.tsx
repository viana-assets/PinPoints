import { useState } from "react";
import type { Customer, Vehicle } from "@/lib/types";
import type { AuslagernWahl } from "./AuslagernDialog";
import { SAISON_LABEL } from "@/lib/constants";
import { formatDate, formatEUR, todayStr } from "@/lib/helpers";
import { gebuehrVorschlag, type StapelSchritt } from "@/lib/stapelAuslagern";
import { lagerplatzIdAusCode, satzIdAusCode } from "@/lib/aufkleberCode";
import { auftragsNr } from "@/lib/testkunde";
import { QrScanner } from "@/components/QrScanner";

// Stapel-Auslagern für den Saisonwechsel (Fahrplan E7, v104): die Sätze eines Tages der Reihe nach,
// in der Reihenfolge des Regals (`stapelSchritte`, lib/stapelAuslagern.ts).
//
// Je Satz: groß der Platz, darunter Kunde, Fahrzeug, Saison, Termin – und die Lagergebühr, die auf
// den Auftrag des Tages kommt (Vorschlag wie im Auslagern-Dialog, abschaltbar, Monate änderbar).
// „Ausgelagert" bucht beides in einem Zug über denselben Weg wie der Dialog
// (`auslagernAusfuehren` in app/page.tsx); „Platz scannen" tut dasselbe, wenn der Aufkleber zum Satz
// passt – das ist die Sicherung gegen den Griff ins falsche Fach.
//
// Die Liste steht beim Öffnen fest: Was ausgelagert ist, verschwindet nicht aus ihr, sondern ist
// abgehakt – sonst verrutscht beim Arbeiten die Zählung „7 von 23".
//
// Seit Migration 67 (v111) merkt „Herausgenommen" den Satz für den Auftrag des Tages vor; aus dem
// Lager geht er, wenn der Auftrag abgeschlossen wird. Wird der Termin abgesagt, liegt er also
// weiter im Regal – richtig, denn dann kommt er dorthin zurück. Was beim Öffnen schon für seinen
// Auftrag vorgemerkt ist, steht gleich als erledigt da.
export function StapelAuslagern({ datum, schritte, customers, vehicles, gebuehrArtikelId, monatspreis, auftraegeMitGebuehr, onAuslagern, onClose }: {
  datum: string;
  schritte: StapelSchritt[];
  customers: Customer[];
  vehicles: Vehicle[];
  // Der aktive Artikel „Lagergebühr" und sein heutiger Monatspreis; ohne beides wird nur ausgelagert.
  gebuehrArtikelId: string | null;
  monatspreis: number | null;
  // Aufträge, auf denen beim Öffnen schon eine Lagergebühr stand.
  auftraegeMitGebuehr: Set<string>;
  onAuslagern: (satzId: string, wahl: AuslagernWahl) => Promise<void>;
  onClose: () => void;
}) {
  const heute = todayStr();
  const [stand, setStand] = useState<Record<string, "raus" | "ueber">>(() => Object.fromEntries(
    schritte.filter((x) => !x.satz.removed_at && x.satz.entnahme_order_id === x.auftrag.id).map((x) => [x.satz.id, "raus" as const])
  ));
  const [index, setIndex] = useState(() => {
    const erster = schritte.findIndex((x) => !(!x.satz.removed_at && x.satz.entnahme_order_id === x.auftrag.id));
    return erster === -1 ? schritte.length : erster;
  });
  const [monate, setMonate] = useState<Record<string, string>>({});
  const [ohneGebuehr, setOhneGebuehr] = useState<Record<string, boolean>>({});
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [scanner, setScanner] = useState(false);

  const fertig = index >= schritte.length;
  const s = fertig ? null : schritte[index];
  const raus = Object.values(stand).filter((x) => x === "raus").length;
  const ueber = Object.values(stand).filter((x) => x === "ueber").length;

  const vorschlag = s ? gebuehrVorschlag(s.satz, heute, gebuehrArtikelId ? monatspreis : null, auftraegeMitGebuehr.has(s.auftrag.id)) : null;
  const gebuehrAn = !!s && !!vorschlag && (ohneGebuehr[s.satz.id] === undefined ? vorschlag.an : !ohneGebuehr[s.satz.id]);
  const mengeText = s ? monate[s.satz.id] ?? String(vorschlag?.monate ?? 1) : "";
  const menge = Math.max(0, parseInt(mengeText, 10) || 0);

  function weiter() {
    // Zum nächsten noch offenen. Übersprungene holt am Ende „Übersprungene noch einmal“ zurück.
    const naechster = schritte.findIndex((x, i) => i > index && !stand[x.satz.id]);
    setIndex(naechster === -1 ? schritte.length : naechster);
  }

  async function auslagern() {
    if (!s) return;
    setLaeuft(true); setFehler(null);
    try {
      await onAuslagern(s.satz.id, {
        auftragId: s.auftrag.id, neuerAuftrag: false, sofort: false,
        artikelId: gebuehrAn ? gebuehrArtikelId : null, menge: gebuehrAn ? menge : 0,
      });
      setStand((x) => ({ ...x, [s.satz.id]: "raus" }));
      weiter();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Das Vormerken hat nicht geklappt.");
    } finally {
      setLaeuft(false);
    }
  }

  function gescannt(text: string) {
    setScanner(false);
    if (!s) return;
    const platzId = lagerplatzIdAusCode(text);
    const satzId = satzIdAusCode(text);
    if (platzId === s.satz.storage_slot_id || satzId === s.satz.id) { void auslagern(); return; }
    setFehler(platzId || satzId ? "Das ist ein anderer Platz oder Satz – nicht ausgelagert." : "Das war kein Aufkleber aus dem MR Assistent.");
  }

  const kunde = s ? customers.find((c) => c.id === s.satz.customer_id) : null;
  const fz = s?.satz.vehicle_id ? vehicles.find((v) => v.id === s.satz.vehicle_id) : null;

  return (
    <div className="modal-overlay auswahl-overlay modal-stapel" onClick={(e) => { e.stopPropagation(); if (!laeuft) onClose(); }}>
      <div className="auswahl-blatt am-breit ar-blatt st-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Der Reihe nach auslagern">
        <div className="ab-griff" />
        <div className="ar-blatt-kopf">
          <div className="ab-titel">Auslagern · {formatDate(datum)}</div>
          <button type="button" className="modal-close" onClick={onClose} disabled={laeuft} aria-label="Schließen">×</button>
        </div>
        <div className="st-fortschritt" aria-label={`${raus} von ${schritte.length} herausgenommen`}>
          <span style={{ width: `${schritte.length ? ((raus + ueber) / schritte.length) * 100 : 100}%` }} />
        </div>
        <span className="small">{raus} von {schritte.length} herausgenommen{ueber ? ` · ${ueber} übersprungen` : ""} · in der Reihenfolge des Regals</span>

        {s ? (
          <>
            <div className="st-platz">
              <span className="lg-code gross">{s.platz?.code ?? "?"}</span>
              <span className="st-wo"><b>{s.lagerName}</b><span className="small">Satz {index + 1} von {schritte.length}</span></span>
            </div>
            <div className="lg-felder">
              <span className="lg-feld"><span className="lg-feld-titel">Kunde</span><span>{kunde?.name ?? "Unbekannter Kunde"}</span></span>
              <span className="lg-feld"><span className="lg-feld-titel">Fahrzeug</span><span>{fz ? [fz.license_plate, fz.make_model].filter(Boolean).join(" · ") || "ohne Kennzeichen" : "nicht zugeordnet"}</span></span>
              <span className="lg-feld"><span className="lg-feld-titel">Saison</span><span>{s.satz.saison ? SAISON_LABEL[s.satz.saison] : "offen"}{s.satz.anzahl_raeder !== 4 ? ` · ${s.satz.anzahl_raeder} Räder` : ""}</span></span>
              <span className="lg-feld"><span className="lg-feld-titel">Termin</span><span>{s.auftrag.time ? `${s.auftrag.time.slice(0, 5)} Uhr` : "ohne Uhrzeit"} · Auftrag {auftragsNr(s.auftrag.order_number)}</span></span>
            </div>

            <div className="ar-karte-feld st-gebuehr">
              {vorschlag && gebuehrArtikelId && monatspreis != null ? (
                <>
                  <label className="vl-aktiv">
                    <input type="checkbox" checked={gebuehrAn} onChange={(e) => setOhneGebuehr({ ...ohneGebuehr, [s.satz.id]: !e.target.checked })} />
                    Lagergebühr auf Auftrag {auftragsNr(s.auftrag.order_number)}
                  </label>
                  {gebuehrAn && (
                    <span className="st-menge">
                      <input type="number" min={1} max={120} value={mengeText} aria-label="Monate"
                        onChange={(e) => setMonate({ ...monate, [s.satz.id]: e.target.value })} />
                      Monate · {formatEUR(monatspreis * menge)} netto
                    </span>
                  )}
                  {vorschlag.grund && <span className="small">Nicht vorgeschlagen: {vorschlag.grund}.</span>}
                </>
              ) : (
                <span className="small">Keine Lagergebühr: {vorschlag?.grund ?? "kein Artikel „Lagergebühr“ gepflegt"}. Es wird nur ausgelagert.</span>
              )}
            </div>

            {fehler && <div className="hinweis-pflicht">{fehler}</div>}
            <div className="st-knoepfe">
              <button type="button" className="lg-knopf primaer gross" disabled={laeuft || (gebuehrAn && menge <= 0)} onClick={() => void auslagern()}>
                {laeuft ? "merkt vor …" : "Herausgenommen"}
              </button>
              <button type="button" className="lg-knopf" disabled={laeuft} onClick={() => { setFehler(null); setScanner(true); }}>Platz scannen</button>
              <button type="button" className="lg-knopf" disabled={laeuft} onClick={() => { setStand((x) => ({ ...x, [s.satz.id]: "ueber" })); setFehler(null); weiter(); }}>Überspringen</button>
            </div>
          </>
        ) : (
          <div className="db-karte">
            <div className="db-leer">
              {schritte.length === 0 ? "Für diesen Tag liegt nichts im Regal, das mitmuss." : `Fertig: ${raus} herausgenommen${ueber ? `, ${ueber} übersprungen – die liegen noch im Regal` : ""}. Aus dem Lager gehen sie, wenn ihr Auftrag abgeschlossen wird.`}
            </div>
            {ueber > 0 && (
              <button type="button" className="lg-knopf" onClick={() => {
                const erster = schritte.findIndex((x) => stand[x.satz.id] === "ueber");
                setStand((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v === "raus")));
                setIndex(erster === -1 ? 0 : erster);
              }}>Übersprungene noch einmal</button>
            )}
          </div>
        )}

        {scanner && <QrScanner titel="Platz oder Satz scannen" onErkannt={gescannt} onClose={() => setScanner(false)} />}
      </div>
    </div>
  );
}
