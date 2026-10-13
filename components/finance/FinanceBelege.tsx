"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import { useFinBelege, useFinKonten, useFinLieferanten, useFinSteuerschluessel } from "@/lib/queries/hooks";
import {
  finBelegBezahlt, finBelegBuchen, finBelegDateiHochladen, finBelegDateiLink, finBelegSpeichern, finBelegStornieren,
  finBelegVerwerfen, finBelegZahlungZuruecknehmen, finLieferantAendern, finLieferantAnlegen,
} from "@/lib/api/finance";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import { betragLesen, buchungVorschau, kontoNr, passendeSchluessel, type FinKonto, type FinSteuerschluessel } from "@/lib/finance/buchung";
import {
  FIN_BELEG_KATEGORIEN, belegAlsBuchung, belegZustand, belegZustandText, belegeOffen, dateiMangel, istXml, kontoVorschlag,
  type BelegZustand, type FinBeleg, type FinBelegPosten, type FinLieferant,
} from "@/lib/finance/belege";
import { eRechnungLesen, eRechnungPosten } from "@/lib/finance/erechnung";
import { bildVerkleinern } from "@/lib/belegBild";
import { formatEUR } from "@/lib/format";
import { KontoWahl, ZeilenTabelle } from "./FinanceBuchungen";

// Finance › Belege (Phase F2, Migration 90, v148): Eingangsrechnungen und Quittungen.
// Entwurf (frei änderbar, mit Foto/PDF/E-Rechnung) → buchen (Aufwand an Verbindlichkeiten, die Datenbank
// rechnet die Vorsteuer) → bezahlt (bar oder Bank). Gebuchte Belege sind unveränderbar – Storno.

type Reiter = "entwurf" | "offen" | "bezahlt" | "storniert" | "lieferanten";

export function FinanceBelege({ supabase, jahr, heute, einstellungen, darfSchreiben, darfLoeschen, onEinstellungen }: {
  supabase: SupabaseClient; jahr: number; heute: string; einstellungen: FinEinstellungen | null;
  darfSchreiben: boolean; darfLoeschen: boolean; onEinstellungen: () => void;
}) {
  const rahmen = einstellungen?.kontenrahmen ?? "skr03";
  const bereit = !!einstellungen;
  const belegeQ = useFinBelege(supabase, jahr, bereit);
  const lieferantenQ = useFinLieferanten(supabase, bereit);
  const kontenQ = useFinKonten(supabase, rahmen, bereit);
  const schluesselQ = useFinSteuerschluessel(supabase, rahmen, bereit);
  const [reiter, setReiter] = useState<Reiter>("entwurf");
  const [offen, setOffen] = useState<FinBeleg | "neu" | null>(null);
  const [lieferantOffen, setLieferantOffen] = useState<FinLieferant | "neu" | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  if (!einstellungen) {
    return (
      <div className="db-karte es-karte">
        <div className="es-zeile statisch"><span className="db-punkt-text"><b>Erst die Einstellungen für {jahr} speichern</b>
          <span className="small">Kontenrahmen und Umsatzsteuer bestimmen Konten und Vorsteuer.</span></span></div>
        <button type="button" className="btn-primary fi-knopf" onClick={onEinstellungen}>Zu den Einstellungen</button>
      </div>
    );
  }
  const belege = belegeQ.data ?? [];
  const lieferanten = lieferantenQ.data ?? [];
  const konten = kontenQ.data ?? [];
  const schluessel = schluesselQ.data ?? [];
  const mitZustand = belege.map((b) => ({ ...b, zustand: belegZustand(b, heute) }));
  const gruppe = (r: Exclude<Reiter, "lieferanten">) => mitZustand.filter((b) =>
    r === "entwurf" ? b.zustand.art === "entwurf" : r === "offen" ? b.zustand.art === "offen" || b.zustand.art === "ueberfaellig"
      : r === "bezahlt" ? b.zustand.art === "bezahlt" : b.zustand.art === "storniert");
  const fehlt = [belegeQ, lieferantenQ].some((x) => x.isError);

  return (
    <>
      {fehlt && <div className="fi-hinweis fi-rot" role="alert">Die Belege konnten nicht geladen werden. Ist Migration 90 ausgeführt?</div>}
      {meldung && <div className="fi-hinweis fi-ok" role="status">{meldung}</div>}
      <div className="lg-lagerwahl es-segment fi-reiter fi-reiter-breit" role="tablist" aria-label="Belege">
        {([["entwurf", "Entwürfe"], ["offen", "Offen"], ["bezahlt", "Bezahlt"], ["storniert", "Storniert"], ["lieferanten", "Lieferanten"]] as const).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={reiter === k} className={reiter === k ? "aktiv" : ""} onClick={() => setReiter(k)}>
            {t}{k !== "lieferanten" && k !== "storniert" && <span className="lg-lagerwahl-zahl">{gruppe(k).length}</span>}
          </button>
        ))}
      </div>
      {darfSchreiben && reiter !== "lieferanten" && (
        <div className="fi-werkzeug"><button type="button" className="btn-primary fi-knopf" onClick={() => { setMeldung(null); setOffen("neu"); }}>Beleg erfassen</button></div>
      )}
      {reiter === "lieferanten" ? (
        <>
          {darfSchreiben && <div className="fi-werkzeug"><button type="button" className="btn-primary fi-knopf" onClick={() => setLieferantOffen("neu")}>Lieferant anlegen</button></div>}
          <div className="db-karte es-karte">
            {lieferanten.length === 0 ? <span className="small">Noch kein Lieferant. Er entsteht auch beim ersten Beleg.</span> : lieferanten.map((l) => (
              <button key={l.id} type="button" className={"es-zeile" + (l.aktiv ? "" : " fi-aus")} onClick={() => setLieferantOffen(l)}>
                <span className="db-punkt-text"><b>{l.name}</b>
                  <span className="small">{l.konto ? `Konto ${kontoNr(l.konto)} ${konten.find((k) => k.nummer === l.konto)?.bezeichnung ?? ""}` : "ohne Kontovorschlag"}
                    {l.ust_id ? ` · ${l.ust_id}` : ""}{l.aktiv ? "" : " · ausgeblendet"}</span></span>
                <span className="fi-pfeil" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <BelegListe liste={gruppe(reiter)} lieferanten={lieferanten} laedt={belegeQ.isPending} onOeffnen={setOffen}
          leer={reiter === "entwurf" ? "Kein Entwurf. „Beleg erfassen“ – mit Foto, PDF oder E-Rechnung." : "Hier ist nichts."} />
      )}
      <span className="small es-fuss fi-fuss">Gebucht wird Aufwand an Verbindlichkeiten; die Vorsteuer rechnet Finance aus dem Bruttobetrag heraus. Die Datei eines gebuchten Belegs bleibt unveränderbar abgelegt.</span>

      {offen && (
        <BelegFenster supabase={supabase} beleg={offen === "neu" ? null : belege.find((b) => b.id === offen.id) ?? offen}
          heute={heute} einstellungen={einstellungen} konten={konten} schluessel={schluessel} lieferanten={lieferanten} belege={belege}
          darfSchreiben={darfSchreiben} darfLoeschen={darfLoeschen}
          onFertig={(t) => { setOffen(null); setMeldung(t); }} onClose={() => setOffen(null)} />
      )}
      {lieferantOffen && (
        <LieferantBlatt supabase={supabase} lieferant={lieferantOffen === "neu" ? null : lieferantOffen} konten={konten}
          schluessel={passendeSchluessel(schluessel, einstellungen)} darfSchreiben={darfSchreiben} onClose={() => setLieferantOffen(null)} />
      )}
    </>
  );
}

// Offene Posten der Lieferanten – für Finance › Offene Posten.
export function BelegeOffenePosten({ supabase, jahr, heute, einstellungen, darfSchreiben }: {
  supabase: SupabaseClient; jahr: number; heute: string; einstellungen: FinEinstellungen | null; darfSchreiben: boolean;
}) {
  const rahmen = einstellungen?.kontenrahmen ?? "skr03";
  const bereit = !!einstellungen;
  const belegeQ = useFinBelege(supabase, jahr, bereit);
  const lieferantenQ = useFinLieferanten(supabase, bereit);
  const kontenQ = useFinKonten(supabase, rahmen, bereit);
  const schluesselQ = useFinSteuerschluessel(supabase, rahmen, bereit);
  const [offen, setOffen] = useState<FinBeleg | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  if (!einstellungen) return null;
  const belege = belegeQ.data ?? [];
  const op = belegeOffen(belege, heute);
  return (
    <>
      <span className="op-gruppe-titel">LIEFERANTEN · WAS WIR SCHULDEN</span>
      {meldung && <div className="fi-hinweis fi-ok" role="status">{meldung}</div>}
      <div className="fi-kacheln">
        <div className="db-karte fi-kachel"><span className="small">Offen</span><b>{formatEUR(op.summe)}</b><span className="small">{anzahl(op.posten.length)}</span></div>
        <div className={"db-karte fi-kachel" + (op.ueberfaellig > 0 ? " fi-kachel-warn" : "")}><span className="small">Davon überfällig</span><b>{formatEUR(op.ueberfaellig)}</b></div>
      </div>
      <BelegListe liste={op.posten} lieferanten={lieferantenQ.data ?? []} laedt={belegeQ.isPending} onOeffnen={setOffen} leer="Keine offenen Lieferantenbelege." />
      {offen && (
        <BelegFenster supabase={supabase} beleg={belege.find((b) => b.id === offen.id) ?? offen} heute={heute} einstellungen={einstellungen}
          konten={kontenQ.data ?? []} schluessel={schluesselQ.data ?? []} lieferanten={lieferantenQ.data ?? []} belege={belege}
          darfSchreiben={darfSchreiben} darfLoeschen={false} onFertig={(t) => { setOffen(null); setMeldung(t); }} onClose={() => setOffen(null)} />
      )}
    </>
  );
}

function zustandKlasse(z: BelegZustand): string {
  return z.art === "ueberfaellig" ? " fi-rot-text" : z.art === "bezahlt" ? " fi-gruen-text" : "";
}

function BelegListe({ liste, lieferanten, laedt, leer, onOeffnen }: {
  liste: (FinBeleg & { zustand: BelegZustand })[]; lieferanten: FinLieferant[]; laedt: boolean; leer: string; onOeffnen: (b: FinBeleg) => void;
}) {
  return (
    <div className="db-karte es-karte">
      {laedt ? <span className="small">Lädt …</span> : liste.length === 0 ? <span className="small">{leer}</span> : liste.map((b) => {
        const betrag = b.brutto ?? b.posten.reduce((s, p) => s + (p.betrag ?? 0), 0);
        return (
          <button key={b.id} type="button" className={"es-zeile fi-buchung" + (b.zustand.art === "storniert" ? " fi-gestrichen" : "")} onClick={() => onOeffnen(b)}>
            <span className="db-punkt-text">
              <b>{lieferanten.find((l) => l.id === b.lieferant_id)?.name ?? "Lieferant fehlt"}</b>
              <span className="small">{datumKurz(b.belegdatum)}{b.belegnummer ? ` · ${b.belegnummer}` : ""}{b.text ? ` · ${b.text}` : ""}
                {" · "}<span className={zustandKlasse(b.zustand)}>{belegZustandText(b.zustand)}</span>{b.datei_pfad ? " · mit Datei" : ""}</span>
            </span>
            <span className="fi-betrag">{betrag ? formatEUR(betrag) : "–"}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Ein Beleg
type PostenEingabe = { konto: string; betrag: string; steuer: string };
const zuEingabe = (p: FinBelegPosten): PostenEingabe => ({
  konto: p.konto ? String(p.konto) : "", betrag: p.betrag == null ? "" : String(p.betrag).replace(".", ","), steuer: p.steuer ?? "",
});

function BelegFenster({ supabase, beleg, heute, einstellungen, konten, schluessel, lieferanten, belege, darfSchreiben, darfLoeschen, onFertig, onClose }: {
  supabase: SupabaseClient; beleg: FinBeleg | null; heute: string; einstellungen: FinEinstellungen;
  konten: FinKonto[]; schluessel: FinSteuerschluessel[]; lieferanten: FinLieferant[]; belege: FinBeleg[];
  darfSchreiben: boolean; darfLoeschen: boolean; onFertig: (meldung: string) => void; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const bearbeitbar = darfSchreiben && (!beleg || beleg.status === "entwurf");
  const [id, setId] = useState<string | null>(beleg?.id ?? null);
  const [lieferantId, setLieferantId] = useState(beleg?.lieferant_id ?? "");
  const [neuerLieferant, setNeuerLieferant] = useState("");
  const [neueUstId, setNeueUstId] = useState("");
  const [datum, setDatum] = useState(beleg?.belegdatum ?? heute);
  const [nummer, setNummer] = useState(beleg?.belegnummer ?? "");
  const [text, setText] = useState(beleg?.text ?? "");
  const [faellig, setFaellig] = useState(beleg?.faellig_am ?? "");
  const [posten, setPosten] = useState<PostenEingabe[]>(beleg?.posten.length ? beleg.posten.map(zuEingabe) : [{ konto: "", betrag: "", steuer: "" }]);
  const [datei, setDatei] = useState<{ pfad: string | null; name: string | null }>({ pfad: beleg?.datei_pfad ?? null, name: beleg?.datei_name ?? null });
  const [zahlung, setZahlung] = useState<"offen" | "bar" | "bank">("offen");
  const [zahlDatum, setZahlDatum] = useState(heute);
  const [aktion, setAktion] = useState<"storno" | "zurueck" | "bar" | "bank" | "verwerfen" | null>(null);
  const [grund, setGrund] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);

  const passend = passendeSchluessel(schluessel, einstellungen);
  const lieferant = lieferanten.find((l) => l.id === lieferantId) ?? null;
  const werte: FinBelegPosten[] = posten.map((p) => ({ konto: p.konto ? Number(p.konto) : null, betrag: betragLesen(p.betrag), steuer: p.steuer || null }));
  const vorschau = buchungVorschau(belegAlsBuchung(werte, einstellungen.kontenrahmen), konten, schluessel, einstellungen);
  const lieferantFehlt = !lieferantId && !neuerLieferant.trim();
  const pruefung = lieferantFehlt ? "Den Lieferanten wählen oder neu eintragen." : vorschau.fehler;
  const name = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";
  const z = beleg ? belegZustand(beleg, heute) : { art: "entwurf" as const };
  const setzePosten = (i: number, p: Partial<PostenEingabe>) => { setFehler(null); setPosten(posten.map((x, j) => (j === i ? { ...x, ...p } : x))); };

  function lieferantWaehlen(wert: string) {
    setLieferantId(wert);
    const v = kontoVorschlag(lieferanten.find((l) => l.id === wert), belege);
    if (v.konto && posten.every((p) => !p.konto)) setPosten(posten.map((p) => ({ ...p, konto: String(v.konto), steuer: p.steuer || v.steuer || "" })));
  }

  // Speichert den Entwurf (legt bei Bedarf den Lieferanten an) und gibt die Beleg-ID zurück. `neu`: Werte,
  // die gerade erst gesetzt wurden (E-Rechnung) – der Zustand ist im selben Durchlauf noch der alte.
  type Stand = { lieferantId: string; neuerLieferant: string; neueUstId: string; datum: string; nummer: string; faellig: string; posten: FinBelegPosten[] };
  async function speichern(neu: Partial<Stand> = {}): Promise<string> {
    const st: Stand = { lieferantId, neuerLieferant, neueUstId, datum, nummer, faellig, posten: werte, ...neu };
    let lid = st.lieferantId || null;
    if (!lid && st.neuerLieferant.trim()) {
      const l = await finLieferantAnlegen(supabase, { name: st.neuerLieferant.trim(), ust_id: st.neueUstId.trim() || null, konto: st.posten[0]?.konto ?? null, steuer: st.posten[0]?.steuer ?? null });
      lid = l.id;
      setLieferantId(l.id);
      setNeuerLieferant("");
    }
    const neueId = await finBelegSpeichern(supabase, id, {
      lieferant_id: lid, belegdatum: st.datum, belegnummer: st.nummer.trim() || null, text: text.trim() || null,
      faellig_am: st.faellig || null, posten: st.posten.filter((p) => p.konto || p.betrag),
    });
    setId(neueId);
    return neueId;
  }

  async function ausfuehren(f: () => Promise<string | null>) {
    setLaeuft(true);
    setFehler(null);
    try {
      const t = await f();
      await queryClient.invalidateQueries({ queryKey: qk.finance() });
      if (t) onFertig(t);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  async function dateiGewaehlt(f: File) {
    const mangel = dateiMangel(f);
    if (mangel) { setFehler(mangel); return; }
    await ausfuehren(async () => {
      const neu: Partial<Stand> = {};
      if (istXml(f)) {
        const r = eRechnungLesen(await f.text());
        if (r) {
          // E-Rechnung: Felder füllen, soweit sie leer sind.
          if (r.nummer && !nummer) { neu.nummer = r.nummer; setNummer(r.nummer); }
          if (r.datum) { neu.datum = r.datum; setDatum(r.datum); }
          if (r.faellig && !faellig) { neu.faellig = r.faellig; setFaellig(r.faellig); }
          const treffer = lieferanten.find((l) => (r.ustId && l.ust_id === r.ustId) || (r.lieferant && l.name.trim().toLowerCase() === r.lieferant.trim().toLowerCase()));
          if (treffer) { neu.lieferantId = treffer.id; setLieferantId(treffer.id); }
          else if (r.lieferant && !lieferantId) {
            neu.neuerLieferant = r.lieferant; neu.neueUstId = r.ustId ?? "";
            setNeuerLieferant(r.lieferant); setNeueUstId(r.ustId ?? "");
          }
          const v = kontoVorschlag(treffer, belege);
          const posten = eRechnungPosten(r);
          if (posten.length) {
            neu.posten = posten.map((p) => ({ konto: v.konto, betrag: p.betrag, steuer: p.steuer }));
            setPosten(posten.map((p) => ({ konto: v.konto ? String(v.konto) : "", betrag: String(p.betrag).replace(".", ","), steuer: p.steuer ?? "" })));
          }
          setHinweis(`E-Rechnung (${r.format}) gelesen${r.brutto != null ? ` – zu zahlen ${formatEUR(r.brutto)}` : ""}. Bitte Konten prüfen.`);
        } else {
          setHinweis("Die XML-Datei ist keine lesbare E-Rechnung – sie wird nur abgelegt.");
        }
      }
      const belegId = id ?? await speichern(neu);
      const blob = f.type.startsWith("image/") ? (await bildVerkleinern(f)).blob : f;
      const dateiName = f.type.startsWith("image/") ? f.name.replace(/\.\w+$/, "") + ".jpg" : f.name;
      const pfad = await finBelegDateiHochladen(supabase, belegId, blob, dateiName, datei.pfad);
      setDatei({ pfad, name: dateiName });
      return null;
    });
  }

  async function dateiZeigen() {
    if (!datei.pfad) return;
    try {
      window.open(await finBelegDateiLink(supabase, datei.pfad), "_blank", "noopener");
    } catch (e) {
      setFehler(fehlerText(e));
    }
  }

  const buchen = () => ausfuehren(async () => {
    const belegId = await speichern();
    const r = await finBelegBuchen(supabase, belegId, zahlung === "offen" ? null : zahlung, zahlung === "offen" ? null : zahlDatum);
    return `Beleg gebucht (Nr. ${r.nr}, ${formatEUR(r.brutto)})${zahlung === "bar" ? " und bar bezahlt" : zahlung === "bank" ? " und per Bank bezahlt" : ""}.`;
  });

  let fuss: React.ReactNode;
  if (bearbeitbar) {
    fuss = aktion === "verwerfen" ? <>
      <button type="button" className="btn-secondary" onClick={() => setAktion(null)} disabled={laeuft}>Zurück</button>
      <button type="button" className="btn-danger" disabled={laeuft} onClick={() => void ausfuehren(async () => {
        if (id) await finBelegVerwerfen(supabase, { id, datei_pfad: datei.pfad }); return "Entwurf verworfen.";
      })}>Endgültig verwerfen</button>
    </> : <>
      {id && darfLoeschen && <button type="button" className="btn-secondary" onClick={() => setAktion("verwerfen")} disabled={laeuft}>Verwerfen</button>}
      <button type="button" className="btn-secondary" disabled={laeuft || lieferantFehlt && !text.trim() && !datei.pfad}
        onClick={() => void ausfuehren(async () => { await speichern(); return "Entwurf gespeichert."; })}>Als Entwurf</button>
      <button type="button" className="btn-primary" disabled={laeuft || !!pruefung} onClick={() => void buchen()}>{laeuft ? "…" : "Buchen"}</button>
    </>;
  } else if (beleg && darfSchreiben && aktion) {
    fuss = <>
      <button type="button" className="btn-secondary" onClick={() => setAktion(null)} disabled={laeuft}>Zurück</button>
      {aktion === "storno" && <button type="button" className="btn-danger" disabled={laeuft || !grund.trim()}
        onClick={() => void ausfuehren(async () => { await finBelegStornieren(supabase, beleg.id, grund.trim()); return "Beleg storniert."; })}>Storno buchen</button>}
      {aktion === "zurueck" && <button type="button" className="btn-danger" disabled={laeuft || !grund.trim()}
        onClick={() => void ausfuehren(async () => { await finBelegZahlungZuruecknehmen(supabase, beleg.id, grund.trim()); return "Zahlung zurückgenommen."; })}>Zahlung zurücknehmen</button>}
      {(aktion === "bar" || aktion === "bank") && <button type="button" className="btn-primary" disabled={laeuft || zahlDatum > heute}
        onClick={() => void ausfuehren(async () => { const r = await finBelegBezahlt(supabase, beleg.id, aktion, zahlDatum); return `Zahlung erfasst (Buchung Nr. ${r.nr}).`; })}>Zahlung buchen</button>}
    </>;
  } else if (beleg && darfSchreiben) {
    fuss = z.art === "offen" || z.art === "ueberfaellig" ? <>
      <button type="button" className="btn-secondary" onClick={() => setAktion("storno")}>Stornieren …</button>
      <button type="button" className="btn-secondary" onClick={() => setAktion("bar")}>Bar bezahlt</button>
      <button type="button" className="btn-primary" onClick={() => setAktion("bank")}>Überwiesen</button>
    </> : z.art === "bezahlt" ? <button type="button" className="btn-secondary" onClick={() => setAktion("zurueck")}>Zahlung zurücknehmen …</button> : undefined;
  }

  const lieferantName = lieferant?.name ?? (neuerLieferant || "Neuer Beleg");
  return (
    <Blatt titel={beleg ? lieferantName : "Beleg erfassen"} unter={beleg ? `${datumKurz(beleg.belegdatum)} · ${belegZustandText(z)}` : einstellungen.kontenrahmen.toUpperCase()}
      breite="breit" onClose={onClose} fuss={fuss}>
      <div className="fi-formular">
        <div className="fi-datei">
          {datei.pfad
            ? <button type="button" className="es-knopf" onClick={() => void dateiZeigen()}>Datei ansehen: {datei.name ?? "Beleg"}</button>
            : <span className="small">Noch keine Datei.</span>}
          {bearbeitbar && (
            <label className="es-knopf fi-dateiwahl">
              {datei.pfad ? "Datei ersetzen" : "Foto, PDF oder E-Rechnung"}
              <input type="file" accept="image/*,application/pdf,.xml,application/xml,text/xml" disabled={laeuft}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void dateiGewaehlt(f); }} />
            </label>
          )}
        </div>
        {hinweis && <div className="fi-hinweis fi-info">{hinweis}</div>}

        {bearbeitbar ? (
          <>
            <div className="fi-zwei">
              <label className="nk-feld"><span>Lieferant</span>
                <select value={lieferantId} onChange={(e) => lieferantWaehlen(e.target.value)} aria-label="Lieferant">
                  <option value="">{neuerLieferant ? "– neuer Lieferant –" : "Lieferant wählen"}</option>
                  {lieferanten.filter((l) => l.aktiv || l.id === lieferantId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              {!lieferantId && (
                <label className="nk-feld"><span>oder neu</span>
                  <input value={neuerLieferant} maxLength={120} onChange={(e) => setNeuerLieferant(e.target.value)} placeholder="Name des Lieferanten" />
                </label>
              )}
            </div>
            <div className="fi-zwei">
              <label className="nk-feld"><span>Belegdatum</span><input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
              <label className="nk-feld"><span>Beleg-Nr.</span><input value={nummer} maxLength={60} onChange={(e) => setNummer(e.target.value)} placeholder="Rechnungsnummer" /></label>
            </div>
            <div className="fi-zwei">
              <label className="nk-feld"><span>Was</span><input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="z. B. Tanken, Ventile" /></label>
              <label className="nk-feld"><span>Fällig am</span><input type="date" value={faellig} onChange={(e) => setFaellig(e.target.value)} /></label>
            </div>
            {posten.map((p, i) => {
              const st = passend.find((s) => s.schluessel === p.steuer);
              return (
                <div key={i} className="fi-posten">
                  <div className="fi-posten-kopf">
                    <b>{posten.length > 1 ? `Posten ${i + 1}` : "Betrag"}</b>
                    {posten.length > 1 && <button type="button" className="es-knopf" onClick={() => setPosten(posten.filter((_, j) => j !== i))}>Entfernen</button>}
                  </div>
                  <label className="nk-feld"><span>Konto</span>
                    <KontoWahl wert={p.konto} konten={konten} nur={FIN_BELEG_KATEGORIEN} onWert={(w) => setzePosten(i, { konto: w })} label={`Konto Posten ${i + 1}`} />
                  </label>
                  <div className="fi-zwei">
                    <label className="nk-feld"><span>Betrag in €</span>
                      <input inputMode="decimal" value={p.betrag} onChange={(e) => setzePosten(i, { betrag: e.target.value })} placeholder="0,00" aria-label={`Betrag Posten ${i + 1}`} /></label>
                    <label className="nk-feld"><span>Steuer</span>
                      <select value={p.steuer} onChange={(e) => setzePosten(i, { steuer: e.target.value })} aria-label={`Steuer Posten ${i + 1}`}>
                        <option value="">ohne Vorsteuer</option>
                        {passend.filter((s) => s.art !== "ust").map((s) => <option key={s.schluessel} value={s.schluessel}>{s.bezeichnung}</option>)}
                      </select></label>
                  </div>
                  {st && <span className="small">{st.art === "vst" ? "Betrag brutto – die Vorsteuer wird herausgerechnet." : st.art === "ohne" ? "Ohne Steuer." : "Betrag netto – die Steuer kommt dazu."}</span>}
                </div>
              );
            })}
            {posten.length < 50 && (
              <button type="button" className="btn-secondary fi-mehr" onClick={() => setPosten([...posten, { konto: "", betrag: "", steuer: posten[posten.length - 1]?.steuer ?? "" }])}>+ Weiterer Posten</button>
            )}
            <span className="op-gruppe-titel">SO WIRD GEBUCHT</span>
            <ZeilenTabelle zeilen={vorschau.zeilen} name={name} />
            <div className="nk-feld">
              <span>Bezahlung</span>
              <div className="lg-lagerwahl es-segment" role="group" aria-label="Bezahlung">
                {([["offen", "noch offen"], ["bar", "bar bezahlt"], ["bank", "per Bank bezahlt"]] as const).map(([k, t]) => (
                  <button key={k} type="button" className={zahlung === k ? "aktiv" : ""} aria-pressed={zahlung === k} onClick={() => setZahlung(k)}>{t}</button>
                ))}
              </div>
            </div>
            {zahlung !== "offen" && (
              <label className="nk-feld"><span>Bezahlt am</span><input type="date" value={zahlDatum} max={heute} onChange={(e) => setZahlDatum(e.target.value)} /></label>
            )}
            {pruefung && (werte.some((p) => p.konto || p.betrag) || !lieferantFehlt) && <div className="fi-hinweis fi-rot" role="alert">{pruefung}</div>}
          </>
        ) : beleg && (
          <>
            <div className="db-punkt-text">
              <b>{beleg.text || "Beleg"}{beleg.belegnummer ? ` · ${beleg.belegnummer}` : ""}</b>
              <span className="small"><span className={zustandKlasse(z)}>{belegZustandText(z)}</span>
                {beleg.brutto != null ? ` · ${formatEUR(beleg.brutto)}` : ""}{beleg.faellig_am ? ` · fällig ${datumKurz(beleg.faellig_am)}` : ""}</span>
            </div>
            <ZeilenTabelle zeilen={buchungVorschau(belegAlsBuchung(beleg.posten, einstellungen.kontenrahmen), konten, schluessel, einstellungen).zeilen} name={name} />
            {(aktion === "bar" || aktion === "bank") && (
              <label className="nk-feld"><span>{aktion === "bar" ? "Bar bezahlt am" : "Überwiesen am"}</span><input type="date" value={zahlDatum} max={heute} onChange={(e) => setZahlDatum(e.target.value)} /></label>
            )}
            {(aktion === "storno" || aktion === "zurueck") && (
              <label className="nk-feld"><span>Grund</span><input value={grund} maxLength={200} onChange={(e) => setGrund(e.target.value)} autoFocus /></label>
            )}
          </>
        )}
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

// ---------------------------------------------------------------- Lieferant
function LieferantBlatt({ supabase, lieferant, konten, schluessel, darfSchreiben, onClose }: {
  supabase: SupabaseClient; lieferant: FinLieferant | null; konten: FinKonto[]; schluessel: FinSteuerschluessel[]; darfSchreiben: boolean; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(lieferant?.name ?? "");
  const [ust, setUst] = useState(lieferant?.ust_id ?? "");
  const [konto, setKonto] = useState(lieferant?.konto ? String(lieferant.konto) : "");
  const [steuer, setSteuer] = useState(lieferant?.steuer ?? "");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  async function los(f: () => Promise<unknown>) {
    setLaeuft(true); setFehler(null);
    try { await f(); await queryClient.invalidateQueries({ queryKey: qk.finLieferanten() }); onClose(); }
    catch (e) { setFehler(/duplicate|unique|23505/i.test(String((e as Error).message)) ? "Diesen Lieferanten gibt es schon." : fehlerText(e)); }
    finally { setLaeuft(false); }
  }
  const felder = { name: name.trim(), ust_id: ust.trim() || null, konto: konto ? Number(konto) : null, steuer: steuer || null };
  return (
    <Blatt titel={lieferant ? lieferant.name : "Lieferant anlegen"} onClose={onClose}
      fuss={darfSchreiben ? <>
        {lieferant && <button type="button" className="btn-secondary" disabled={laeuft}
          onClick={() => void los(() => finLieferantAendern(supabase, lieferant.id, { aktiv: !lieferant.aktiv }))}>{lieferant.aktiv ? "Ausblenden" : "Einblenden"}</button>}
        <button type="button" className="btn-primary" disabled={laeuft || !felder.name}
          onClick={() => void los(() => lieferant ? finLieferantAendern(supabase, lieferant.id, felder) : finLieferantAnlegen(supabase, felder))}>Speichern</button>
      </> : undefined}>
      <div className="fi-formular">
        <label className="nk-feld"><span>Name</span><input value={name} maxLength={120} disabled={!darfSchreiben} onChange={(e) => setName(e.target.value)} /></label>
        <label className="nk-feld"><span>USt-IdNr. (falls EU-Ausland)</span><input value={ust} maxLength={20} disabled={!darfSchreiben} onChange={(e) => setUst(e.target.value.toUpperCase())} /></label>
        <label className="nk-feld"><span>Kontovorschlag</span><KontoWahl wert={konto} konten={konten} nur={FIN_BELEG_KATEGORIEN} onWert={setKonto} label="Kontovorschlag" disabled={!darfSchreiben} /></label>
        <label className="nk-feld"><span>Steuer-Vorschlag</span>
          <select value={steuer} disabled={!darfSchreiben} onChange={(e) => setSteuer(e.target.value)}>
            <option value="">ohne</option>
            {schluessel.filter((s) => s.art !== "ust").map((s) => <option key={s.schluessel} value={s.schluessel}>{s.bezeichnung}</option>)}
          </select></label>
        <span className="small">Beim nächsten Beleg dieses Lieferanten stehen Konto und Steuer schon da.</span>
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

function anzahl(n: number): string {
  return n === 1 ? "1 Beleg" : `${n} Belege`;
}

function datumKurz(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}
