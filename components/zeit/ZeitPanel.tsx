import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { zeitSchichtLoeschen, zeitSchichtSpeichern } from "@/lib/api/zeiterfassung";
import { useZeitOffene, useZeitPersonen, useZeitSchichten } from "@/lib/queries/hooks";
import { qk } from "@/lib/queries/keys";
import { initialen, personenFarbe } from "@/lib/chat";
import {
  arbeitMs, dauerText, formularAusSchicht, offeneSchichten, pauseMs, personenWoche, schichtAusFormular, schichtSpanne,
  tagAuswerten, tagPlus, tagSchluessel, tagTitel, tagVon, wocheAuswerten, wochenMontag, wochenTage, wochenTitel,
  ZEIT_HINWEIS_TEXT, type SchichtFormular, type TagAuswertung, type TagHinweis, type ZeitPerson, type ZeitSchicht,
} from "@/lib/zeiterfassung";
import { UhrPille } from "./UhrPille";
import { useJetzt } from "./useJetzt";

// Der Bereich „Zeiterfassung“ (Migration 82, v131, Entwurf „Stempeluhr“ Bild 4–7).
//
//   Tag   – die eigenen Stempelungen eines Tages
//   Woche – die eigene Woche: Summen, Balken, Tage
//   Alle  – nur mit „Zeiten aller · lesen“: die Woche aller Mitarbeiter; ein Tipp auf eine Zelle
//           öffnet den Tag der Person, mit „Zeiten aller · schreiben“ dort korrigieren, nachtragen,
//           löschen – immer mit Grund.
//
// Die eigenen Zeiten kann niemand selbst ändern (Entscheidung vom 08.10.2026).

type Ansicht = "tag" | "woche" | "alle";
const WT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const KEINE: ZeitSchicht[] = [];
const KEINE_PERSONEN: ZeitPerson[] = [];

const HINWEIS_KLASSE: Record<TagHinweis, string> = { pause: "gelb", lang: "gelb", offen: "rot", korrigiert: "blau" };

function Marken({ hinweise, laeuft }: { hinweise: TagHinweis[]; laeuft?: boolean }) {
  return (
    <>
      {laeuft && <span className="zt-marke gruen">läuft</span>}
      {hinweise.map((h) => <span key={h} className={`zt-marke ${HINWEIS_KLASSE[h]}`}>{ZEIT_HINWEIS_TEXT[h]}</span>)}
    </>
  );
}

export function ZeitPanel(p: {
  supabase: SupabaseClient;
  meineId: string | null;
  meinName: string;
  darfAlle: boolean;
  darfKorrigieren: boolean;
  schicht: ZeitSchicht | null;
  versatzMs: number;
  onStempeluhr: () => void;
  // Die Stempeluhr selbst (v132): steht über Tag und Woche, damit man hier auch ein- und ausstempeln kann.
  stempeluhr?: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [ansicht, setAnsicht] = useState<Ansicht>("woche");
  const [tag, setTag] = useState(() => tagVon(new Date()));
  const [montag, setMontag] = useState(() => wochenMontag(tagVon(new Date())));
  const [detail, setDetail] = useState<{ person: ZeitPerson; tag: string } | null>(null);

  const schichtenQuery = useZeitSchichten(p.supabase, montag, true);
  const personenQuery = useZeitPersonen(p.supabase, p.darfAlle);
  const offeneQuery = useZeitOffene(p.supabase, p.darfAlle);
  const jetzt = useJetzt(30_000, p.versatzMs, true);
  const heute = tagVon(new Date(jetzt));

  const schichten = schichtenQuery.data ?? KEINE;
  const meine = useMemo(() => schichten.filter((s) => s.profile_id === p.meineId), [schichten, p.meineId]);
  const woche = wocheAuswerten(meine, montag, heute, jetzt);
  const tagDaten = tagAuswerten(meine, tag, heute, jetzt);
  const offene = offeneSchichten(offeneQuery.data ?? KEINE, heute);
  const personen = personenQuery.data ?? KEINE_PERSONEN;
  const nameVon = (id: string) => personen.find((x) => x.id === id)?.name ?? (id === p.meineId ? p.meinName : "Ehemaliger Zugang");

  function zuTag(t: string) { setTag(t); setMontag(wochenMontag(t)); setAnsicht("tag"); }
  function tagSchieben(n: number) { const t = tagPlus(tag, n); setTag(t); setMontag(wochenMontag(t)); }
  function wocheSchieben(n: number) { setMontag(tagPlus(montag, 7 * n)); }

  const maxStunden = Math.max(8 * 3600_000, ...woche.tage.map((x) => x.arbeitMs));

  return (
    <div className="tabpanel active">
      <div className="module-page zt-seite">
        <div className="zt-seitenkopf">
          <div>
            <h2>Zeiterfassung</h2>
            <span className="small">{ansicht === "alle" ? "alle Mitarbeiter" : p.meinName}</span>
          </div>
          <UhrPille schicht={p.schicht} versatzMs={p.versatzMs} onClick={p.onStempeluhr} eingebettet />
        </div>

        <div className="lg-lagerwahl ar-segment zt-segment" role="group" aria-label="Ansicht">
          <button type="button" className={ansicht === "tag" ? "aktiv" : ""} aria-pressed={ansicht === "tag"} onClick={() => setAnsicht("tag")}>Tag</button>
          <button type="button" className={ansicht === "woche" ? "aktiv" : ""} aria-pressed={ansicht === "woche"} onClick={() => setAnsicht("woche")}>Woche</button>
          {p.darfAlle && <button type="button" className={ansicht === "alle" ? "aktiv" : ""} aria-pressed={ansicht === "alle"} onClick={() => setAnsicht("alle")}>Alle</button>}
        </div>

        {ansicht === "tag" ? (
          <div className="zt-nav">
            <button type="button" onClick={() => tagSchieben(-1)} aria-label="Tag zurück">‹</button>
            <span>{tagTitel(tag)}{tag === heute ? " · heute" : ""}</span>
            <button type="button" onClick={() => tagSchieben(1)} aria-label="Tag vor">›</button>
          </div>
        ) : (
          <div className="zt-nav">
            <button type="button" onClick={() => wocheSchieben(-1)} aria-label="Woche zurück">‹</button>
            <span>{wochenTitel(montag)}</span>
            <button type="button" onClick={() => wocheSchieben(1)} aria-label="Woche vor">›</button>
          </div>
        )}

        {ansicht !== "alle" && p.stempeluhr}

        {schichtenQuery.isError && <div className="zt-hinweis fehler" role="alert">{(schichtenQuery.error as Error).message}</div>}

        {ansicht === "tag" && <TagListe daten={tagDaten} jetzt={jetzt} leer="An diesem Tag ist nichts gestempelt." />}

        {ansicht === "woche" && (
          <>
            <div className="zt-summen">
              <div><b>{dauerText(woche.arbeitMs)} h</b><span>Arbeitszeit</span></div>
              <div><b>{dauerText(woche.pauseMs)} h</b><span>Pausen</span></div>
              <div><b>{woche.arbeitstage}</b><span>{woche.arbeitstage === 1 ? "Tag" : "Tage"}</span></div>
            </div>
            <div className="zt-balken" aria-hidden="true">
              {woche.tage.map((x, i) => (
                <div key={x.tag} className={(x.tag === heute ? "heute" : "") + (x.arbeitMs === 0 ? " leer" : "")}>
                  <i style={{ height: x.arbeitMs ? `${Math.max(4, Math.round((x.arbeitMs / maxStunden) * 100))}%` : undefined }} />
                  {WT[i]}
                </div>
              ))}
            </div>
            {woche.tage.filter((x) => x.schichten.length > 0).reverse().map((x) => (
              <button key={x.tag} type="button" className="zt-tag" onClick={() => zuTag(x.tag)}>
                <span className="zt-tag-kopf"><span>{tagTitel(x.tag)} <Marken hinweise={x.hinweise} laeuft={x.laeuft} /></span><em>{dauerText(x.arbeitMs)} h</em></span>
                <span className="zt-tag-unter">{x.schichten.map(schichtSpanne).join(" · ")} · Pause {dauerText(x.pauseMs)}</span>
              </button>
            ))}
            {woche.arbeitstage === 0 && !schichtenQuery.isPending && <div className="zt-hinweis info">In dieser Woche ist nichts gestempelt.</div>}
          </>
        )}

        {ansicht === "alle" && p.darfAlle && (
          <>
            {offene.length > 0 && (
              <div className="zt-hinweis fehler">
                {offene.length === 1 ? "1 Stempelung ist offen" : `${offene.length} Stempelungen sind offen`} (nicht ausgestempelt):
                {offene.map((s) => (
                  <button key={s.id} type="button" className="zt-link" onClick={() => { const t = tagSchluessel(s.beginn); setMontag(wochenMontag(t)); setDetail({ person: { id: s.profile_id, name: nameVon(s.profile_id), rolle: "" }, tag: t }); }}>
                    {nameVon(s.profile_id)} · {tagTitel(tagSchluessel(s.beginn))} ›
                  </button>
                ))}
              </div>
            )}
            <AlleTabelle zeilen={personenWoche(schichten, personen, montag, heute, jetzt)} montag={montag} heute={heute}
              onZelle={(person, t) => setDetail({ person, tag: t })} />
            <div className="zt-hinweis info">
              Antippen einer Zelle öffnet den Tag der Person{p.darfKorrigieren ? " – dort nachtragen, ändern oder löschen, jeweils mit Grund" : ""}.
              Markiert ist, was unter der Mindestpause liegt (§ 4 ArbZG) oder über 10 Stunden (§ 3 ArbZG) – nur als Hinweis.
            </div>
          </>
        )}
      </div>

      {detail && (
        <ZeitTagBlatt
          person={detail.person}
          tag={detail.tag}
          schichten={[...schichten, ...(offeneQuery.data ?? KEINE).filter((o) => !schichten.some((s) => s.id === o.id))].filter((s) => s.profile_id === detail.person.id)}
          heute={heute}
          jetzt={jetzt}
          darfKorrigieren={p.darfKorrigieren}
          onSpeichern={async (s) => { await zeitSchichtSpeichern(p.supabase, s); await queryClient.invalidateQueries({ queryKey: qk.zeit() }); }}
          onLoeschen={async (id, grund) => { await zeitSchichtLoeschen(p.supabase, id, grund); await queryClient.invalidateQueries({ queryKey: qk.zeit() }); }}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function TagListe({ daten, jetzt, leer }: { daten: TagAuswertung; jetzt: number; leer: string }) {
  if (daten.schichten.length === 0) return <div className="zt-hinweis info">{leer}</div>;
  return (
    <>
      <div className="zt-summen">
        <div><b>{dauerText(daten.arbeitMs)} h</b><span>Arbeitszeit</span></div>
        <div><b>{dauerText(daten.pauseMs)} h</b><span>Pausen</span></div>
        <div className="zt-summe-marken"><Marken hinweise={daten.hinweise} laeuft={daten.laeuft} /></div>
      </div>
      {daten.schichten.map((s) => <SchichtZeile key={s.id} s={s} jetzt={jetzt} />)}
    </>
  );
}

function SchichtZeile({ s, jetzt, onBearbeiten }: { s: ZeitSchicht; jetzt: number; onBearbeiten?: () => void }) {
  return (
    <div className="zt-tag">
      <span className="zt-tag-kopf"><span>{schichtSpanne(s)}</span><em>{dauerText(arbeitMs(s, jetzt))} h</em></span>
      <span className="zt-tag-unter">
        {s.pausen.length === 0 ? "keine Pause" : s.pausen.map((x) => `Pause ${schichtSpanne(x)}`).join(" · ")}
        {s.pausen.length > 0 && ` (${dauerText(pauseMs(s, jetzt))} h)`}
      </span>
      {s.korrigiert_am && <span className="zt-tag-unter zt-korrigiert">korrigiert: {s.korrektur_grund}</span>}
      {onBearbeiten && <button type="button" className="zt-link" onClick={onBearbeiten}>Bearbeiten ›</button>}
    </div>
  );
}

function AlleTabelle({ zeilen, montag, heute, onZelle }: {
  zeilen: { person: ZeitPerson; woche: ReturnType<typeof wocheAuswerten> }[];
  montag: string; heute: string;
  onZelle: (person: ZeitPerson, tag: string) => void;
}) {
  const tage = wochenTage(montag);
  if (zeilen.length === 0) return <div className="zt-hinweis info">Noch niemand mit Zugang zur Zeiterfassung.</div>;
  const summeTag = tage.map((_, i) => zeilen.reduce((s, z) => s + z.woche.tage[i].arbeitMs, 0));
  const summe = zeilen.reduce((s, z) => s + z.woche.arbeitMs, 0);
  return (
    <div className="zt-tabelle" role="table" aria-label="Wochenübersicht aller">
      <div className="zt-r kopf" role="row">
        <span role="columnheader">Person</span>
        {tage.map((t, i) => <span key={t} role="columnheader" className={t === heute ? "heute" : ""}>{WT[i]}<small>{Number(t.slice(8))}.</small></span>)}
        <span role="columnheader">Σ</span>
        <span role="columnheader" className="zt-breit">Pausen</span>
      </div>
      {zeilen.map(({ person, woche }) => (
        <div key={person.id} className="zt-r" role="row">
          <span role="rowheader" className="zt-person"><span className="ch-av" style={{ background: personenFarbe(person.id) }}>{initialen(person.name)}</span><span>{person.name}</span></span>
          {woche.tage.map((x) => (
            <button key={x.tag} type="button" role="cell"
              className={"zt-zelle" + (x.hinweise.includes("offen") ? " offen" : x.laeuft ? " laeuft" : "") + (x.hinweise.some((h) => h === "pause" || h === "lang") ? " warn" : "")}
              onClick={() => onZelle(person, x.tag)} aria-label={`${person.name}, ${tagTitel(x.tag)}: ${x.schichten.length ? dauerText(x.arbeitMs) + " h" : "nichts"}`}>
              {x.hinweise.includes("offen") ? "offen" : x.schichten.length ? dauerText(x.arbeitMs) : "–"}
            </button>
          ))}
          <span role="cell" className="zt-summe">{dauerText(woche.arbeitMs)}</span>
          <span role="cell" className="zt-breit">{dauerText(woche.pauseMs)}</span>
        </div>
      ))}
      <div className="zt-r kopf" role="row">
        <span role="rowheader">Summe</span>
        {summeTag.map((ms, i) => <span key={i} role="cell">{ms ? dauerText(ms) : "–"}</span>)}
        <span role="cell" className="zt-summe">{dauerText(summe)}</span>
        <span role="cell" className="zt-breit">{dauerText(zeilen.reduce((s, z) => s + z.woche.pauseMs, 0))}</span>
      </div>
    </div>
  );
}

// Der Tag einer Person (Entwurf Bild 6): Stempelungen ansehen und – mit Recht – korrigieren.
export function ZeitTagBlatt(p: {
  person: ZeitPerson;
  tag: string;
  schichten: ZeitSchicht[];
  heute: string;
  jetzt: number;
  darfKorrigieren: boolean;
  onSpeichern: (s: { id: string | null; profileId: string; beginn: string; ende: string | null; pausen: { beginn: string; ende: string }[]; grund: string }) => Promise<void>;
  onLoeschen: (id: string, grund: string) => Promise<void>;
  onClose: () => void;
}) {
  const daten = tagAuswerten(p.schichten, p.tag, p.heute, p.jetzt);
  // `undefined` = nichts in Bearbeitung, `null` = neue Schicht nachtragen.
  const [bearbeiten, setBearbeiten] = useState<ZeitSchicht | null | undefined>(undefined);
  return (
    <div className="modal-overlay auswahl-overlay zt-overlay" onClick={p.onClose}>
      <div className="auswahl-blatt zt-blatt" role="dialog" aria-label={`${p.person.name}, ${tagTitel(p.tag)}`} onClick={(e) => e.stopPropagation()}>
        <div className="ab-griff" />
        <div className="ar-blatt-kopf">
          <div className="ab-titel">{p.person.name} · {tagTitel(p.tag)}</div>
          <button type="button" className="modal-close" onClick={p.onClose} aria-label="Schließen">×</button>
        </div>
        {bearbeiten !== undefined ? (
          <SchichtFormularAnsicht
            schicht={bearbeiten}
            tag={p.tag}
            personId={p.person.id}
            onSpeichern={async (s) => { await p.onSpeichern(s); setBearbeiten(undefined); }}
            onLoeschen={bearbeiten ? async (grund) => { await p.onLoeschen(bearbeiten.id, grund); setBearbeiten(undefined); } : undefined}
            onAbbrechen={() => setBearbeiten(undefined)}
          />
        ) : (
          <>
            <span className="small">
              {daten.schichten.length ? `${dauerText(daten.arbeitMs)} h Arbeit · ${dauerText(daten.pauseMs)} h Pause` : "Nichts gestempelt."}{" "}
              <Marken hinweise={daten.hinweise} laeuft={daten.laeuft} />
            </span>
            {daten.schichten.map((s) => <SchichtZeile key={s.id} s={s} jetzt={p.jetzt} onBearbeiten={p.darfKorrigieren ? () => setBearbeiten(s) : undefined} />)}
            {p.darfKorrigieren && p.tag <= p.heute && (
              <button type="button" className="ab-option" onClick={() => setBearbeiten(null)}><span className="ab-text">+ Schicht nachtragen</span></button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SchichtFormularAnsicht(p: {
  schicht: ZeitSchicht | null;
  tag: string;
  personId: string;
  onSpeichern: (s: { id: string | null; profileId: string; beginn: string; ende: string | null; pausen: { beginn: string; ende: string }[]; grund: string }) => Promise<void>;
  onLoeschen?: (grund: string) => Promise<void>;
  onAbbrechen: () => void;
}) {
  const [f, setF] = useState<SchichtFormular>(() => formularAusSchicht(p.schicht, p.tag));
  const [grund, setGrund] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function ausfuehren(arbeit: () => Promise<void>) {
    if (grund.trim().length < 3) { setFehler("Bitte einen Grund angeben (Pflicht)."); return; }
    setLaeuft(true);
    setFehler(null);
    try { await arbeit(); } catch (e) { setFehler(e instanceof Error ? e.message : String(e)); } finally { setLaeuft(false); }
  }
  function speichern() {
    const { zeiten, fehler: f2 } = schichtAusFormular(f);
    if (!zeiten) { setFehler(f2); return; }
    void ausfuehren(() => p.onSpeichern({ id: p.schicht?.id ?? null, profileId: p.personId, ...zeiten, grund: grund.trim() }));
  }
  function loeschen() {
    if (!p.onLoeschen) return;
    if (grund.trim().length >= 3 && !window.confirm("Diese Schicht wirklich löschen? Vorher und Grund bleiben bei den Korrekturen festgehalten.")) return;
    void ausfuehren(() => p.onLoeschen!(grund.trim()));
  }
  const pause = (i: number, feld: "von" | "bis", wert: string) =>
    setF({ ...f, pausen: f.pausen.map((x, j) => (j === i ? { ...x, [feld]: wert } : x)) });

  return (
    <div className="zt-formular">
      <span className="small">{p.schicht ? "Schicht ändern" : "Schicht nachtragen"} · Uhrzeiten am {tagTitel(f.tag)}; ein Ende vor dem Beginn heißt: am Folgetag.</span>
      <div className="zt-zwei">
        <label>Beginn<input type="time" value={f.beginn} onChange={(e) => setF({ ...f, beginn: e.target.value })} aria-label="Beginn" /></label>
        <label>Ende<input type="time" value={f.ende} onChange={(e) => setF({ ...f, ende: e.target.value })} aria-label="Ende" /></label>
      </div>
      {!f.ende && p.schicht && !p.schicht.ende && <span className="small">Ohne Ende läuft die Schicht weiter.</span>}
      {f.pausen.map((x, i) => (
        <div key={i} className="zt-zwei">
          <label>Pause von<input type="time" value={x.von} onChange={(e) => pause(i, "von", e.target.value)} aria-label={`Pause ${i + 1} von`} /></label>
          <label>bis<input type="time" value={x.bis} onChange={(e) => pause(i, "bis", e.target.value)} aria-label={`Pause ${i + 1} bis`} /></label>
          <button type="button" className="ch-weg" onClick={() => setF({ ...f, pausen: f.pausen.filter((_, j) => j !== i) })} aria-label={`Pause ${i + 1} entfernen`}>✕</button>
        </div>
      ))}
      <button type="button" className="zt-link" onClick={() => setF({ ...f, pausen: [...f.pausen, { von: "", bis: "" }] })}>+ Pause</button>
      <label className="zt-grund">Grund (Pflicht)
        <input type="text" value={grund} onChange={(e) => setGrund(e.target.value)} placeholder="z. B. Ausstempeln vergessen, Ende laut Mitarbeiter" aria-label="Grund" maxLength={300} />
      </label>
      {fehler && <div className="zt-hinweis fehler" role="alert">{fehler}</div>}
      <div className="zt-zwei">
        <button type="button" className="btn-secondary" onClick={p.onAbbrechen} disabled={laeuft}>Abbrechen</button>
        <button type="button" className="btn-primary" onClick={speichern} disabled={laeuft}>{laeuft ? "speichert …" : "Speichern"}</button>
      </div>
      {p.onLoeschen && <button type="button" className="zt-link gefahr" onClick={loeschen} disabled={laeuft}>Schicht löschen</button>}
      <span className="small">Vorher, Nachher und Grund werden festgehalten; die Person sieht „korrigiert“ mit dem Grund.</span>
    </div>
  );
}
