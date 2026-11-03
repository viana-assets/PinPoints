"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { AdressFeld } from "@/components/AdressFeld";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import type { Ansprechpartner, Customer, Vehicle } from "@/lib/types";
import { apAnzeige, apMaengel, hatEigeneAdresse, type ApEntwurf } from "@/lib/ansprechpartner";
import { ansprechpartnerAendern, ansprechpartnerAnlegen, ansprechpartnerKarte, ansprechpartnerLoeschen, fahrzeugAnsprechpartner, kundeAufKarte } from "@/lib/api/ansprechpartner";

// Ansprechpartner im Kundenfenster (Migration 117, v189, docs/kunden-und-karte.md „Ansprechpartner und Wechselort“):
// unter jedem Kunden beliebig viele, je mit eigener Adresse (freiwillig) und dem Schalter „Auf der Karte“. Dazu der
// Schalter für die Adresse des Kunden selbst – aus = nur Rechnungsadresse. Welche Fahrzeuge bei wem stehen, wird im
// Fenster des Ansprechpartners angehakt.
export function AnsprechpartnerKarte({ supabase, kunde, aps, fahrzeuge, darfSchreiben, darfLoeschen, fehlt, onFahrzeugeGeaendert }: {
  supabase: SupabaseClient;
  kunde: Customer;
  aps: Ansprechpartner[];
  // Die Fahrzeuge dieses Kunden.
  fahrzeuge: Vehicle[];
  darfSchreiben: boolean;
  darfLoeschen: boolean;
  // Migration 117 fehlt (die Abfrage scheitert).
  fehlt?: boolean;
  onFahrzeugeGeaendert?: () => Promise<void> | void;
}) {
  const queryClient = useQueryClient();
  const [blatt, setBlatt] = useState<Ansprechpartner | "neu" | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  if (kunde.laufkundschaft) return null;
  if (fehlt) {
    return darfSchreiben ? (
      <div className="db-karte dm-ap"><div className="db-karte-kopf"><span className="db-karte-titel">Ansprechpartner</span></div>
        <span className="small">Ansprechpartner gibt es ab Migration 117 – im Supabase-SQL-Editor ausführen.</span></div>
    ) : null;
  }
  const kundeNadel = kunde.auf_karte !== false;
  const istFirma = !!(kunde.company || "").trim();
  if (!aps.length && !darfSchreiben) return null;

  async function kundeNadelSetzen(an: boolean) {
    setLaeuft(true); setFehler(null);
    try { await kundeAufKarte(supabase, kunde.id, an); await queryClient.invalidateQueries({ queryKey: qk.kunden() }); }
    catch (e) { setFehler(fehlerText(e)); }
    finally { setLaeuft(false); }
  }
  async function apNadelSetzen(a: Ansprechpartner, an: boolean) {
    setLaeuft(true); setFehler(null);
    try { await ansprechpartnerKarte(supabase, a.id, an); await queryClient.invalidateQueries({ queryKey: qk.ansprechpartner() }); }
    catch (e) { setFehler(fehlerText(e)); }
    finally { setLaeuft(false); }
  }

  return (
    <div className="db-karte dm-ap">
      <div className="db-karte-kopf">
        <span className="db-karte-titel">Ansprechpartner{aps.length ? ` (${aps.length})` : ""}</span>
        {darfSchreiben && <button type="button" className="db-link" onClick={() => setBlatt("neu")}>+ Ansprechpartner</button>}
      </div>
      {(istFirma || aps.length > 0) && kunde.address.trim() && (
        <button type="button" className="es-zeile dm-ap-nadel" aria-pressed={kundeNadel} disabled={!darfSchreiben || laeuft} onClick={() => void kundeNadelSetzen(!kundeNadel)}>
          <span className="db-punkt-text">
            <b>{istFirma ? "Firmenadresse auf der Karte" : "Adresse auf der Karte"}</b>
            <span className="small">{kundeNadel ? "Nadel an der Adresse des Kunden." : "Nur Rechnungsadresse – eine Nadel gibt es dort nur, solange ein Termin an dieser Adresse ansteht."}</span>
          </span>
          <span className={"nk-spur klein" + (kundeNadel ? " an" : "")} aria-hidden="true"><span /></span>
        </button>
      )}
      {aps.length === 0 && <span className="small">Noch keiner. Wird bei einer Person gewechselt (eigene Adresse), sie hier anlegen und beim Termin als Wechselort wählen.</span>}
      {aps.map((a) => {
        const fz = fahrzeuge.filter((v) => v.ansprechpartner_id === a.id);
        return (
          <div key={a.id} className="dm-ap-zeile">
            <button type="button" className="dm-ap-text" onClick={() => darfSchreiben && setBlatt(a)} disabled={!darfSchreiben}>
              <b>{apAnzeige(a)}{a.funktion ? <span className="small"> · {a.funktion}</span> : null}</b>
              <span className="small">{hatEigeneAdresse(a) ? a.address : "ohne eigene Adresse"}</span>
              {fz.length > 0 && <span className="small">Fahrzeuge: {fz.map((v) => v.license_plate || "ohne Kz.").join(", ")}</span>}
            </button>
            <span className="dm-ap-knoepfe">
              {a.telefon && <a className="es-knopf" href={`tel:${a.telefon.replace(/[^\d+]/g, "")}`} aria-label={`${apAnzeige(a)} anrufen`}>☎</a>}
              {a.email && <a className="es-knopf" href={`mailto:${a.email}`} aria-label={`${apAnzeige(a)} schreiben`}>@</a>}
              {hatEigeneAdresse(a) && (
                <button type="button" className="es-knopf" aria-pressed={a.auf_karte} disabled={!darfSchreiben || laeuft}
                  title={a.auf_karte ? "Nadel auf der Karte – antippen zum Ausblenden" : "Keine Nadel – antippen zum Einblenden"}
                  onClick={() => void apNadelSetzen(a, !a.auf_karte)}>{a.auf_karte ? "Karte an" : "Karte aus"}</button>
              )}
            </span>
          </div>
        );
      })}
      {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      {blatt && (
        <AnsprechpartnerBlatt supabase={supabase} kunde={kunde} ap={blatt === "neu" ? null : blatt} sortierung={aps.length}
          fahrzeuge={fahrzeuge} darfLoeschen={darfLoeschen} onFahrzeugeGeaendert={onFahrzeugeGeaendert} onClose={() => setBlatt(null)} />
      )}
    </div>
  );
}

const LEER: ApEntwurf = { anrede: null, name: "", funktion: null, telefon: null, email: null, address: null, auf_karte: false, notiz: null };

function AnsprechpartnerBlatt({ supabase, kunde, ap, sortierung, fahrzeuge, darfLoeschen, onFahrzeugeGeaendert, onClose }: {
  supabase: SupabaseClient; kunde: Customer; ap: Ansprechpartner | null; sortierung: number; fahrzeuge: Vehicle[]; darfLoeschen: boolean;
  onFahrzeugeGeaendert?: () => Promise<void> | void; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [e, setE] = useState<ApEntwurf>(ap ? { anrede: ap.anrede, name: ap.name, funktion: ap.funktion, telefon: ap.telefon, email: ap.email,
    address: ap.address, auf_karte: ap.auf_karte, notiz: ap.notiz } : LEER);
  const [koordinate, setKoordinate] = useState<{ lat: number; lng: number } | null>(null);
  const [fz, setFz] = useState<Set<string>>(() => new Set(ap ? fahrzeuge.filter((v) => v.ansprechpartner_id === ap.id).map((v) => v.id) : []));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [loeschenFrage, setLoeschenFrage] = useState(false);
  const mangel = apMaengel(e);
  const setze = (p: Partial<ApEntwurf>) => { setFehler(null); setE({ ...e, ...p }); };

  async function speichern() {
    if (mangel) return;
    setLaeuft(true); setFehler(null);
    try {
      let id = ap?.id;
      if (ap) await ansprechpartnerAendern(supabase, ap, e, koordinate);
      else id = (await ansprechpartnerAnlegen(supabase, kunde.id, e, sortierung, koordinate)).id;
      // Fahrzeuge: nur, was sich geändert hat.
      let fzGeaendert = false;
      for (const v of fahrzeuge) {
        const soll = fz.has(v.id) ? id! : v.ansprechpartner_id === id ? null : v.ansprechpartner_id ?? null;
        if (soll !== (v.ansprechpartner_id ?? null)) { await fahrzeugAnsprechpartner(supabase, v.id, soll); fzGeaendert = true; }
      }
      await queryClient.invalidateQueries({ queryKey: qk.ansprechpartner() });
      // Offene Aufträge mit diesem Ort hat die Datenbank nachgezogen.
      if (ap) await queryClient.invalidateQueries({ queryKey: ["auftraege"] });
      if (fzGeaendert) await onFahrzeugeGeaendert?.();
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  }
  async function loeschen() {
    if (!ap) return;
    setLaeuft(true); setFehler(null);
    try {
      await ansprechpartnerLoeschen(supabase, ap.id);
      await queryClient.invalidateQueries({ queryKey: qk.ansprechpartner() });
      await queryClient.invalidateQueries({ queryKey: ["auftraege"] });
      await onFahrzeugeGeaendert?.();
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Blatt titel={ap ? apAnzeige(ap) : "Neuer Ansprechpartner"} unter={(kunde.company || "").trim() || kunde.name} breite="mittel" ebene="modal-storno" onClose={onClose}
      fuss={<>
        {ap && darfLoeschen && !loeschenFrage && <button type="button" className="btn-secondary" disabled={laeuft} onClick={() => setLoeschenFrage(true)}>Löschen</button>}
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>Abbrechen</button>
        <button type="button" className="btn-primary" onClick={() => void speichern()} disabled={laeuft || !!mangel}>{laeuft ? "speichert …" : "Speichern"}</button>
      </>}>
      <div className="dm-ap-formular">
        <div className="nk-zeile">
          <label className="nk-feld nk-anrede"><span>Anrede</span>
            <select value={e.anrede ?? ""} onChange={(ev) => setze({ anrede: (ev.target.value || null) as ApEntwurf["anrede"] })}>
              <option value="">–</option><option value="Herr">Herr</option><option value="Frau">Frau</option>
            </select>
          </label>
          <label className="nk-feld"><span>Name *</span><input type="text" value={e.name} maxLength={120} onChange={(ev) => setze({ name: ev.target.value })} placeholder="Vor- und Nachname" /></label>
        </div>
        <label className="nk-feld"><span>Funktion</span><input type="text" value={e.funktion ?? ""} maxLength={80} onChange={(ev) => setze({ funktion: ev.target.value })} placeholder="z. B. Fuhrpark, Filialleitung" /></label>
        <div className="nk-zeile">
          <label className="nk-feld"><span>Telefon</span><input type="tel" value={e.telefon ?? ""} maxLength={40} onChange={(ev) => setze({ telefon: ev.target.value })} /></label>
          <label className="nk-feld"><span>E-Mail</span><input type="email" value={e.email ?? ""} maxLength={200} onChange={(ev) => setze({ email: ev.target.value })} /></label>
        </div>
        <label className="nk-feld"><span>Eigene Adresse (freiwillig – nur, wenn bei ihm gewechselt wird)</span>
          <AdressFeld wert={e.address ?? ""} platzhalter="Straße Nr., PLZ Ort"
            onChange={(t) => { setKoordinate(null); setze({ address: t, ...(t.trim() ? {} : { auf_karte: false }) }); }}
            onVorschlagGewaehlt={(v) => { setKoordinate({ lat: v.lat, lng: v.lng }); setze({ address: v.label }); }} />
        </label>
        <button type="button" className="es-zeile" aria-pressed={e.auf_karte} disabled={!(e.address ?? "").trim()} onClick={() => setze({ auf_karte: !e.auf_karte })}>
          <span className="db-punkt-text"><b>Auf der Karte</b>
            <span className="small">{(e.address ?? "").trim() ? "Eigene Nadel an seiner Adresse, im Zustand des Kunden." : "Braucht eine eigene Adresse."}</span></span>
          <span className={"nk-spur klein" + (e.auf_karte ? " an" : "")} aria-hidden="true"><span /></span>
        </button>
        {fahrzeuge.length > 0 && (
          <div className="nk-feld">
            <span>Fahrzeuge bei {e.name.trim() || "diesem Ansprechpartner"}</span>
            {fahrzeuge.map((v) => (
              <label key={v.id} className="fi-haken-zeile">
                <input type="checkbox" checked={fz.has(v.id)} onChange={() => { const n = new Set(fz); if (n.has(v.id)) n.delete(v.id); else n.add(v.id); setFz(n); }} />
                {v.license_plate || "ohne Kz."}{v.make_model ? ` · ${v.make_model}` : ""}
              </label>
            ))}
          </div>
        )}
        <label className="nk-feld"><span>Notiz</span><textarea value={e.notiz ?? ""} maxLength={1000} rows={2} onChange={(ev) => setze({ notiz: ev.target.value })} /></label>
        <span className="small">Private Adressen sind personenbezogene Daten: nur eintragen, wo tatsächlich dort gewechselt wird.</span>
        {mangel && e.name.trim() && <div className="fi-hinweis fi-info">{mangel}</div>}
        {loeschenFrage && ap && (
          <div className="fi-hinweis fi-warn">
            {apAnzeige(ap)} löschen? Offene Termine bei ihm behalten den Ort als einmalige Adresse, Fahrzeuge bleiben beim Kunden.
            <div className="pk-knoepfe">
              <button type="button" className="btn-secondary" onClick={() => setLoeschenFrage(false)} disabled={laeuft}>Doch nicht</button>
              <button type="button" className="btn-primary" onClick={() => void loeschen()} disabled={laeuft}>Löschen</button>
            </div>
          </div>
        )}
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}
