import { useState } from "react";
import type { Customer, EingelagertesRad, Saison, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { PROFIL_KRITISCH_MM, SAISON_LABEL, SAISON_LISTE } from "@/lib/constants";
import { formatDate, profilText, satzProfilMm, todayStr, type KundenZustand } from "@/lib/helpers";
import { inWochen, ortAus, plzVorschlaege, saisonGruppen } from "@/lib/saisonAnsicht";
import { datumKurz } from "@/lib/dashboard";
import { IconNavPin } from "@/components/icons";
import { ProfilMarke } from "@/components/lager/ProfilMarke";

// Die Saisonliste (docs/lager-ausbaukonzept.md, D1; neu gestaltet am 26.09.2026, Entwurf
// „I · Saisonliste").
//
// Die Frage, die dieses Geschäft zweimal im Jahr stellt: „Welche Kunden haben Winterreifen bei
// uns liegen, die sie in sechs Wochen brauchen?" Das ist keine Lagerfrage – das ist die
// Terminplanung und die Umsatzplanung für ein halbes Jahr.
//
// Die Liste ist bewusst KEIN neuer Datenbestand, sondern eine Sicht auf den vorhandenen:
// eingelagerte Sätze (aktiv) + Saison + Kunde + Fahrzeug. Seit der Neugestaltung steht sie als
// Liste zum Abtelefonieren da: je KUNDE eine Karte (mit allen seinen Sätzen darunter), gruppiert
// nach Postleitzahl – vorher war es eine breite Tabelle mit einer Zeile je Satz.

export type SaisonZeile = {
  einlagerung: TireStorage;
  cust: Customer;
  vehicle: Vehicle | null;
  slot: StorageSlot | null;
  // Die Räder dieses Satzes – leer bei Sammelerfassung. Sie kommen fertig zugeordnet aus
  // app/page.tsx, damit die Liste nicht je Zeile den ganzen Radbestand durchsucht.
  raeder: EingelagertesRad[];
};

const WOCHEN_VORSCHLAG = [2, 4, 6] as const;

export function SaisonPanel({
  zeilen, basis, saison, onSaisonChange, plz, onPlzChange, nurFaellige, onNurFaelligeChange,
  nurSchwach, onNurSchwachChange, ohneTermin, onOhneTerminChange, zustand, terminFuer,
  warehouses, onOpenCustomer, onCall, onNavigate, onWiedervorlage, schreibt,
}: {
  // Die gefilterte Liste – was angezeigt wird, was auf der Karte steht, wer die Wiedervorlage bekommt.
  zeilen: SaisonZeile[];
  // Dieselbe Sicht NUR nach Saison – der Bezugspunkt für die Antwort oben („86 Kunden haben
  // Winterreifen bei uns") und für die Gebietsvorschläge. Sie ändert sich nicht, wenn man filtert.
  basis: SaisonZeile[];
  saison: Saison | "alle";
  onSaisonChange: (s: Saison | "alle") => void;
  plz: string;
  onPlzChange: (p: string) => void;
  nurFaellige: boolean;
  onNurFaelligeChange: (b: boolean) => void;
  nurSchwach: boolean;
  onNurSchwachChange: (b: boolean) => void;
  // „Ohne Termin" (26.09.2026): Wer schon einen Wechseltermin hat, muss nicht angerufen werden.
  ohneTermin: boolean;
  onOhneTerminChange: (b: boolean) => void;
  // Der Kundenzustand (effectiveColor) – kommt von außen, weil er am Zeitraum aus den
  // Einstellungen und an den Terminen hängt.
  zustand: (c: Customer) => KundenZustand;
  // Der nächste offene Termin je Kunde (Datum, Uhrzeit), für die Statuspille.
  terminFuer: Map<string, { datum: string; zeit: string | null }>;
  warehouses: Warehouse[];
  onOpenCustomer: (id: string) => void;
  onCall: (e: React.MouseEvent, cust: Customer) => void;
  onNavigate: (e: React.MouseEvent, cust: Customer) => void;
  onWiedervorlage: (kundenIds: string[], datum: string) => Promise<void>;
  schreibt: boolean;
}) {
  const [blatt, setBlatt] = useState<null | "gebiet" | "anruf">(null);
  // Vorschlag: in sechs Wochen. Der übliche Vorlauf, um vor der Saisonspitze durch die Liste
  // zu telefonieren – änderbar, bevor es losgeht.
  const [datum, setDatum] = useState(() => inWochen(6));
  const [plzEingabe, setPlzEingabe] = useState("");
  const [erledigt, setErledigt] = useState<string | null>(null);

  // Ein Kunde kann zwei Sätze liegen haben (zwei Autos). Für die Anrufliste zählt der Mensch,
  // nicht der Satz – sonst steht er zweimal auf der Liste und wird zweimal angerufen.
  const kundenIds = Array.from(new Set(zeilen.map((z) => z.cust.id)));
  const basisKunden = Array.from(new Set(basis.map((z) => z.cust.id)));
  const basisMitTermin = basisKunden.filter((id) => terminFuer.has(id)).length;
  const gruppen = saisonGruppen(zeilen);
  const vorschlaege = plzVorschlaege(basis);

  // Bei wie vielen Kunden der Liste ist das schwächste Rad unter der kritischen Grenze? Dieselbe
  // Regel wie im Filter – einmal formuliert, damit Zahl und Filter nicht auseinanderlaufen.
  const istSchwach = (z: SaisonZeile) => {
    const mm = satzProfilMm(z.einlagerung, z.raeder);
    return mm != null && mm < PROFIL_KRITISCH_MM;
  };
  const schwacheKunden = new Set(zeilen.filter(istSchwach).map((z) => z.cust.id)).size;

  function lagerPlatz(slot: StorageSlot | null): string {
    if (!slot) return "?";
    const wh = warehouses.find((w) => w.id === slot.warehouse_id);
    return wh && warehouses.length > 1 ? `${slot.code} · ${wh.name}` : slot.code;
  }

  function status(c: Customer): { text: string; art: string } {
    const z = zustand(c);
    if (z === "termin") {
      const t = terminFuer.get(c.id);
      return { text: t ? `Termin ${datumKurz(t.datum)}${t.zeit ? " " + t.zeit.slice(0, 5) : ""}` : "Termin", art: "termin" };
    }
    if (z === "wiedervorlage") return { text: `Wiedervorlage ${c.wiedervorlage_am ? datumKurz(c.wiedervorlage_am) : ""}`.trim(), art: "wv" };
    if (z === "red") {
      return { text: c.wiedervorlage_am ? `Fällig seit ${datumKurz(c.wiedervorlage_am)}` : "Fällig", art: "faellig" };
    }
    if (z === "kein-interesse") return { text: "kein Interesse", art: "grau" };
    if (z === "green") return { text: "kontaktiert", art: "grau" };
    return { text: "", art: "grau" };
  }

  const saisonText = saison === "alle" ? "Reifen" : `${SAISON_LABEL[saison]}reifen`;

  return (
    <div className="tabpanel active">
      <div className="sl-seite">
        <div className="lg-leiste">
          <div className="lg-titel">
            <h2>Saisonliste</h2>
            <span className="lg-unter">Wer hat Reifen der kommenden Saison bei uns?</span>
          </div>
          <div className="lg-lagerwahl" role="group" aria-label="Saison">
            {(["alle", ...SAISON_LISTE] as const).map((w) => (
              <button key={w} type="button" className={saison === w ? "aktiv" : ""} onClick={() => onSaisonChange(w)}>
                {w === "alle" ? "Alle" : SAISON_LABEL[w]}
              </button>
            ))}
          </div>
        </div>

        {/* Die Antwort steht als Satz da und nicht als Zahl in einer Ecke. */}
        <div className="db-naechster sl-antwort">
          <span className="db-n-wann">{saison === "alle" ? "ALLE EINGELAGERTEN SÄTZE" : `${SAISON_LABEL[saison].toUpperCase()} · KOMMENDE SAISON`}</span>
          <span className="sl-antwort-text">
            <b>{basisKunden.length}</b> {basisKunden.length === 1 ? "Kunde hat" : "Kunden haben"} {saisonText} bei uns liegen
            {basis.length !== basisKunden.length ? ` · ${basis.length} Sätze` : ""}
          </span>
          {basisKunden.length > 0 && (
            <>
              <span className="sl-balken"><span style={{ width: `${Math.round((basisMitTermin / basisKunden.length) * 100)}%` }} /></span>
              <span className="db-n-unter">{basisMitTermin} {basisMitTermin === 1 ? "hat" : "haben"} schon einen Wechseltermin · {basisKunden.length - basisMitTermin} noch nicht</span>
            </>
          )}
          {kundenIds.length > 0 && (
            <div className="db-n-knoepfe sl-knopf">
              <button type="button" className="primaer" disabled={schreibt} onClick={() => { setErledigt(null); setBlatt("anruf"); }}>
                {schreibt ? "Wird gesetzt …" : `Anrufliste erzeugen (${kundenIds.length})`}
              </button>
            </div>
          )}
        </div>

        {erledigt && (
          <div className="lg-hinweis sl-erledigt" role="status">
            <span>{erledigt}</span>
            <button type="button" onClick={() => setErledigt(null)} aria-label="Hinweis schließen">✕</button>
          </div>
        )}

        {/* Der eigentliche Verkaufsanlass: nicht „wer hat Reifen bei uns", sondern „bei wem reicht
            das Profil nicht mehr durch die nächste Saison". */}
        {!nurSchwach && schwacheKunden > 0 && (
          <button type="button" className="sl-chance" onClick={() => onNurSchwachChange(true)}>
            <span className="db-punkt-zahl rot">{schwacheKunden}</span>
            <span className="db-punkt-text">
              <span className="db-punkt-titel">Neue Reifen fällig</span>
              <span className="small">schwächstes Rad unter {profilText(PROFIL_KRITISCH_MM)} – beim Anruf gleich anbieten</span>
            </span>
            <span className="db-pfeil" aria-hidden="true">›</span>
          </button>
        )}

        <div className="pl-filter" role="group" aria-label="Filter">
          <button type="button" className={"pl-pille" + (ohneTermin ? " aktiv" : "")} aria-pressed={ohneTermin} onClick={() => onOhneTerminChange(!ohneTermin)}>Ohne Termin</button>
          <button type="button" className={"pl-pille" + (nurFaellige ? " aktiv" : "")} aria-pressed={nurFaellige} onClick={() => onNurFaelligeChange(!nurFaellige)}>Fällig</button>
          <button type="button" className={"pl-pille" + (nurSchwach ? " aktiv" : "")} aria-pressed={nurSchwach} onClick={() => onNurSchwachChange(!nurSchwach)}>Profil unter {profilText(PROFIL_KRITISCH_MM)}</button>
          <button type="button" className={"pl-pille" + (plz ? " aktiv" : "")} onClick={() => { setPlzEingabe(plz); setBlatt("gebiet"); }}>
            {plz ? `PLZ ${plz} …` : "Gebiet"} <span aria-hidden="true">▾</span>
          </button>
        </div>

        {zeilen.length === 0 && (
          <div className="db-karte">
            <div className="db-leer">
              Kein eingelagerter Satz passt zu dieser Auswahl. Sätze ohne Saison stehen unter
              &bdquo;Alle&ldquo; – die Saison wird beim Einlagern im Auftrag gesetzt.
            </div>
          </div>
        )}

        {gruppen.map((g) => (
          <div key={g.plz ?? "ohne"} className="sl-gruppe">
            <div className="sl-gruppe-kopf">
              <span className="lg-gruppe-titel">{g.plz ? `${g.plz}${g.ort ? " " + g.ort.toUpperCase() : ""}` : "OHNE POSTLEITZAHL"}</span>
              <span className="small">{g.kunden.length} {g.kunden.length === 1 ? "Kunde" : "Kunden"}</span>
            </div>
            {g.kunden.map(({ kunde, saetze }) => {
              const st = status(kunde);
              return (
                <div key={kunde.id} className="sl-kunde">
                  <div className="sl-kunde-kopf">
                    <button type="button" className="sl-kunde-name" onClick={() => onOpenCustomer(kunde.id)} title="Kundenfenster öffnen">
                      <b>{kunde.name}</b>
                      <span className="small">{ortAus(kunde.address) ?? kunde.address}</span>
                    </button>
                    {st.text && <span className={`sl-status ${st.art}`}>{st.text}</span>}
                    {kunde.address.trim() && (
                      <button type="button" className="call-icon-btn nav-icon-btn" title="Navigation starten" onClick={(e) => onNavigate(e, kunde)}>
                        <IconNavPin />
                      </button>
                    )}
                    <button type="button" className="call-icon-btn" title="Anrufen" onClick={(e) => onCall(e, kunde)}>📞</button>
                  </div>
                  {saetze.map((z) => (
                    <button key={z.einlagerung.id} type="button" className="sl-satz" onClick={() => onOpenCustomer(kunde.id)}>
                      <span className="lg-code">{lagerPlatz(z.slot)}</span>
                      <span className="lg-zeile-text">
                        <span className="sl-satz-fahrzeug">
                          {z.vehicle ? [z.vehicle.license_plate, z.vehicle.make_model].filter(Boolean).join(" · ") || "Fahrzeug ohne Kennzeichen" : "kein Fahrzeug hinterlegt"}
                        </span>
                        <span className="lg-zeile-info">
                          {[z.einlagerung.saison ? SAISON_LABEL[z.einlagerung.saison] : "ohne Saison", z.vehicle?.tire_size, z.einlagerung.dot_date ? `DOT ${z.einlagerung.dot_date}` : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <ProfilMarke satz={z.einlagerung} raeder={z.raeder} praefix="" />
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}

        {zeilen.length > 0 && <span className="small sl-fuss">Die Karte zeigt in diesem Reiter nur die Kunden aus der Liste.</span>}
      </div>

      {blatt && (
        <div className="modal-overlay auswahl-overlay" onClick={() => setBlatt(null)}>
          <div className="auswahl-blatt lg-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={blatt === "gebiet" ? "Gebiet" : "Anrufliste erzeugen"}>
            <div className="ab-griff" />
            {blatt === "gebiet" && (
              <>
                <div className="ab-titel">Gebiet</div>
                <span className="small">Postleitzahl beginnt mit – antippen oder selbst eingeben.</span>
                <button type="button" className={"ab-option" + (!plz ? " aktiv" : "")} onClick={() => { onPlzChange(""); setBlatt(null); }}>
                  <span className="ab-text">Alle Gebiete</span><span className="small">{basisKunden.length} Kunden</span>
                </button>
                {vorschlaege.map((v) => (
                  <button key={v.praefix} type="button" className={"ab-option" + (plz === v.praefix ? " aktiv" : "")} onClick={() => { onPlzChange(v.praefix); setBlatt(null); }}>
                    <span className="ab-text">{v.praefix}{v.ort ? ` · ${v.ort}` : ""}</span><span className="small">{v.kunden} {v.kunden === 1 ? "Kunde" : "Kunden"}</span>
                  </button>
                ))}
                <div className="field" style={{ marginTop: 4 }}>
                  <label>Eigene Eingabe</label>
                  <div className="row">
                    <input type="text" inputMode="numeric" placeholder="z. B. 904" value={plzEingabe}
                      onChange={(e) => setPlzEingabe(e.target.value.replace(/\D/g, "").slice(0, 5))}
                      onKeyDown={(e) => { if (e.key === "Enter") { onPlzChange(plzEingabe); setBlatt(null); } }} />
                    <button type="button" className="btn-primary" style={{ flex: "0 0 auto" }} onClick={() => { onPlzChange(plzEingabe); setBlatt(null); }}>Übernehmen</button>
                  </div>
                </div>
              </>
            )}
            {blatt === "anruf" && (
              <>
                <div className="ab-titel">Anrufliste erzeugen</div>
                <span className="sl-blatt-text">
                  Setzt bei {kundenIds.length} {kundenIds.length === 1 ? "Kunden" : "Kunden"} aus der Liste die Wiedervorlage.
                  Ab dem Tag stehen sie in der Kundenliste als fällig.
                </span>
                <div className="sl-wochen">
                  {WOCHEN_VORSCHLAG.map((w) => {
                    const d = inWochen(w);
                    return (
                      <button key={w} type="button" className={"sl-woche" + (datum === d ? " aktiv" : "")} onClick={() => setDatum(d)}>
                        <b>in {w} Wochen</b><span>{datumKurz(d)}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Oder ein anderes Datum</label>
                  <input type="date" min={todayStr()} value={datum} onChange={(e) => setDatum(e.target.value)} />
                </div>
                {/* Zwei Entscheidungen aus docs/lager.md, die hier jemand wissen sollte, bevor er
                    auf einen Schlag mehrere hundert Kunden ändert. */}
                <div className="lg-notiz">
                  Nur die Wiedervorlage wird gesetzt, der Kontaktstatus bleibt – es wurde ja noch nicht
                  angerufen. Ein Kunde mit zwei Sätzen steht einmal auf der Liste.
                </div>
                <button type="button" className="lg-knopf primaer gross" disabled={schreibt || !datum}
                  onClick={async () => {
                    setBlatt(null);
                    try {
                      await onWiedervorlage(kundenIds, datum);
                      setErledigt(`${kundenIds.length} ${kundenIds.length === 1 ? "Kunde steht" : "Kunden stehen"} ab ${formatDate(datum)} wieder als fällig in der Kundenliste.`);
                    } catch {
                      setErledigt("Die Wiedervorlage konnte nicht gesetzt werden – bitte noch einmal versuchen.");
                    }
                  }}>
                  Wiedervorlage auf {datum ? datumKurz(datum) : "…"} setzen
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
