import { useEffect, useRef, useState } from "react";
import type { EingelagertesRad, Erfassungsart, Felge, RadPosition } from "@/lib/types";
import {
  RAD_POSITIONEN, RAD_POSITION_LABEL, FELGEN, FELGE_LABEL,
  PROFIL_HINWEIS_MM, PROFIL_KRITISCH_MM, PROFIL_GESETZLICH_MM, PROFIL_MAX_MM, PROFIL_SCHNELLWERTE_MM,
} from "@/lib/constants";
import { profilAusText, profilLage, profilText, profilZahl, satzProfilMm } from "@/lib/helpers";
import type { RadFelder } from "@/lib/api/lager";

// Die vier Räder eines eingelagerten Satzes – als Bild statt als Formular. Seit v89
// (29.09.2026) im Stil der neuen Seiten, Entwurf „X1 · Radbild" auf der Design-Fläche.
//
// Warum ein Bild: Vier Zeilen „VL/VR/HL/HR" verlangen bei jedem Blick eine Übersetzung – man
// muss sich das Auto dazu denken. Im Bild ist die Zuordnung die Position selbst; man tippt das
// Rad an, das man gerade in der Hand hat. Die Farbe zeigt sofort, wo es eng wird.
//
// Was sich gegenüber v88 geändert hat:
//   * Die Eingabe steht UNTER dem Bild und bleibt offen – kein „Übernehmen" je Rad mehr. Der
//     Wert wird kurz nach der letzten Änderung von selbst gespeichert, spätestens beim Wechsel
//     zum nächsten Rad.
//   * Schnellwerte 1–8 mm (Wunsch vom 29.09.2026) für den großen Sprung, −/+ in 0,1-Schritten
//     für die Feinkorrektur, das Feld zum Tippen bleibt. Alle drei Wege gehören zu verschiedenen
//     Bewegungen (siehe `ProfilEingabe`).
//   * „Weiter zu VR ›" führt Rad für Rad durch, „Für alle vier" übernimmt einen Wert für alle.
//   * Felge, Sensor, Größe, DOT und Bemerkung klappen unter „Mehr zu diesem Rad" auf.
//
// Die Ampel meint den ZUSTAND (Profiltiefe), nicht die Belegung – dieselbe Bedeutung wie beim
// Kundenzustand und damit kein zweites Vokabular für dieselben Farben (docs/design-system.md).

const GRENZEN = { hinweis: PROFIL_HINWEIS_MM, kritisch: PROFIL_KRITISCH_MM };
// So lange nach der letzten Änderung wird gespeichert. Kurz genug, dass nichts verloren geht,
// wenn das Fenster zugeht; lang genug, dass fünf Tipper auf „+" EIN Protokolleintrag sind.
const SPEICHERN_NACH_MS = 700;

// ---------------------------------------------------------------- Eine Profiltiefe eingeben
//
// Für ein Rad und für den ganzen Satz dieselbe Eingabe. Drei Wege, jeder für eine Bewegung:
//   * Schnellwert 1–8: der große Sprung („6,0 auf 1,0 sind fünfzig Tipper", gemeldet 21.09.2026)
//   * −/+ in 0,1-Schritten: die Feinkorrektur, auch mit Handschuh
//   * das Feld: wer die Zahl lieber tippt
// `key` von außen setzen, wenn ein anderes Rad gemeint ist – dann beginnt das Feld neu.
export function ProfilEingabe({ wert, gesperrt, onWert }: {
  wert: number | null;
  gesperrt?: boolean;
  onWert: (mm: number | null) => void;
}) {
  // Was im Feld STEHT, während getippt wird – „1," ist unterwegs ein gültiger Zwischenstand,
  // aber keine Zahl.
  const [text, setText] = useState(wert == null ? "" : profilZahl(wert));
  const lage = profilLage(wert, GRENZEN);

  function setzen(mm: number) {
    // Auf eine Nachkommastelle runden: 5.2 + 0.1 ergibt in Gleitkomma sonst 5.300000000000001.
    const rund = Math.min(PROFIL_MAX_MM, Math.max(0, Math.round(mm * 10) / 10));
    setText(profilZahl(rund));
    onWert(rund);
  }
  function stufe(delta: number) {
    // Grundlage ist, was IM FELD steht – wer 2,0 tippt und sofort „+" drückt, erwartet 2,1.
    const basis = profilAusText(text, PROFIL_MAX_MM) ?? wert ?? 5;
    setzen(basis + delta);
  }
  function textUebernehmen() {
    if (!text.trim()) { onWert(null); return; }
    const zahl = profilAusText(text, PROFIL_MAX_MM);
    if (zahl == null) { setText(wert == null ? "" : profilZahl(wert)); return; }
    setzen(zahl);
  }

  return (
    <div className="rm-eingabe">
      <div className="rm-stufen">
        <button type="button" className="rm-stufe" disabled={gesperrt} onClick={() => stufe(-0.1)} aria-label="0,1 mm weniger">−</button>
        <label className={"rm-wert rm-" + lage}>
          <input
            // `text` mit `inputMode="decimal"`, nicht `type="number"`: Ein Zahlenfeld nimmt in
            // deutscher Eingabe kein Komma an.
            type="text" className="rm-feld" inputMode="decimal" enterKeyHint="done" aria-label="Profiltiefe in Millimetern"
            placeholder="–" value={text} disabled={gesperrt}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={textUebernehmen}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
          />
          <span>mm</span>
        </label>
        <button type="button" className="rm-stufe" disabled={gesperrt} onClick={() => stufe(0.1)} aria-label="0,1 mm mehr">+</button>
      </div>
      <div className="rm-schnell" role="group" aria-label="Schnellwerte in Millimetern">
        {PROFIL_SCHNELLWERTE_MM.map((w) => (
          <button key={w} type="button" disabled={gesperrt} className={wert === w ? "an" : ""} aria-pressed={wert === w} onClick={() => setzen(w)}>{w}</button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Ein Wert für den ganzen Satz
//
// Dieselbe Eingabe auf warmem Grund. `onSpeichern` wird erst kurz nach der letzten Änderung
// gerufen (wie im Radbild) – fünf Tipper auf „+" sind ein Speichervorgang, kein Zwischenwert
// steht eine Sekunde lang als Wahrheit in der Datenbank. Ohne `onSpeichern` (Formular, das erst
// mit seinem eigenen Knopf speichert) geht jeder Wert sofort an `onWert`.
export function SatzProfil({ wert, gesperrt, onWert, onSpeichern }: {
  wert: number | null;
  gesperrt?: boolean;
  onWert?: (mm: number | null) => void;
  onSpeichern?: (mm: number | null) => Promise<void>;
}) {
  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offen = useRef<{ mm: number | null } | null>(null);
  const speichernRef = useRef(onSpeichern);
  useEffect(() => { speichernRef.current = onSpeichern; }, [onSpeichern]);
  const [angezeigt, setAngezeigt] = useState(wert);

  useEffect(() => {
    const warten = offen;
    const zeit = uhr;
    return () => {
      if (zeit.current) clearTimeout(zeit.current);
      if (warten.current) void speichernRef.current?.(warten.current.mm);
    };
  }, []);

  function geaendert(mm: number | null) {
    setAngezeigt(mm);
    onWert?.(mm);
    if (!onSpeichern) return;
    offen.current = { mm };
    if (uhr.current) clearTimeout(uhr.current);
    uhr.current = setTimeout(() => {
      uhr.current = null;
      const was = offen.current;
      offen.current = null;
      if (was) void speichernRef.current?.(was.mm);
    }, SPEICHERN_NACH_MS);
  }

  return (
    <div className="rm-satz">
      <ProfilEingabe wert={angezeigt} gesperrt={gesperrt} onWert={geaendert} />
      <span className="rm-satz-hinweis">
        Etwa so viel haben alle vier. Für ein Verkaufsgespräch (&bdquo;hinten links 3,1 mm&ldquo;) lieber je Rad messen.
      </span>
    </div>
  );
}

// Die Wahl zwischen beiden Arten – dieselben zwei Knöpfe im Lager und im Auftragsfenster.
export function ErfassungsWahl({ einzeln, gesperrt, onWahl }: {
  einzeln: boolean;
  gesperrt?: boolean;
  onWahl: (art: Erfassungsart) => void;
}) {
  return (
    <div className="lg-lagerwahl ar-segment" role="group" aria-label="Profiltiefe erfassen">
      <button type="button" disabled={gesperrt} className={!einzeln ? "aktiv" : ""} aria-pressed={!einzeln} onClick={() => onWahl("sammel")}>
        Ein Wert für den Satz
      </button>
      <button type="button" disabled={gesperrt} className={einzeln ? "aktiv" : ""} aria-pressed={einzeln} onClick={() => onWahl("einzeln")}>
        Je Rad messen
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Das Radbild
export function RadBild({ raeder, anzahlRaeder, gesperrt, onSpeichern, onEntfernen }: {
  raeder: EingelagertesRad[];
  anzahlRaeder: number;
  gesperrt: boolean;
  // Legt an oder ändert – je nachdem, ob für diese Position schon ein Rad existiert.
  onSpeichern: (position: RadPosition, felder: Partial<RadFelder>) => Promise<void>;
  onEntfernen: (radId: string) => Promise<void>;
}) {
  const radAn = (p: RadPosition) => raeder.find((r) => r.position === p) || null;
  // Welches Rad gerade bearbeitet wird: vorgeschlagen das erste noch ungemessene.
  const [aktiv, setAktiv] = useState<RadPosition | null>(
    () => RAD_POSITIONEN.find((p) => radAn(p)?.profiltiefe_mm == null) ?? "VL"
  );
  // Was hier eingegeben wurde, je Rad. Bleibt stehen, auch nachdem gespeichert ist: Bis die
  // neu geladenen Räder da sind, zeigte das Bild sonst eine halbe Sekunde lang wieder „–".
  // Scheitert das Speichern, fällt der Eintrag weg und das Bild zeigt wieder den Stand der
  // Datenbank.
  const [entwuerfe, setEntwuerfe] = useState<Partial<Record<RadPosition, number | null>>>({});
  const entwurfWeg = (pos: RadPosition) => setEntwuerfe((e) => { const n = { ...e }; delete n[pos]; return n; });
  const [speichert, setSpeichert] = useState(false);
  const [mehrOffen, setMehrOffen] = useState(false);
  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offen = useRef<{ pos: RadPosition; mm: number | null } | null>(null);
  const speichernRef = useRef(onSpeichern);
  useEffect(() => { speichernRef.current = onSpeichern; }, [onSpeichern]);

  async function jetztSpeichern() {
    if (uhr.current) { clearTimeout(uhr.current); uhr.current = null; }
    const was = offen.current;
    offen.current = null;
    if (!was) return;
    setSpeichert(true);
    try {
      await speichernRef.current(was.pos, { profiltiefeMm: was.mm == null ? "" : String(was.mm) });
    } catch (fehler) {
      // Die Meldung zeigt die Seite (unhandledrejection in app/page.tsx) – hier nur das Bild
      // auf den Stand der Datenbank zurück.
      entwurfWeg(was.pos);
      throw fehler;
    } finally {
      setSpeichert(false);
    }
  }

  // Beim Schließen des Fensters nichts verlieren: Was noch wartet, geht sofort hinaus.
  useEffect(() => {
    const warten = offen;
    const zeit = uhr;
    return () => {
      if (zeit.current) clearTimeout(zeit.current);
      const was = warten.current;
      if (was) void speichernRef.current(was.pos, { profiltiefeMm: was.mm == null ? "" : String(was.mm) });
    };
  }, []);

  function wertGeaendert(pos: RadPosition, mm: number | null) {
    setEntwuerfe((e) => ({ ...e, [pos]: mm }));
    offen.current = { pos, mm };
    if (uhr.current) clearTimeout(uhr.current);
    uhr.current = setTimeout(() => { void jetztSpeichern(); }, SPEICHERN_NACH_MS);
  }

  const mmVon = (p: RadPosition): number | null =>
    p in entwuerfe ? entwuerfe[p] ?? null : radAn(p)?.profiltiefe_mm ?? null;

  async function wechseln(p: RadPosition | null) {
    await jetztSpeichern();
    setMehrOffen(false);
    setAktiv(p);
  }

  async function fuerAlle() {
    if (!aktiv) return;
    const mm = mmVon(aktiv);
    if (mm == null) return;
    await jetztSpeichern();
    setSpeichert(true);
    try {
      for (const p of RAD_POSITIONEN) {
        if (radAn(p)?.profiltiefe_mm === mm) continue;
        setEntwuerfe((e) => ({ ...e, [p]: mm }));
        try {
          await onSpeichern(p, { profiltiefeMm: String(mm) });
        } catch (fehler) {
          entwurfWeg(p);
          throw fehler;
        }
      }
    } finally {
      setSpeichert(false);
    }
  }

  const ohnePosition = raeder.filter((r) => !r.position);
  const gemessen = RAD_POSITIONEN.filter((p) => mmVon(p) != null);
  const gesamt = satzProfilMm({ erfassungsart: "einzeln", profiltiefe_mm: null },
    RAD_POSITIONEN.map((p) => ({ profiltiefe_mm: mmVon(p) })));
  const schwaechstes = gemessen.slice().sort((a, b) => (mmVon(a) ?? 0) - (mmVon(b) ?? 0))[0];
  const naechstes = aktiv ? RAD_POSITIONEN[RAD_POSITIONEN.indexOf(aktiv) + 1] ?? null : null;
  const rad = aktiv ? radAn(aktiv) : null;

  return (
    <div className="rm">
      <div className="rm-auto">
        <div className="rm-karosserie" aria-hidden="true"><span>VORNE</span></div>
        {RAD_POSITIONEN.map((p) => {
          const mm = mmVon(p);
          return (
            <button
              key={p} type="button" disabled={gesperrt}
              className={`rm-rad rm-${p.toLowerCase()} rm-${profilLage(mm, GRENZEN)}${mm != null && mm < PROFIL_GESETZLICH_MM ? " rm-unter" : ""}${aktiv === p ? " aktiv" : ""}`}
              onClick={() => void wechseln(aktiv === p ? null : p)}
              aria-pressed={aktiv === p}
              title={`${RAD_POSITION_LABEL[p]}${mm != null ? ` – ${profilText(mm)}` : " – noch nicht gemessen"}`}
            >
              <span className="rm-pos">{p}</span>
              <b>{mm != null ? profilZahl(mm) : "–"}</b>
              <span className="rm-einheit">{mm != null ? "mm" : "antippen"}</span>
            </button>
          );
        })}
      </div>

      {aktiv && (
        <div className="rm-panel">
          <div className="rm-panel-kopf">
            <b>{aktiv} · {RAD_POSITION_LABEL[aktiv]}</b>
            <span className="small">{speichert ? "speichert …" : `${gemessen.length} von 4 gemessen`}</span>
          </div>
          <ProfilEingabe key={aktiv} wert={mmVon(aktiv)} gesperrt={gesperrt} onWert={(mm) => wertGeaendert(aktiv, mm)} />
          <div className="rm-knoepfe">
            <button type="button" className="rm-knopf" disabled={gesperrt || mmVon(aktiv) == null} onClick={() => void fuerAlle()}>Für alle vier</button>
            <button type="button" className="rm-knopf navy" disabled={gesperrt} onClick={() => void wechseln(naechstes)}>
              {naechstes ? `Weiter zu ${naechstes} ›` : "Fertig"}
            </button>
          </div>
          <button type="button" className="lg-link" onClick={() => setMehrOffen(!mehrOffen)} aria-expanded={mehrOffen}>
            {mehrOffen ? "Weniger ▾" : "Mehr zu diesem Rad: Felge, RDKS, DOT … ›"}
          </button>
          {mehrOffen && (
            <RadDetails
              key={aktiv + (rad?.id ?? "")}
              rad={rad}
              gesperrt={gesperrt}
              onSpeichern={(felder) => onSpeichern(aktiv, felder)}
              onEntfernen={rad ? () => onEntfernen(rad.id) : undefined}
            />
          )}
        </div>
      )}

      <span className={"rm-zusammen" + (gesamt != null && gesamt < PROFIL_KRITISCH_MM ? " rot" : "")}>
        {gesamt == null || !schwaechstes
          ? "Noch kein Rad gemessen."
          : `Schwächstes Rad: ${schwaechstes} ${profilText(gesamt)}`
            + (gesamt < PROFIL_GESETZLICH_MM ? " – unter dem gesetzlichen Minimum"
              : gesamt < PROFIL_KRITISCH_MM ? " – Kunde auf neue Reifen ansprechen" : "")}
      </span>

      {/* Räder ohne Position: das lose Ersatzrad. Sie haben im Bild keinen Platz, zählen aber mit. */}
      {ohnePosition.length > 0 && (
        <span className="small">
          {ohnePosition.length} {ohnePosition.length === 1 ? "Rad" : "Räder"} ohne Position:{" "}
          {ohnePosition.map((r) => profilText(r.profiltiefe_mm)).join(" · ")}
        </span>
      )}
      {raeder.length > anzahlRaeder && (
        <span className="small rm-warnung">Es sind mehr Räder erfasst als vorgesehen ({raeder.length} von {anzahlRaeder}).</span>
      )}
    </div>
  );
}

// Was außer der Profiltiefe zu einem Rad gehört. Jede Angabe wird beim Verlassen des Feldes
// bzw. beim Antippen gespeichert – dieselbe Regel wie oben, ohne eigenen Knopf.
// Die Bemerkung stand bis v114 hier; seit Migration 71 ist sie die „Notiz je Rad“ am Satz
// (ReifenNotizen.tsx) – auch ohne Einzelmessung, und sie bleibt beim Umschalten erhalten.
function RadDetails({ rad, gesperrt, onSpeichern, onEntfernen }: {
  rad: EingelagertesRad | null;
  gesperrt: boolean;
  onSpeichern: (felder: Partial<RadFelder>) => Promise<void>;
  onEntfernen?: () => Promise<void>;
}) {
  const [felge, setFelge] = useState<Felge | null>(rad?.felge ?? null);
  const [sensor, setSensor] = useState(rad?.sensor ?? false);
  const text = (feld: "reifengroesse" | "dotDate", alt: string | null) => ({
    defaultValue: alt ?? "",
    disabled: gesperrt,
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      if (e.target.value.trim() !== (alt ?? "").trim()) void onSpeichern({ [feld]: e.target.value.trim() });
    },
  });
  return (
    <div className="rm-details">
      <div className="lg-lagerwahl ar-segment" role="group" aria-label="Felge">
        {FELGEN.map((f) => (
          <button key={f} type="button" disabled={gesperrt} className={felge === f ? "aktiv" : ""} aria-pressed={felge === f}
            onClick={() => { const neu = felge === f ? null : f; setFelge(neu); void onSpeichern({ felge: neu }); }}>
            {FELGE_LABEL[f]}
          </button>
        ))}
      </div>
      <button type="button" className="sl-chance nk-schalter ar-schalter" aria-pressed={sensor} disabled={gesperrt}
        onClick={() => { setSensor(!sensor); void onSpeichern({ sensor: !sensor }); }}>
        <span className="db-punkt-text"><span className="db-punkt-titel">RDKS-Sensor</span></span>
        <span className={"nk-spur" + (sensor ? " an" : "")} aria-hidden="true"><span /></span>
      </button>
      <div className="nk-zeile">
        <label className="nk-feld"><span>Reifengröße</span><input type="text" placeholder="205/55 R16" {...text("reifengroesse", rad?.reifengroesse ?? null)} /></label>
        <label className="nk-feld"><span>DOT</span><input type="text" inputMode="numeric" placeholder="2523" {...text("dotDate", rad?.dot_date ?? null)} /></label>
      </div>
      {onEntfernen && (
        <button type="button" className="lg-link rm-entfernen" disabled={gesperrt} onClick={() => void onEntfernen()}>Messung dieses Rades entfernen</button>
      )}
    </div>
  );
}
