"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BestellFuer, Bestellwunsch, Customer, Firmenfahrzeug, Order } from "@/lib/types";
import { aehnlicheWuensche, bestellVorschlaege, BESTELL_GRENZEN, BESTELL_STATUS_LABEL } from "@/lib/bestellung";
import { bestellFotoHochladen, bestellFotoVerwerfen, bestellwunschAendern, bestellwunschAnlegen } from "@/lib/api/bestellungen";
import { bildVerkleinern } from "@/lib/belegBild";
import { anzeigeName } from "@/lib/kundenAnsicht";
import { auftragsNr } from "@/lib/testkunde";
import { formatDate } from "@/lib/helpers";
import { Blatt } from "@/components/Blatt";
import { CustomerPicker } from "@/components/CustomerPicker";

// „Was fehlt?“ (Migration 104, v173, Mockup_Bestellliste_v1): eintragen in zehn Sekunden. Pflicht ist nur der
// Text – Freitext, weil es oft Dinge sind, die in keinem Katalog stehen. Beim Tippen schlägt das Blatt frühere
// Einträge vor und warnt, wenn dasselbe schon offen ist („+1“ statt doppelt). Aus dem Auftrag heraus geöffnet,
// sind Kunde und Auftrag schon eingetragen. Dasselbe Blatt ändert einen eigenen, noch offenen Eintrag.
//
// Ebene `modal-bestaetigung` (10002): Es öffnet sich auch über dem Auftragsfenster (10001), CLAUDE.md §4.
export function BestellBlatt(p: {
  supabase: SupabaseClient;
  ich: string;
  wuensche: Bestellwunsch[];
  transporter: Firmenfahrzeug[];
  kunden: Customer[];
  orders: Order[];
  vorbelegung?: { kundeId?: string | null; auftragId?: string | null };
  bearbeite?: Bestellwunsch | null;
  onPlus: (id: string) => Promise<void>;
  onFertig: (meldung: string) => void;
  onClose: () => void;
}) {
  const alt = p.bearbeite ?? null;
  const [text, setText] = useState(alt?.text ?? "");
  const [menge, setMenge] = useState(alt?.menge ?? "");
  const [dringend, setDringend] = useState(alt?.dringend ?? false);
  const aktiveTransporter = p.transporter.filter((t) => t.aktiv || t.id === alt?.firmenfahrzeug_id);
  const [fuer, setFuer] = useState<BestellFuer>(alt?.fuer ?? (aktiveTransporter.length ? "transporter" : "allgemein"));
  const [fahrzeug, setFahrzeug] = useState<string | null>(alt?.firmenfahrzeug_id ?? aktiveTransporter[0]?.id ?? null);
  const [kundeId, setKundeId] = useState<string>(alt?.kunde_id ?? p.vorbelegung?.kundeId ?? "");
  const [auftragId, setAuftragId] = useState<string>(alt?.auftrag_id ?? p.vorbelegung?.auftragId ?? "");
  const [kundeZeigen, setKundeZeigen] = useState(!!(alt?.kunde_id || p.vorbelegung?.kundeId));
  const [foto, setFoto] = useState<{ blob: Blob; breite: number; hoehe: number; url: string } | null>(null);
  const [fotoWeg, setFotoWeg] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const dateiRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto.url); }, [foto]);

  const aehnlich = useMemo(() => aehnlicheWuensche(text, p.wuensche, alt?.id), [text, p.wuensche, alt?.id]);
  const vorschlaege = useMemo(() => (alt ? [] : bestellVorschlaege(text, p.wuensche)), [text, p.wuensche, alt]);
  const kunde = p.kunden.find((k) => k.id === kundeId) ?? null;
  // Aufträge des gewählten Kunden: offene und die der letzten 30 Tage, neueste zuerst.
  const [grenze] = useState(() => new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const auftraege = kundeId
    ? p.orders.filter((o) => o.customer_id === kundeId && !o.deleted_at && (o.status === "offen" || o.status === "in_arbeit" || o.order_date >= grenze || o.id === auftragId))
      .sort((a, b) => b.order_date.localeCompare(a.order_date))
    : [];

  async function fotoGewaehlt(datei: File | undefined) {
    if (!datei) return;
    setFehler(null);
    try {
      const klein = await bildVerkleinern(datei);
      setFoto({ ...klein, url: URL.createObjectURL(klein.blob) });
      setFotoWeg(false);
    } catch {
      setFehler("Das Foto ließ sich nicht lesen.");
    } finally {
      if (dateiRef.current) dateiRef.current.value = "";
    }
  }

  async function speichern() {
    const t = text.trim();
    if (!t) { setFehler("Bitte eintragen, was gebraucht wird."); return; }
    if (t.length > BESTELL_GRENZEN.text) { setFehler(`Höchstens ${BESTELL_GRENZEN.text} Zeichen.`); return; }
    if (menge.trim().length > BESTELL_GRENZEN.menge) { setFehler(`Menge höchstens ${BESTELL_GRENZEN.menge} Zeichen.`); return; }
    setLaeuft(true);
    setFehler(null);
    let hochgeladen: { pfad: string; breite: number; hoehe: number } | null = null;
    try {
      if (foto) hochgeladen = await bestellFotoHochladen(p.supabase, p.ich, foto.blob, { breite: foto.breite, hoehe: foto.hoehe });
      const felder = {
        text: t,
        menge: menge.trim() || null,
        dringend,
        fuer,
        firmenfahrzeug_id: fuer === "transporter" ? fahrzeug : null,
        kunde_id: kundeId || null,
        auftrag_id: kundeId && auftragId ? auftragId : null,
        ...(hochgeladen ? { foto_pfad: hochgeladen.pfad, foto_breite: hochgeladen.breite, foto_hoehe: hochgeladen.hoehe }
          : fotoWeg ? { foto_pfad: null, foto_breite: null, foto_hoehe: null } : {}),
      };
      if (alt) await bestellwunschAendern(p.supabase, alt.id, felder);
      else await bestellwunschAnlegen(p.supabase, felder);
      // Das alte Foto erst weg, wenn der Eintrag sicher auf das neue zeigt.
      if (alt?.foto_pfad && (hochgeladen || fotoWeg)) await bestellFotoVerwerfen(p.supabase, alt.foto_pfad);
      p.onFertig(alt ? "Geändert." : dringend ? "Eingetragen – das Büro bekommt eine Push-Meldung." : "Eingetragen – steht auf der Bestellliste.");
    } catch (e) {
      if (hochgeladen) await bestellFotoVerwerfen(p.supabase, hochgeladen.pfad);
      setFehler(e instanceof Error ? e.message : String(e));
      setLaeuft(false);
    }
  }

  async function plus(id: string) {
    setLaeuft(true);
    try {
      await p.onPlus(id);
      p.onFertig("„Brauche ich auch“ vermerkt – kein doppelter Eintrag.");
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
      setLaeuft(false);
    }
  }

  const altesFoto = alt?.foto_pfad && !fotoWeg && !foto;

  return (
    <Blatt titel={alt ? "Bestellwunsch ändern" : "Was fehlt?"} unter={alt ? undefined : "Frei eintragen – das Büro kümmert sich."}
      breite="mittel" ebene="modal-bestaetigung" className="bw-blatt" onClose={() => { if (!laeuft) p.onClose(); }}
      fuss={<button type="button" className="am-knopf" disabled={laeuft || !text.trim()} onClick={() => void speichern()}>
        {laeuft ? "speichert …" : alt ? "Änderung speichern" : "Auf die Bestellliste"}</button>}>
      <label className="nk-feld"><span>Was wird gebraucht? *</span>
        <textarea rows={3} value={text} maxLength={BESTELL_GRENZEN.text} autoFocus={!alt}
          placeholder="z. B. Schlagschrauber-Nuss 17 mm, lang" onChange={(e) => setText(e.target.value)} />
      </label>
      {vorschlaege.length > 0 && (
        <div className="bw-vorschlaege" aria-label="Frühere Einträge">
          {vorschlaege.map((v) => <button key={v} type="button" onClick={() => setText(v)}>{v}</button>)}
        </div>
      )}
      {aehnlich.length > 0 && (
        <div className="bw-aehnlich" role="status">
          {aehnlich.map((x) => {
            const schon = x.erstellt_von === p.ich || x.plus.includes(p.ich);
            return (
              <div key={x.id} className="bw-aehnlich-zeile">
                <span><b>Schon {BESTELL_STATUS_LABEL[x.status].toLowerCase()}:</b> „{x.text}“{x.menge ? ` (${x.menge})` : ""} · {formatDate(x.created_at.slice(0, 10))}</span>
                {!alt && !schon && <button type="button" className="es-knopf" disabled={laeuft} onClick={() => void plus(x.id)}>+1 – brauche ich auch</button>}
                {schon && <span className="small">steht schon bei dir</span>}
              </div>
            );
          })}
        </div>
      )}
      <div className="nk-zeile">
        <label className="nk-feld"><span>Menge</span>
          <input type="text" value={menge} maxLength={BESTELL_GRENZEN.menge} placeholder="z. B. 2 Stück" onChange={(e) => setMenge(e.target.value)} />
        </label>
        <div className="nk-feld"><span>Wie eilig?</span>
          <div className="lg-lagerwahl bw-segment" role="group" aria-label="Wie eilig?">
            <button type="button" className={!dringend ? "aktiv" : ""} aria-pressed={!dringend} onClick={() => setDringend(false)}>Normal</button>
            <button type="button" className={dringend ? "aktiv bw-dringend" : ""} aria-pressed={dringend} onClick={() => setDringend(true)}>Dringend</button>
          </div>
        </div>
      </div>
      <div className="nk-feld"><span>Für</span>
        <div className="pl-filter bw-fuer" role="group" aria-label="Für">
          {aktiveTransporter.map((t) => (
            <button key={t.id} type="button" className={"pl-pille" + (fuer === "transporter" && fahrzeug === t.id ? " aktiv" : "")}
              onClick={() => { setFuer("transporter"); setFahrzeug(t.id); }}>{t.bezeichnung?.trim() || t.kennzeichen}</button>
          ))}
          <button type="button" className={"pl-pille" + (fuer === "lager" ? " aktiv" : "")} onClick={() => setFuer("lager")}>Lager</button>
          <button type="button" className={"pl-pille" + (fuer === "allgemein" ? " aktiv" : "")} onClick={() => setFuer("allgemein")}>allgemein</button>
        </div>
      </div>
      {!kundeZeigen ? (
        <button type="button" className="bw-link" onClick={() => setKundeZeigen(true)}>+ Kunde / Auftrag zuordnen (freiwillig)</button>
      ) : (
        <div className="bw-kunde">
          <CustomerPicker customers={p.kunden} value={kundeId} label="Kunde (freiwillig)"
            onChange={(id) => { setKundeId(id); setAuftragId(""); }} />
          {kunde && (
            <>
              <label className="nk-feld"><span>Auftrag (freiwillig)</span>
                <select value={auftragId} onChange={(e) => setAuftragId(e.target.value)}>
                  <option value="">– ohne Auftrag –</option>
                  {auftraege.map((o) => (
                    <option key={o.id} value={o.id}>#{auftragsNr(o.order_number)} · {formatDate(o.order_date)}{o.time ? ` ${o.time.slice(0, 5)}` : ""} · {o.title}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="bw-link" onClick={() => { setKundeId(""); setAuftragId(""); }}>Ohne Kunde ({anzeigeName(kunde)} entfernen)</button>
            </>
          )}
        </div>
      )}
      <div className="nk-feld"><span>Foto (freiwillig)</span>
        <input ref={dateiRef} type="file" accept="image/*" hidden aria-label="Foto auswählen" onChange={(e) => void fotoGewaehlt(e.target.files?.[0])} />
        {foto ? (
          <div className="bw-foto-vorschau">
            <img src={foto.url} alt="Foto zur Bestellung" />
            <button type="button" className="es-knopf" onClick={() => setFoto(null)}>Anderes / keins</button>
          </div>
        ) : (
          <div className="bw-foto-knoepfe">
            <button type="button" className="bw-foto" onClick={() => dateiRef.current?.click()}>📷 Foto vom Teil oder Etikett</button>
            {altesFoto && <button type="button" className="es-knopf" onClick={() => setFotoWeg(true)}>Bisheriges Foto entfernen</button>}
            {alt?.foto_pfad && fotoWeg && <span className="small">Foto wird beim Speichern entfernt.</span>}
          </div>
        )}
      </div>
      {fehler && <div className="hinweis-pflicht" role="alert">{fehler}</div>}
    </Blatt>
  );
}
