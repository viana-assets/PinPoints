import { useState } from "react";
import type { ReifenZustand, Saison, StorageSlot, Verkaufsreifen, VerkaufsreifenFelder, Warehouse } from "@/lib/types";
import { DEFAULT_VAT_RATE, formatEUR } from "@/lib/helpers";
import { PROFIL_MAX_MM, REIFEN_ZUSTAENDE, REIFEN_ZUSTAND_LABEL, SAISON_LABEL, SAISON_LISTE } from "@/lib/constants";
import { dotFehler, groesseAusText, groesseText, reifenHinweise } from "@/lib/reifenverkauf";

// Reifen zum Verkauf erfassen oder ändern (Migration 61, docs/lager.md „Reifenverkauf").
//
// Die Größe ist EIN Feld und kein Dreiklang aus Breite, Querschnitt, Zoll: So steht sie auf der
// Flanke, so diktiert man sie, und das Feld versteht „235/55 R17" genauso wie „2355517"
// (`groesseAusText`). Darunter steht, was verstanden wurde – ein Tippfehler fällt dort auf.
//
// Der Bestand ist das, was jetzt daliegt. Was reserviert oder verkauft ist, zählt die
// Datenbank; hier steht es nur zur Auskunft, und unter die Reservierung lässt sich der Bestand
// nicht drücken (die Datenbank lehnt es mit Begründung ab, die Oberfläche bietet es gar nicht an).

type Felge = "keine" | "stahl" | "alu";

export function VerkaufsreifenBlatt({ posten, warehouses, storageSlots, platzBelegt, vorgabeLagerId, darfSchreiben, darfLoeschen, onSpeichern, onLoeschen, onClose }: {
  // null = neu erfassen
  posten: Verkaufsreifen | null;
  warehouses: Warehouse[];
  storageSlots: StorageSlot[];
  // Welche Plätze mit einem KUNDENSATZ belegt sind – dorthin darf kein Verkaufsreifen.
  platzBelegt: Set<string>;
  vorgabeLagerId: string | null;
  darfSchreiben: boolean;
  darfLoeschen: boolean;
  onSpeichern: (felder: VerkaufsreifenFelder, id: string | null) => Promise<void>;
  onLoeschen: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const p = posten;
  const [zustand, setZustand] = useState<ReifenZustand>(p?.zustand ?? "neu");
  const [groesse, setGroesse] = useState(p ? groesseText(p) : "");
  const [kennung, setKennung] = useState(p?.kennung ?? "");
  const [hersteller, setHersteller] = useState(p?.hersteller ?? "");
  const [modell, setModell] = useState(p?.modell ?? "");
  const [saison, setSaison] = useState<Saison>(p?.saison ?? "sommer");
  const [bestand, setBestand] = useState(p ? p.bestand : 4);
  const [preis, setPreis] = useState(p ? String(p.preis_netto) : "");
  const [ek, setEk] = useState(p?.ek_netto != null ? String(p.ek_netto) : "");
  const [dot, setDot] = useState(p?.dot ?? "");
  const [profil, setProfil] = useState(p?.profiltiefe_mm != null ? String(p.profiltiefe_mm).replace(".", ",") : "");
  const [felge, setFelge] = useState<Felge>(p?.felge ?? "keine");
  const [runflat, setRunflat] = useState(p?.runflat ?? false);
  const [xl, setXl] = useState(p?.xl ?? false);
  const [eprel, setEprel] = useState(p?.eprel ?? "");
  const [lagerId, setLagerId] = useState<string>(p?.warehouse_id ?? vorgabeLagerId ?? warehouses[0]?.id ?? "");
  const [platzId, setPlatzId] = useState<string>(p?.storage_slot_id ?? "");
  const [notiz, setNotiz] = useState(p?.notiz ?? "");
  const [speichert, setSpeichert] = useState(false);
  const [versucht, setVersucht] = useState(false);

  const nurLesen = !darfSchreiben;
  const g = groesseAusText(groesse);
  const zahl = (t: string) => { const x = parseFloat(t.replace(",", ".")); return Number.isFinite(x) ? x : null; };
  const preisZahl = zahl(preis);
  const ekZahl = ek.trim() ? zahl(ek) : null;
  const profilZahl = profil.trim() ? zahl(profil) : null;
  const reserviert = p?.reserviert ?? 0;

  const fehler: Record<string, string | null> = {
    groesse: !groesse.trim() ? "Bitte die Größe angeben, z. B. 235/55 R17." : !g ? "Größe nicht erkannt – z. B. 235/55 R17." : null,
    hersteller: !hersteller.trim() ? "Bitte den Hersteller angeben." : null,
    preis: preisZahl == null || preisZahl < 0 ? "Bitte einen Preis angeben." : null,
    ek: ek.trim() && (ekZahl == null || ekZahl < 0) ? "Kein gültiger Betrag." : null,
    dot: dotFehler(dot),
    profil: profil.trim() && (profilZahl == null || profilZahl < 0 || profilZahl > PROFIL_MAX_MM) ? `Zwischen 0 und ${PROFIL_MAX_MM} mm.` : null,
    lager: bestand > 0 && !lagerId ? "Bitte das Lager wählen." : null,
  };
  const hatFehler = Object.values(fehler).some(Boolean);
  const zeige = (k: string) => (versucht || (k === "groesse" && groesse.trim() !== "")) ? fehler[k] : null;

  const plaetze = storageSlots
    .filter((s) => s.warehouse_id === lagerId && (!platzBelegt.has(s.id) || s.id === p?.storage_slot_id))
    .sort((a, b) => a.code.localeCompare(b.code, "de", { numeric: true }));

  const hinweise = reifenHinweise({ zustand, dot, profiltiefe_mm: profilZahl, saison });

  async function speichern() {
    setVersucht(true);
    if (hatFehler || !g || preisZahl == null) return;
    setSpeichert(true);
    try {
      await onSpeichern({
        zustand, breite: g.breite, querschnitt: g.querschnitt, zoll: g.zoll,
        kennung: kennung.trim().toUpperCase() || null,
        hersteller: hersteller.trim(), modell: modell.trim() || null, saison,
        dot: dot.replace(/\D/g, "") || null,
        profiltiefe_mm: profilZahl,
        felge: felge === "keine" ? null : felge,
        runflat, xl, eprel: eprel.trim() || null,
        preis_netto: Math.round(preisZahl * 100) / 100,
        ek_netto: ekZahl != null ? Math.round(ekZahl * 100) / 100 : null,
        bestand,
        warehouse_id: lagerId || null,
        storage_slot_id: platzId || null,
        notiz: notiz.trim() || null,
      }, p?.id ?? null);
      onClose();
    } finally {
      setSpeichert(false);
    }
  }

  function loeschen() {
    if (!p) return;
    if (confirm(`„${hersteller} ${modell}" (${groesse}) wirklich löschen?\n\nSteht der Reifen schon auf einem Auftrag, bleibt er als Beleg – dann den Bestand auf 0 setzen.`)) {
      void onLoeschen(p.id).then(onClose);
    }
  }

  const schalter = (an: boolean, setzen: (w: boolean) => void, titel: string, text: string) => (
    <button type="button" className="sl-chance nk-schalter ar-schalter" aria-pressed={an} disabled={nurLesen} onClick={() => setzen(!an)}>
      <span className="db-punkt-text">
        <span className="db-punkt-titel">{titel}</span>
        <span className="small">{text}</span>
      </span>
      <span className={"nk-spur" + (an ? " an" : "")} aria-hidden="true"><span /></span>
    </button>
  );

  return (
    <div className="modal-overlay auswahl-overlay" onClick={onClose}>
      <div className="auswahl-blatt am-breit ar-blatt vk-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={p ? "Verkaufsreifen" : "Reifen erfassen"}>
        <div className="ab-griff" />
        <div className="ar-blatt-kopf">
          <div className="ab-titel">{p ? `${groesseText(p)} · ${p.hersteller}` : "Reifen erfassen"}</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>

        {p && (
          <span className="small">
            {p.bestand} im Lager{reserviert > 0 ? ` · davon ${reserviert} auf offenen Aufträgen` : ""}{p.verkauft > 0 ? ` · ${p.verkauft} verkauft` : ""}
          </span>
        )}

        <div className="lg-lagerwahl ar-segment" role="group" aria-label="Zustand">
          {REIFEN_ZUSTAENDE.map((z) => (
            <button key={z} type="button" disabled={nurLesen} className={zustand === z ? "aktiv" : ""} aria-pressed={zustand === z} onClick={() => setZustand(z)}>
              {REIFEN_ZUSTAND_LABEL[z]}
            </button>
          ))}
        </div>

        <div className="ar-karte-feld">
          <div className="nk-zeile">
            <label className="nk-feld vk-groesse">
              <span>Größe</span>
              <input type="text" inputMode="text" autoCapitalize="characters" placeholder="235/55 R17" value={groesse} disabled={nurLesen}
                className={zeige("groesse") ? "ls-fehlt" : undefined} onChange={(e) => setGroesse(e.target.value)}
                onBlur={() => { if (g) setGroesse(groesseText(g)); }} autoFocus={!p} />
            </label>
            <label className="nk-feld vk-kennung">
              <span>Index</span>
              <input type="text" autoCapitalize="characters" placeholder="103V" value={kennung} disabled={nurLesen} onChange={(e) => setKennung(e.target.value)} />
            </label>
          </div>
          {zeige("groesse") ? <span className="small vk-fehler">{zeige("groesse")}</span>
            : g ? <span className="small">Verstanden: Breite {g.breite} mm{g.querschnitt != null ? `, Querschnitt ${g.querschnitt} %` : ""}, {String(g.zoll).replace(".", ",")} Zoll</span> : null}
          <div className="nk-zeile">
            <label className="nk-feld">
              <span>Hersteller</span>
              <input type="text" placeholder="Michelin" value={hersteller} disabled={nurLesen}
                className={zeige("hersteller") ? "ls-fehlt" : undefined} onChange={(e) => setHersteller(e.target.value)} />
            </label>
            <label className="nk-feld">
              <span>Modell</span>
              <input type="text" placeholder="Pilot Sport 4" value={modell} disabled={nurLesen} onChange={(e) => setModell(e.target.value)} />
            </label>
          </div>
        </div>

        <span className="op-gruppe-titel">SAISON</span>
        <div className="lg-lagerwahl ar-segment" role="group" aria-label="Saison">
          {SAISON_LISTE.map((s) => (
            <button key={s} type="button" disabled={nurLesen} className={saison === s ? "aktiv" : ""} aria-pressed={saison === s} onClick={() => setSaison(s)}>
              {SAISON_LABEL[s]}
            </button>
          ))}
        </div>

        <span className="op-gruppe-titel">BESTAND UND PREIS</span>
        <div className="ar-karte-feld">
          <div className="vk-bestand">
            <span className="vk-bestand-text">
              <b>Stück im Lager</b>
              <span className="small">{reserviert > 0 ? `mindestens ${reserviert} – so viele stehen auf offenen Aufträgen` : p ? "was jetzt noch daliegt" : "vier gleiche Reifen = ein Eintrag mit 4"}</span>
            </span>
            <span className="ls-stepper">
              <button type="button" aria-label="Eins weniger" disabled={nurLesen || bestand <= Math.max(reserviert, p ? 0 : 1)} onClick={() => setBestand(bestand - 1)}>−</button>
              <b>{bestand}</b>
              <button type="button" aria-label="Eins mehr" disabled={nurLesen || bestand >= 999} onClick={() => setBestand(bestand + 1)}>+</button>
            </span>
          </div>
          <div className="nk-zeile">
            <label className="nk-feld">
              <span>Verkauf je Stück</span>
              <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0,00" value={preis} disabled={nurLesen}
                className={zeige("preis") ? "ls-fehlt" : undefined} onChange={(e) => setPreis(e.target.value)} />
            </label>
            <label className="nk-feld">
              <span>Einkauf je Stück</span>
              <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="freiwillig" value={ek} disabled={nurLesen}
                className={zeige("ek") ? "ls-fehlt" : undefined} onChange={(e) => setEk(e.target.value)} />
            </label>
          </div>
          {preisZahl != null && preisZahl > 0 ? (
            <span className="small">
              netto · {formatEUR(preisZahl * (1 + DEFAULT_VAT_RATE / 100))} brutto je Stück
              {ekZahl != null && ekZahl > 0 ? ` · Marge ${formatEUR(preisZahl - ekZahl)} je Stück` : ""}
            </span>
          ) : <span className="small">Preise netto, wie jeder Preis in PinPoints. Der Einkauf ist freiwillig – mit ihm zeigt das Lager die Marge.</span>}
        </div>

        <span className="op-gruppe-titel">ZUSTAND DES REIFENS</span>
        <div className="ar-karte-feld">
          <div className="nk-zeile">
            <label className="nk-feld">
              <span>DOT (Woche/Jahr)</span>
              <input type="text" inputMode="numeric" placeholder="1224" maxLength={5} value={dot} disabled={nurLesen}
                className={zeige("dot") ? "ls-fehlt" : undefined} onChange={(e) => setDot(e.target.value)} />
            </label>
            <label className="nk-feld">
              <span>Profiltiefe (mm)</span>
              <input type="text" inputMode="decimal" placeholder={zustand === "neu" ? "neu" : "z. B. 5,5"} value={profil} disabled={nurLesen}
                className={zeige("profil") ? "ls-fehlt" : undefined} onChange={(e) => setProfil(e.target.value)} />
            </label>
          </div>
          {(zeige("dot") || zeige("profil")) && <span className="small vk-fehler">{zeige("dot") || zeige("profil")}</span>}
          {hinweise.map((h) => <span key={h.text} className={"small vk-hinweis" + (h.sperrt ? " sperrt" : "")}>{h.text}</span>)}
          <div className="lg-lagerwahl ar-segment" role="group" aria-label="Felge">
            {([["keine", "Nur Reifen"], ["stahl", "+ Stahlfelge"], ["alu", "+ Alufelge"]] as const).map(([w, t]) => (
              <button key={w} type="button" disabled={nurLesen} className={felge === w ? "aktiv" : ""} aria-pressed={felge === w} onClick={() => setFelge(w)}>{t}</button>
            ))}
          </div>
        </div>
        {schalter(xl, setXl, "XL (verstärkt)", "Höhere Tragfähigkeit – steht als XL oder „Reinforced“ auf der Flanke.")}
        {schalter(runflat, setRunflat, "Runflat", "Notlauftauglich – nur für Fahrzeuge, die dafür ausgelegt sind.")}

        <span className="op-gruppe-titel">WO LIEGT ER?</span>
        <div className="ar-karte-feld">
          <div className="nk-zeile">
            <label className="nk-feld">
              <span>Lager</span>
              <select value={lagerId} disabled={nurLesen} className={zeige("lager") ? "ls-fehlt" : undefined}
                onChange={(e) => { setLagerId(e.target.value); setPlatzId(""); }}>
                {!lagerId && <option value="">– Lager wählen –</option>}
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label className="nk-feld">
              <span>Platz</span>
              <select value={platzId} disabled={nurLesen} onChange={(e) => setPlatzId(e.target.value)}>
                <option value="">ohne festen Platz</option>
                {plaetze.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
              </select>
            </label>
          </div>
          {warehouses.length === 0 && <span className="small vk-fehler">Noch kein Lager angelegt – erst ein Lager anlegen (auch „Zuhause“ geht, ohne Plätze).</span>}
          <span className="small">Plätze mit einem Kundensatz stehen nicht zur Wahl. Mehrere Verkaufsreifen dürfen sich einen Platz teilen.</span>
        </div>

        <span className="op-gruppe-titel">SONST NOCH</span>
        <div className="ar-karte-feld">
          <label className="nk-feld">
            <span>EPREL-Nummer (EU-Reifenlabel, bei Neureifen)</span>
            <input type="text" inputMode="numeric" placeholder="z. B. 412345" value={eprel} disabled={nurLesen} onChange={(e) => setEprel(e.target.value)} />
          </label>
          <label className="nk-feld">
            <span>Notiz</span>
            <input type="text" placeholder="z. B. vom Kunden angekauft, kleiner Kratzer an der Flanke" value={notiz} disabled={nurLesen} onChange={(e) => setNotiz(e.target.value)} />
          </label>
        </div>

        {versucht && hatFehler && <span className="small vk-fehler">Bitte die markierten Felder prüfen.</span>}
        {!nurLesen && (
          <div className="ad-knoepfe">
            {p && darfLoeschen && <button type="button" className="es-knopf ad-gefahr" onClick={loeschen}>Löschen</button>}
            <span className="ad-luecke" />
            <button type="button" className="es-knopf" onClick={onClose}>Abbrechen</button>
            <button type="button" className="es-knopf vk-speichern" disabled={speichert} onClick={() => void speichern()}>{speichert ? "Speichert …" : "Speichern"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
