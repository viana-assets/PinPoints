import { initialen, personenFarbe } from "@/lib/chat";
import {
  dauerText, korrekturTag, korrekturText, monatTitel, schichtSpanne, tagSchluessel, tagTitel, uhrzeitVon, ZEIT_HINWEIS_TEXT,
  type MonatsAuswertung, type MonatsTag, type TagHinweis, type ZeitKorrektur, type ZeitPerson,
} from "@/lib/zeiterfassung";

// Monatsblick, Urlaubszeilen und Korrekturen der Zeiterfassung (Migration 83, v136, Fahrplan E20).
// Rein darstellend – Daten und Handlungen kommen aus ZeitPanel.

const HINWEIS_KLASSE: Record<TagHinweis, string> = { pause: "gelb", lang: "gelb", offen: "rot", korrigiert: "blau" };

export function Marken({ hinweise, laeuft, urlaubMs }: { hinweise: TagHinweis[]; laeuft?: boolean; urlaubMs?: number }) {
  return (
    <>
      {laeuft && <span className="zt-marke gruen">läuft</span>}
      {!!urlaubMs && <span className="zt-marke urlaub">Urlaub</span>}
      {hinweise.map((h) => <span key={h} className={`zt-marke ${HINWEIS_KLASSE[h]}`}>{ZEIT_HINWEIS_TEXT[h]}</span>)}
    </>
  );
}

export function MonatSummen({ m }: { m: MonatsAuswertung }) {
  return (
    <div className="zt-summen zt-summen-monat">
      <div><b>{dauerText(m.arbeitMs)} h</b><span>Arbeitszeit</span></div>
      <div><b>{dauerText(m.pauseMs)} h</b><span>Pausen</span></div>
      <div><b>{dauerText(m.urlaubMs)} h</b><span>Urlaub{m.urlaubstage ? ` · ${m.urlaubstage} ${m.urlaubstage === 1 ? "Tag" : "Tage"}` : ""}</span></div>
      {m.heimfahrten > 0 && <div><b>{dauerText(m.heimfahrtMs)} h</b><span>davon Heimfahrt · {m.heimfahrten}×</span></div>}
      <div><b>{m.arbeitstage}</b><span>{m.arbeitstage === 1 ? "Arbeitstag" : "Arbeitstage"}</span></div>
    </div>
  );
}

// Die Tage des Monats mit Eintrag, neueste zuerst; ein Tipp öffnet den Tag.
export function MonatTagListe({ m, onTag }: { m: MonatsAuswertung; onTag: (tag: string) => void }) {
  const tage = m.tage.filter((x) => x.schichten.length > 0 || x.urlaubMs > 0).reverse();
  if (tage.length === 0) return <div className="zt-hinweis info">In {monatTitel(m.monat)} ist nichts eingetragen.</div>;
  return (
    <>
      {tage.map((x) => (
        <button key={x.tag} type="button" className="zt-tag" onClick={() => onTag(x.tag)}>
          <span className="zt-tag-kopf">
            <span>{tagTitel(x.tag)} <Marken hinweise={x.hinweise} laeuft={x.laeuft} urlaubMs={x.urlaubMs} /></span>
            <em>{dauerText(x.arbeitMs + x.urlaubMs)} h</em>
          </span>
          <span className="zt-tag-unter">{tagZeile(x)}</span>
        </button>
      ))}
    </>
  );
}

export function tagZeile(x: MonatsTag): string {
  const teile: string[] = [];
  if (x.schichten.length) teile.push(`${x.schichten.map(schichtSpanne).join(" · ")} · Pause ${dauerText(x.pauseMs)}`);
  if (x.heimfahrtMs) teile.push(`Heimfahrt ${dauerText(x.heimfahrtMs)} h`);
  if (x.urlaubMs) teile.push(`Urlaub ${dauerText(x.urlaubMs)} h`);
  return teile.join(" · ");
}

// Die Monatstabelle aller: je Person eine Zeile, ein Tipp öffnet den Monat der Person.
export function MonatAlleTabelle({ zeilen, onPerson }: {
  zeilen: { person: ZeitPerson; monat: MonatsAuswertung }[];
  onPerson: (person: ZeitPerson) => void;
}) {
  if (zeilen.length === 0) return <div className="zt-hinweis info">Noch niemand mit Zugang zur Zeiterfassung.</div>;
  const summe = (f: (m: MonatsAuswertung) => number) => zeilen.reduce((s, z) => s + f(z.monat), 0);
  return (
    <div className="zt-tabelle" role="table" aria-label="Monatsübersicht aller">
      <div className="zt-m kopf" role="row">
        <span role="columnheader">Person</span>
        <span role="columnheader">Tage</span>
        <span role="columnheader">Arbeit</span>
        <span role="columnheader" className="zt-breit">Pausen</span>
        <span role="columnheader">Urlaub</span>
        <span role="columnheader" className="zt-breit" title="Heimfahrten (gutgeschrieben, in der Arbeit enthalten)">Heimf.</span>
        <span role="columnheader">Σ</span>
        <span role="columnheader" className="zt-breit">Hinweise</span>
      </div>
      {zeilen.map(({ person, monat: m }) => (
        <button key={person.id} type="button" className="zt-m zt-m-zeile" role="row" onClick={() => onPerson(person)}
          aria-label={`${person.name}: ${dauerText(m.arbeitMs)} h Arbeit, ${dauerText(m.urlaubMs)} h Urlaub`}>
          <span role="rowheader" className="zt-person"><span className="ch-av" style={{ background: personenFarbe(person.id) }}>{initialen(person.name)}</span><span>{person.name}</span></span>
          <span role="cell">{m.arbeitstage}</span>
          <span role="cell">{dauerText(m.arbeitMs)}</span>
          <span role="cell" className="zt-breit">{dauerText(m.pauseMs)}</span>
          <span role="cell">{m.urlaubMs ? dauerText(m.urlaubMs) : "–"}</span>
          <span role="cell" className="zt-breit">{m.heimfahrten ? `${m.heimfahrten}×` : "–"}</span>
          <span role="cell" className="zt-summe">{dauerText(m.arbeitMs + m.urlaubMs)}</span>
          <span role="cell" className={"zt-breit" + (m.hinweise ? " zt-warn-text" : "")}>{m.hinweise ? `${m.hinweise} ${m.hinweise === 1 ? "Tag" : "Tage"}` : "–"}</span>
        </button>
      ))}
      <div className="zt-m kopf" role="row">
        <span role="rowheader">Summe</span>
        <span role="cell">{summe((m) => m.arbeitstage)}</span>
        <span role="cell">{dauerText(summe((m) => m.arbeitMs))}</span>
        <span role="cell" className="zt-breit">{dauerText(summe((m) => m.pauseMs))}</span>
        <span role="cell">{dauerText(summe((m) => m.urlaubMs))}</span>
        <span role="cell" className="zt-breit">{summe((m) => m.heimfahrten) ? `${summe((m) => m.heimfahrten)}×` : "–"}</span>
        <span role="cell" className="zt-summe">{dauerText(summe((m) => m.arbeitMs + m.urlaubMs))}</span>
        <span role="cell" className="zt-breit">{summe((m) => m.hinweise) || "–"}</span>
      </div>
    </div>
  );
}

// Die Korrekturen zu einem Tag: wer, wann, was, warum. Sichtbar für die Person selbst und für
// „Zeiten aller“ – dieselbe Regel wie für die Zeiten (RLS in Migration 82).
export function KorrekturListe({ korrekturen, tag, nameVon }: {
  korrekturen: ZeitKorrektur[];
  tag: string;
  nameVon: (id: string | null) => string;
}) {
  const liste = korrekturen.filter((k) => korrekturTag(k) === tag);
  if (liste.length === 0) return null;
  return (
    <div className="zt-korrekturen">
      <div className="bl-gruppe-titel">KORREKTUREN</div>
      {liste.map((k) => (
        <div key={k.id} className="zt-korrektur">
          <span className="zt-tag-unter">{tagTitel(tagSchluessel(k.am))} {uhrzeitVon(k.am)} · {nameVon(k.von)}</span>
          <span>{korrekturText(k)}</span>
          <span className="zt-tag-unter zt-korrigiert">Grund: {k.grund}</span>
        </div>
      ))}
    </div>
  );
}

export function ExportKnoepfe({ onCsv, onPdf, deaktiviert }: { onCsv: () => void; onPdf: () => void; deaktiviert?: boolean }) {
  return (
    <div className="zt-export">
      <button type="button" className="es-knopf" disabled={deaktiviert} onClick={onCsv}>CSV (Excel)</button>
      <button type="button" className="es-knopf" disabled={deaktiviert} onClick={onPdf}>Nachweis drucken / PDF</button>
    </div>
  );
}
