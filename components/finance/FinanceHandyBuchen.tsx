"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import { useFinLieferanten, useMeineId } from "@/lib/queries/hooks";
import { finBelegBuchen, finBelegDateiHochladen, finBelegSpeichern, finBuchen, finBuchungDateiHochladen, finLieferantAnlegen } from "@/lib/api/finance";
import { betragLesen, buchungBetrag, buchungVorschau, kontoNr, type FinBuchung, type FinKonto, type FinSteuerschluessel } from "@/lib/finance/buchung";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import { FIN_VERBINDLICHKEIT_KONTO, dateiMangel } from "@/lib/finance/belege";
import { kostAuswahl, type FinKostenstelle } from "@/lib/finance/kostenstellen";
import {
  FIN_HANDY_ZAHLWEGE, handyGegenkonto, handyMangel, handyPosten, handyText, handyZahlwege, handyZwecke, heuteGebucht, type HandyZahlweg,
} from "@/lib/finance/handybuchen";
import { bildVerkleinern } from "@/lib/belegBild";
import { formatEUR } from "@/lib/format";
import { ZeilenTabelle } from "./FinanceBuchungen";
import { KontoFeld } from "./arbeitsplatz/KontoFeld";

// Finance › Buchen am Handy (v187, docs/finance.md Abschnitt 22, Entwurf: Mockup „Am Handy: buchen“): Foto zuerst,
// Betrag, wofür (lernende Knöpfe, „Anderes …“ öffnet die Kontosuche), womit bezahlt, Transporter. Darunter steht die
// Buchung, wie Finance sie schreibt – erst „Buchen“ speichert. Die Regeln stehen in lib/finance/handybuchen.ts.
// Kein Texterkennen: Ein Dienst dafür wäre ein Dritter (Datenschutz) – Lieferant und Betrag tippt man ab.
export function FinanceHandyBuchen({ supabase, jahr, heute, einstellungen, konten, schluessel, buchungen, kostenstellen, rechte, onGebucht, onAusfuehrlich, onClose }: {
  supabase: SupabaseClient;
  jahr: number;
  heute: string;
  einstellungen: FinEinstellungen;
  konten: FinKonto[];
  schluessel: FinSteuerschluessel[];
  buchungen: FinBuchung[];
  kostenstellen: FinKostenstelle[];
  rechte: { buchen: boolean; belege: boolean };
  onGebucht: (meldung: string) => void;
  // Zum vollen Buchungsfenster mit Soll und Haben (nur mit Recht „Buchungen“ schreiben).
  onAusfuehrlich?: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const e = einstellungen;
  const rahmen = e.kontenrahmen;
  const klein = e.besteuerung === "klein";
  const zwecke = useMemo(() => handyZwecke(buchungen, konten, rahmen), [buchungen, konten, rahmen]);
  const wege = handyZahlwege(e.rechtsform, rechte);
  const ichQ = useMeineId(supabase, true);
  const heuteListe = heuteGebucht(buchungen, ichQ.data ?? null, heute);

  const [datei, setDatei] = useState<File | null>(null);
  const [bildUrl, setBildUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const [betrag, setBetrag] = useState("");
  const [zweck, setZweck] = useState<string | null>(null);
  const [anderes, setAnderes] = useState<number | null>(null);
  const [bei, setBei] = useState("");
  const [weg, setWeg] = useState<HandyZahlweg | null>(wege.length === 1 ? wege[0] : null);
  const [mitSteuer, setMitSteuer] = useState(true);
  const [kost1, setKost1] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const lieferantenQ = useFinLieferanten(supabase, weg === "offen");
  const lieferanten = (lieferantenQ.data ?? []).filter((l) => l.aktiv);

  // Die Vorschau des Fotos lebt als Objekt-URL; beim Schließen wieder freigeben.
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  function fotoWaehlen(f: File | null) {
    setFehler(null); setOk(null);
    if (f) { const m = dateiMangel(f); if (m) { setFehler(m); return; } }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
    setBildUrl(urlRef.current);
    setDatei(f);
  }

  const gewaehlt = zwecke.find((z) => z.key === zweck) ?? null;
  const konto = zweck === "anderes" ? anderes : gewaehlt?.konto ?? null;
  const kontoName = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";
  const zweckText = gewaehlt?.text ?? (konto != null ? kontoName(konto) : "");
  const betragZahl = betragLesen(betrag);
  const gegen = weg === "offen" ? FIN_VERBINDLICHKEIT_KONTO[rahmen] : weg ? handyGegenkonto(weg, rahmen) : null;
  const posten = handyPosten({ konto, gegen, betrag: betragZahl, mitSteuer, klein, kost1: weg === "offen" ? null : kost1 });
  const vorschau = konto != null && gegen != null && betragZahl ? buchungVorschau([posten], konten, schluessel, e) : null;
  const imJahr = heute.slice(0, 4) === String(jahr);
  const mangel = !imJahr ? `Am Handy wird mit dem heutigen Datum gebucht – oben das Wirtschaftsjahr ${heute.slice(0, 4)} wählen.`
    : handyMangel({ betrag: betragZahl, konto, weg, lieferant: bei }) ?? vorschau?.fehler ?? null;
  const kostListe = kostAuswahl(kostenstellen, "kost1");
  const wegHinweis = FIN_HANDY_ZAHLWEGE.find((w) => w.wert === weg)?.hinweis;

  async function buchen() {
    if (mangel || konto == null || betragZahl == null || !weg) return;
    setLaeuft(true); setFehler(null); setOk(null);
    const text = handyText(zweckText, bei);
    try {
      const bild = datei?.type.startsWith("image/");
      const blob = datei ? (bild ? (await bildVerkleinern(datei)).blob : datei) : null;
      const name = datei ? (bild ? datei.name.replace(/\.\w+$/, "") + ".jpg" : datei.name) : "";
      let meldung: string;
      if (weg === "offen") {
        // Beleg beim Lieferanten: anlegen (Entwurf), Foto daran, buchen – dann steht er in den offenen Posten.
        const name0 = bei.trim();
        const lieferant = lieferanten.find((l) => l.name.trim().toLowerCase() === name0.toLowerCase())
          ?? await finLieferantAnlegen(supabase, { name: name0, ust_id: null, konto, steuer: posten.steuer });
        const id = await finBelegSpeichern(supabase, null, { lieferant_id: lieferant.id, belegdatum: heute, belegnummer: null, text: zweckText.slice(0, 200),
          faellig_am: null, posten: [{ konto, betrag: betragZahl, steuer: posten.steuer }] });
        let fotoFehlt = false;
        if (blob) { try { await finBelegDateiHochladen(supabase, id, blob, name, null); } catch { fotoFehlt = true; } }
        try {
          const r = await finBelegBuchen(supabase, id, null, null);
          meldung = `Gebucht als Nr. ${jahr}-${r.nr} – offen beim Lieferanten ${lieferant.name}.${fotoFehlt ? " Das Foto hing nicht an." : ""}`;
        } catch (err) {
          await queryClient.invalidateQueries({ queryKey: qk.finance() });
          throw new Error(`Als Entwurf im Belegeingang gespeichert, aber nicht gebucht: ${fehlerText(err)}`);
        }
      } else {
        const r = await finBuchen(supabase, { datum: heute, text, beleg: "", posten: [posten] });
        let fotoFehlt = false;
        if (blob) { try { await finBuchungDateiHochladen(supabase, r.id, blob, name); } catch { fotoFehlt = true; } }
        meldung = `Gebucht als Nr. ${jahr}-${r.nr}.${fotoFehlt ? " Das Foto hing nicht an – in der Buchung „Belegbild anhängen“." : ""}`;
      }
      await queryClient.invalidateQueries({ queryKey: qk.finance() });
      // Bereit für den nächsten Beleg; Zahlweg und Transporter bleiben (meist derselbe Tag, derselbe Wagen).
      fotoWaehlen(null);
      setBetrag(""); setZweck(null); setAnderes(null); setBei(""); setMitSteuer(true);
      setOk(meldung);
      onGebucht(meldung);
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Blatt titel="Neue Buchung" unter={`Finance · Buchen · ${heute.split("-").reverse().join(".")}`} breite="mittel" className="fi-handy-blatt" onClose={onClose}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>Schließen</button>
        <button type="button" className="btn-primary" onClick={() => void buchen()} disabled={laeuft || !!mangel}>{laeuft ? "bucht …" : "Buchen"}</button>
      </>}>
      <div className="fi-handy">
        <div className={"fi-handy-foto" + (datei ? " da" : "")}>
          {bildUrl ? <img src={bildUrl} alt="Beleg" /> : datei ? <span className="fi-handy-datei">{datei.name}</span> : <span className="small">Noch kein Foto</span>}
          <div className="fi-handy-foto-knoepfe">
            <label className={(datei ? "btn-secondary" : "btn-primary") + " fi-knopf fi-dateiwahl"}>
              {datei ? "Neu fotografieren" : "Beleg fotografieren"}
              <input type="file" accept="image/*" capture="environment" aria-label="Beleg fotografieren"
                onChange={(ev) => { const f = ev.target.files?.[0] ?? null; ev.target.value = ""; if (f) fotoWaehlen(f); }} />
            </label>
            <label className="es-knopf fi-dateiwahl">
              Datei wählen
              <input type="file" accept="image/*,application/pdf" aria-label="Beleg als Datei wählen"
                onChange={(ev) => { const f = ev.target.files?.[0] ?? null; ev.target.value = ""; if (f) fotoWaehlen(f); }} />
            </label>
          </div>
        </div>

        <label className="nk-feld"><span>Betrag brutto</span>
          <input className="fi-handy-betrag" inputMode="decimal" value={betrag} placeholder="0,00" aria-label="Betrag brutto" autoComplete="off"
            onChange={(ev) => { setOk(null); setBetrag(ev.target.value); }} />
        </label>

        <div className="fi-feld">
          <span className="fi-label">Wofür?{zwecke.length > 5 ? " (häufig)" : ""}</span>
          <div className="fi-chips" role="radiogroup" aria-label="Wofür">
            {zwecke.map((z) => (
              <button key={z.key} type="button" role="radio" aria-checked={zweck === z.key} className={"fi-chip" + (zweck === z.key ? " an" : "")}
                onClick={() => { setOk(null); setZweck(z.key); }}>{z.text}</button>
            ))}
            <button type="button" role="radio" aria-checked={zweck === "anderes"} className={"fi-chip" + (zweck === "anderes" ? " an" : "")}
              onClick={() => { setOk(null); setZweck("anderes"); }}>Anderes …</button>
          </div>
          {zweck === "anderes" && (
            <div className="fi-handy-konto">
              <KontoFeld konten={konten.filter((k) => k.kategorie === "aufwand" || k.kategorie === "anlage")} wert={anderes} onWert={setAnderes}
                label="Konto suchen" autoFocus platzhalter="Konto: Nummer oder Name" />
            </div>
          )}
        </div>

        <label className="nk-feld"><span>{weg === "offen" ? "Lieferant" : "Bei wem? (für den Buchungstext)"}</span>
          <input value={bei} maxLength={120} list={weg === "offen" ? "fi-handy-lieferanten" : undefined} placeholder={weg === "offen" ? "Name des Lieferanten" : "z. B. Shell, Würth"}
            onChange={(ev) => setBei(ev.target.value)} />
          {weg === "offen" && <datalist id="fi-handy-lieferanten">{lieferanten.map((l) => <option key={l.id} value={l.name} />)}</datalist>}
        </label>

        <div className="fi-feld">
          <span className="fi-label">Bezahlt mit</span>
          <div className="fi-chips" role="radiogroup" aria-label="Bezahlt mit">
            {FIN_HANDY_ZAHLWEGE.filter((w) => wege.includes(w.wert)).map((w) => (
              <button key={w.wert} type="button" role="radio" aria-checked={weg === w.wert} className={"fi-chip" + (weg === w.wert ? " an" : "")}
                onClick={() => { setOk(null); setWeg(w.wert); }}>{w.text}</button>
            ))}
          </div>
          {wegHinweis && <span className="small">{wegHinweis}</span>}
        </div>

        {kostListe.length > 0 && (
          <div className="fi-feld">
            <span className="fi-label">Transporter (Kostenstelle)</span>
            <div className="fi-chips" role="radiogroup" aria-label="Transporter">
              {kostListe.map((k) => (
                <button key={k.id} type="button" role="radio" aria-checked={kost1 === k.nummer} disabled={weg === "offen"}
                  className={"fi-chip" + (kost1 === k.nummer && weg !== "offen" ? " an" : "")} onClick={() => setKost1(k.nummer)}>{k.bezeichnung || k.nummer}</button>
              ))}
              <button type="button" role="radio" aria-checked={kost1 == null} disabled={weg === "offen"} className={"fi-chip" + (kost1 == null || weg === "offen" ? " an" : "")}
                onClick={() => setKost1(null)}>keiner</button>
            </div>
            {weg === "offen" && <span className="small">Bei „Noch offen“ entsteht ein Beleg beim Lieferanten – Belege tragen noch keine Kostenstelle.</span>}
          </div>
        )}

        {!klein && (
          <label className="fi-haken-zeile">
            <input type="checkbox" checked={mitSteuer} onChange={(ev) => setMitSteuer(ev.target.checked)} /> mit 19 % Vorsteuer (steht auf dem Beleg)
          </label>
        )}

        {vorschau && !vorschau.fehler && (
          <div className="fi-handy-vorschau">
            <span className="op-gruppe-titel">SO WIRD GEBUCHT</span>
            <ZeilenTabelle zeilen={vorschau.zeilen.map((z) => ({ ...z, kost1: !z.ist_steuer && z.seite === "S" ? posten.kost1 : null }))} name={kontoName} />
            <span className="small">„{handyText(zweckText, bei)}“ · {weg === "offen" ? "als Beleg im Belegeingang, gebucht" : "erfasst im Journal"} · festgeschrieben wird am Rechner.</span>
          </div>
        )}

        {mangel && (betrag || zweck || weg) && <div className="fi-hinweis fi-info" role="status">{mangel}</div>}
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
        {ok && <div className="fi-hinweis fi-ok" role="status">{ok}</div>}

        {heuteListe.length > 0 && (
          <>
            <span className="op-gruppe-titel">HEUTE VON DIR GEBUCHT</span>
            <div className="db-karte es-karte">
              {heuteListe.slice(0, 10).map((b) => {
                const z = b.fin_buchungszeilen.find((x) => x.seite === "S" && !x.ist_steuer);
                const h = b.fin_buchungszeilen.find((x) => x.seite === "H" && !x.ist_steuer);
                return (
                  <div key={b.id} className="es-zeile statisch fi-buchung">
                    <span className="db-punkt-text"><b>{b.text}</b>
                      <span className="small">{z ? `${kontoNr(z.konto)} ${kontoName(z.konto)}` : ""}{z?.kost1 ? ` · ${kostenstellen.find((k) => k.art === "kost1" && k.nummer === z.kost1)?.bezeichnung ?? z.kost1}` : ""}{h ? ` · gegen ${kontoNr(h.konto)}` : ""}</span>
                    </span>
                    <span className="fi-betrag">{formatEUR(buchungBetrag(b))}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {onAusfuehrlich && <button type="button" className="es-knopf fi-handy-mehr" onClick={onAusfuehrlich}>Mit Soll und Haben buchen (Splitt, andere Konten) …</button>}
      </div>
    </Blatt>
  );
}
