import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { zeitHeimfahrtSetzen, zeitSchichtLoeschen, zeitSchichtSpeichern, zeitUrlaubLoeschen, zeitUrlaubSetzen } from "@/lib/api/zeiterfassung";
import { useZeitKorrekturen, useZeitMonat, useZeitOffene, useZeitPersonen, useZeitSchichten, useZeitUrlaub } from "@/lib/queries/hooks";
import { qk } from "@/lib/queries/keys";
import { initialen, personenFarbe } from "@/lib/chat";
import { dateiHerunterladen } from "@/lib/download";
import {
  arbeitMs, dauerText, exportDateiname, formularAusSchicht, monatAuswerten, monatCsv, monatPlus, monatTitel, monatVon,
  monatVonBis, offeneSchichten, pauseMs, personenMonat, personenWoche, schichtAusFormular, schichtSpanne,
  tagAuswerten, tagPlus, tagSchluessel, tagTitel, tagVon, wocheAuswerten, wochenMontag, wochenTage, wochenTitel,
  type MonatsAuswertung, type SchichtFormular, type TagAuswertung, type ZeitAbwesenheit, type ZeitKorrektur, type ZeitPerson, type ZeitSchicht, heimfahrtMs, ZEIT_HEIMFAHRT_MINUTEN} from "@/lib/zeiterfassung";
import { UhrPille } from "./UhrPille";
import { useJetzt } from "./useJetzt";
import { ExportKnoepfe, KorrekturListe, Marken, MonatAlleTabelle, MonatSummen, MonatTagListe } from "./ZeitMonat";
import { ZeitNachweis } from "./ZeitNachweis";
import { UrlaubBlatt } from "./UrlaubBlatt";
import { Blatt } from "@/components/Blatt";

// Der Bereich „Zeiterfassung“ (Migration 82, v131, Entwurf „Stempeluhr“ Bild 4–7).
//
//   Tag   – die eigenen Stempelungen eines Tages, mit Urlaub und Korrekturen (v136)
//   Woche – die eigene Woche: Summen, Balken, Tage
//   Monat – der eigene Monat mit Urlaub, Export als CSV und Nachweis zum Drucken (v136, E20)
//   Alle  – nur mit „Zeiten aller · lesen“: Woche oder Monat aller Mitarbeiter; ein Tipp öffnet den
//           Tag bzw. den Monat der Person, mit „Zeiten aller · schreiben“ dort korrigieren,
//           nachtragen, löschen und Urlaub eintragen – immer mit Grund.
//
// Die eigenen Zeiten kann niemand selbst ändern (Entscheidung vom 08.10.2026).

type Ansicht = "tag" | "woche" | "monat" | "alle";
const WT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const KEINE: ZeitSchicht[] = [];
const KEINE_PERSONEN: ZeitPerson[] = [];
const KEIN_URLAUB: ZeitAbwesenheit[] = [];
const KEINE_KORREKTUREN: ZeitKorrektur[] = [];
const MIN = 60_000;

const urlaubAm = (urlaub: ZeitAbwesenheit[], personId: string | null, tag: string) =>
  urlaub.filter((u) => u.profile_id === personId && u.tag.slice(0, 10) === tag).reduce((s, u) => s + u.minuten * MIN, 0);

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
  const [alleSicht, setAlleSicht] = useState<"woche" | "monat">("woche");
  const [tag, setTag] = useState(() => tagVon(new Date()));
  const [montag, setMontag] = useState(() => wochenMontag(tagVon(new Date())));
  const [monat, setMonat] = useState(() => monatVon(tagVon(new Date())));
  const [detail, setDetail] = useState<{ person: ZeitPerson; tag: string } | null>(null);
  const [personMonat, setPersonMonat] = useState<ZeitPerson | null>(null);
  const [nachweis, setNachweis] = useState<{ person: ZeitPerson; monat: MonatsAuswertung }[] | null>(null);
  const [urlaubVorgabe, setUrlaubVorgabe] = useState<{ personId?: string; tag?: string } | null>(null);

  const imMonat = ansicht === "monat" || (ansicht === "alle" && alleSicht === "monat") || !!personMonat;
  const schichtenQuery = useZeitSchichten(p.supabase, montag, true);
  const monatQuery = useZeitMonat(p.supabase, monat, imMonat);
  const personenQuery = useZeitPersonen(p.supabase, p.darfAlle);
  const offeneQuery = useZeitOffene(p.supabase, p.darfAlle);
  // Urlaub: für den Monat bzw. die Woche, die gerade zu sehen ist (die Tagesansicht liegt in der Woche).
  const mvb = monatVonBis(monat);
  const urlaubVon = imMonat ? mvb.vonTag : montag;
  const urlaubBis = imMonat ? mvb.bisTag : tagPlus(montag, 6);
  const urlaubQuery = useZeitUrlaub(p.supabase, urlaubVon, urlaubBis, true);
  const wocheUrlaubQuery = useZeitUrlaub(p.supabase, montag, tagPlus(montag, 6), imMonat && !!detail);
  // Korrekturen: die eigenen ab Beginn der gezeigten Woche; die der Person im geöffneten Tag ab diesem Tag.
  const meineKorrekturen = useZeitKorrekturen(p.supabase, p.meineId, new Date(`${montag}T00:00:00`).toISOString(), ansicht === "tag");
  const detailKorrekturen = useZeitKorrekturen(p.supabase, detail?.person.id ?? null, new Date(`${detail?.tag ?? montag}T00:00:00`).toISOString(), !!detail);
  const jetzt = useJetzt(30_000, p.versatzMs, true);
  const heute = tagVon(new Date(jetzt));

  const schichten = schichtenQuery.data ?? KEINE;
  const monatsSchichten = monatQuery.data ?? KEINE;
  const urlaub = urlaubQuery.data ?? KEIN_URLAUB;
  const meine = useMemo(() => schichten.filter((s) => s.profile_id === p.meineId), [schichten, p.meineId]);
  const woche = wocheAuswerten(meine, montag, heute, jetzt);
  const wocheUrlaubMs = imMonat ? 0 : urlaub.filter((u) => u.profile_id === p.meineId).reduce((s, u) => s + u.minuten * MIN, 0);
  const tagDaten = tagAuswerten(meine, tag, heute, jetzt);
  const offene = offeneSchichten(offeneQuery.data ?? KEINE, heute);
  const personen = personenQuery.data ?? KEINE_PERSONEN;
  const nameVon = (id: string | null) => !id ? "Büro" : personen.find((x) => x.id === id)?.name ?? (id === p.meineId ? p.meinName : "Ehemaliger Zugang");
  const ich: ZeitPerson = { id: p.meineId ?? "", name: p.meinName, rolle: "" };

  const meinMonat = imMonat
    ? monatAuswerten(monatsSchichten.filter((s) => s.profile_id === p.meineId), urlaub.filter((u) => u.profile_id === p.meineId), monat, heute, jetzt)
    : null;
  const alleMonat = imMonat && p.darfAlle ? personenMonat(monatsSchichten, urlaub, personen, monat, heute, jetzt) : [];

  function zuTag(t: string) { setTag(t); setMontag(wochenMontag(t)); setAnsicht("tag"); }
  function tagSchieben(n: number) { const t = tagPlus(tag, n); setTag(t); setMontag(wochenMontag(t)); }
  function wocheSchieben(n: number) { setMontag(tagPlus(montag, 7 * n)); }
  function monatSchieben(n: number) { setMonat(monatPlus(monat, n)); }
  function tagOeffnen(person: ZeitPerson, t: string) { setMontag(wochenMontag(t)); setDetail({ person, tag: t }); }

  function csv(zeilen: { person: ZeitPerson; monat: MonatsAuswertung }[], wer: string) {
    dateiHerunterladen(`${exportDateiname(monat, wer)}.csv`, monatCsv(zeilen), "text/csv;charset=utf-8");
  }
  const neuLadenZeit = () => queryClient.invalidateQueries({ queryKey: qk.zeit() });

  const maxStunden = Math.max(8 * 3600_000, ...woche.tage.map((x) => x.arbeitMs));
  const zeigtMonat = ansicht === "monat" || (ansicht === "alle" && alleSicht === "monat");
  const detailSchichten = detail
    ? [...(imMonat ? monatsSchichten : schichten), ...(offeneQuery.data ?? KEINE)]
        .filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i)
        .filter((s) => s.profile_id === detail.person.id)
    : KEINE;
  const detailUrlaubMs = detail ? urlaubAm([...urlaub, ...(wocheUrlaubQuery.data ?? KEIN_URLAUB)], detail.person.id, detail.tag) : 0;
  const personMonatDaten = personMonat ? alleMonat.find((z) => z.person.id === personMonat.id) ?? null : null;

  return (
    <div className="tabpanel active">
      <div className="module-page zt-seite">
        <div className="lg-leiste zt-leiste">
          <div className="lg-kopf">
            <div className="lg-titel">
              <h2>Zeiterfassung</h2>
              <span className="lg-unter">{ansicht === "alle" ? "alle Mitarbeiter" : p.meinName}</span>
            </div>
            <UhrPille schicht={p.schicht} versatzMs={p.versatzMs} onClick={p.onStempeluhr} eingebettet />
          </div>

          <div className="lg-lagerwahl ar-segment zt-segment" role="group" aria-label="Ansicht">
            <button type="button" className={ansicht === "tag" ? "aktiv" : ""} aria-pressed={ansicht === "tag"} onClick={() => setAnsicht("tag")}>Tag</button>
            <button type="button" className={ansicht === "woche" ? "aktiv" : ""} aria-pressed={ansicht === "woche"} onClick={() => setAnsicht("woche")}>Woche</button>
            <button type="button" className={ansicht === "monat" ? "aktiv" : ""} aria-pressed={ansicht === "monat"} onClick={() => setAnsicht("monat")}>Monat</button>
            {p.darfAlle && <button type="button" className={ansicht === "alle" ? "aktiv" : ""} aria-pressed={ansicht === "alle"} onClick={() => setAnsicht("alle")}>Alle</button>}
          </div>

          {ansicht === "alle" && (
            <div className="pl-filter zt-alle-sicht" role="group" aria-label="Zeitraum aller">
              <button type="button" className={"pl-pille" + (alleSicht === "woche" ? " aktiv" : "")} aria-pressed={alleSicht === "woche"} onClick={() => setAlleSicht("woche")}>Woche</button>
              <button type="button" className={"pl-pille" + (alleSicht === "monat" ? " aktiv" : "")} aria-pressed={alleSicht === "monat"} onClick={() => setAlleSicht("monat")}>Monat</button>
            </div>
          )}

          {ansicht === "tag" ? (
            <div className="zt-nav">
              <button type="button" onClick={() => tagSchieben(-1)} aria-label="Tag zurück">‹</button>
              <span>{tagTitel(tag)}{tag === heute ? " · heute" : ""}</span>
              <button type="button" onClick={() => tagSchieben(1)} aria-label="Tag vor">›</button>
            </div>
          ) : zeigtMonat ? (
            <div className="zt-nav">
              <button type="button" onClick={() => monatSchieben(-1)} aria-label="Monat zurück">‹</button>
              <span>{monatTitel(monat)}</span>
              <button type="button" onClick={() => monatSchieben(1)} aria-label="Monat vor">›</button>
            </div>
          ) : (
            <div className="zt-nav">
              <button type="button" onClick={() => wocheSchieben(-1)} aria-label="Woche zurück">‹</button>
              <span>{wochenTitel(montag)}</span>
              <button type="button" onClick={() => wocheSchieben(1)} aria-label="Woche vor">›</button>
            </div>
          )}
        </div>

        {/* Am Rechner links die Stempeluhr, rechts Tag bzw. Woche (v133); am Handy untereinander. */}
        <div className={"zt-raster" + (ansicht !== "alle" && p.stempeluhr ? " mit-uhr" : "")}>
          {ansicht !== "alle" && p.stempeluhr && <div className="zt-links">{p.stempeluhr}</div>}
          <div className="zt-rechts">
            {(schichtenQuery.isError || monatQuery.isError) && (
              <div className="zt-hinweis fehler" role="alert">{((schichtenQuery.error ?? monatQuery.error) as Error).message}</div>
            )}

            {ansicht === "tag" && (
              <>
                <TagListe daten={tagDaten} jetzt={jetzt} urlaubMs={urlaubAm(urlaub, p.meineId, tag)} leer="An diesem Tag ist nichts gestempelt." />
                <KorrekturListe korrekturen={meineKorrekturen.data ?? KEINE_KORREKTUREN} tag={tag} nameVon={nameVon} />
              </>
            )}

            {ansicht === "woche" && (
              <>
                <div className="zt-summen">
                  <div><b>{dauerText(woche.arbeitMs)} h</b><span>Arbeitszeit</span></div>
                  <div><b>{dauerText(woche.pauseMs)} h</b><span>Pausen</span></div>
                  {woche.heimfahrtMs > 0 && <div><b>{dauerText(woche.heimfahrtMs)} h</b><span>davon Heimfahrt</span></div>}
                  {wocheUrlaubMs > 0 && <div><b>{dauerText(wocheUrlaubMs)} h</b><span>Urlaub</span></div>}
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
                {woche.tage.map((x) => ({ ...x, urlaubMs: urlaubAm(urlaub, p.meineId, x.tag) }))
                  .filter((x) => x.schichten.length > 0 || x.urlaubMs > 0).reverse().map((x) => (
                    <button key={x.tag} type="button" className="zt-tag" onClick={() => zuTag(x.tag)}>
                      <span className="zt-tag-kopf"><span>{tagTitel(x.tag)} <Marken hinweise={x.hinweise} laeuft={x.laeuft} urlaubMs={x.urlaubMs} /></span><em>{dauerText(x.arbeitMs + x.urlaubMs)} h</em></span>
                      <span className="zt-tag-unter">
                        {[x.schichten.length ? `${x.schichten.map(schichtSpanne).join(" · ")} · Pause ${dauerText(x.pauseMs)}` : "", x.urlaubMs ? `Urlaub ${dauerText(x.urlaubMs)} h` : ""].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  ))}
                {woche.arbeitstage === 0 && wocheUrlaubMs === 0 && !schichtenQuery.isPending && <div className="zt-hinweis info">In dieser Woche ist nichts gestempelt.</div>}
              </>
            )}

            {ansicht === "monat" && meinMonat && (
              <>
                <MonatSummen m={meinMonat} />
                <ExportKnoepfe deaktiviert={monatQuery.isPending}
                  onCsv={() => csv([{ person: ich, monat: meinMonat }], p.meinName)}
                  onPdf={() => setNachweis([{ person: ich, monat: meinMonat }])} />
                <MonatTagListe m={meinMonat} onTag={zuTag} />
              </>
            )}

            {ansicht === "alle" && p.darfAlle && (
              <>
                {offene.length > 0 && (
                  <div className="zt-hinweis fehler">
                    {offene.length === 1 ? "1 Stempelung ist offen" : `${offene.length} Stempelungen sind offen`} (nicht ausgestempelt):
                    {offene.map((s) => (
                      <button key={s.id} type="button" className="zt-link" onClick={() => tagOeffnen({ id: s.profile_id, name: nameVon(s.profile_id), rolle: "" }, tagSchluessel(s.beginn))}>
                        {nameVon(s.profile_id)} · {tagTitel(tagSchluessel(s.beginn))} ›
                      </button>
                    ))}
                  </div>
                )}
                {alleSicht === "woche" ? (
                  <AlleTabelle zeilen={personenWoche(schichten, personen, montag, heute, jetzt)} urlaub={urlaub} montag={montag} heute={heute}
                    onZelle={(person, t) => setDetail({ person, tag: t })} />
                ) : (
                  <>
                    <div className="zt-export">
                      <button type="button" className="es-knopf" disabled={monatQuery.isPending} onClick={() => csv(alleMonat, "alle")}>CSV (Excel)</button>
                      <button type="button" className="es-knopf" disabled={monatQuery.isPending || alleMonat.length === 0} onClick={() => setNachweis(alleMonat)}>Nachweise drucken / PDF</button>
                      {p.darfKorrigieren && <button type="button" className="es-knopf" onClick={() => setUrlaubVorgabe({})}>Urlaub eintragen</button>}
                    </div>
                    <MonatAlleTabelle zeilen={alleMonat} onPerson={setPersonMonat} />
                  </>
                )}
                <div className="zt-hinweis info">
                  Antippen öffnet {alleSicht === "woche" ? "den Tag" : "den Monat"} der Person{p.darfKorrigieren ? " – dort nachtragen, ändern oder löschen, jeweils mit Grund" : ""}.
                  Markiert ist, was unter der Mindestpause liegt (§ 4 ArbZG) oder über 10 Stunden (§ 3 ArbZG) – nur als Hinweis.
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {personMonat && personMonatDaten && (
        <Blatt titel={`${personMonat.name} · ${monatTitel(monat)}`} breite="mittel" ebene="zt-overlay" onClose={() => setPersonMonat(null)}
          fuss={p.darfKorrigieren ? <button type="button" className="btn-secondary" onClick={() => setUrlaubVorgabe({ personId: personMonat.id })}>Urlaub eintragen</button> : undefined}>
          <MonatSummen m={personMonatDaten.monat} />
          <ExportKnoepfe onCsv={() => csv([personMonatDaten], personMonat.name)} onPdf={() => setNachweis([personMonatDaten])} />
          <MonatTagListe m={personMonatDaten.monat} onTag={(t) => tagOeffnen(personMonat, t)} />
        </Blatt>
      )}

      {detail && (
        <ZeitTagBlatt
          person={detail.person}
          tag={detail.tag}
          schichten={detailSchichten}
          urlaubMs={detailUrlaubMs}
          korrekturen={detailKorrekturen.data}
          nameVon={nameVon}
          heute={heute}
          jetzt={jetzt}
          darfKorrigieren={p.darfKorrigieren}
          onUrlaub={p.darfKorrigieren ? () => setUrlaubVorgabe({ personId: detail.person.id, tag: detail.tag }) : undefined}
          onSpeichern={async (s) => {
            const id = await zeitSchichtSpeichern(p.supabase, s);
            // Heimfahrt geändert (Migration 85): eigene Korrektur mit demselben Grund.
            if (s.heimfahrtMinuten !== undefined && id) await zeitHeimfahrtSetzen(p.supabase, id, s.heimfahrtMinuten, s.grund);
            await neuLadenZeit();
          }}
          onLoeschen={async (id, grund) => { await zeitSchichtLoeschen(p.supabase, id, grund); await neuLadenZeit(); }}
          onClose={() => setDetail(null)}
        />
      )}

      {urlaubVorgabe && (
        <UrlaubBlatt
          personen={personen.length ? personen : [ich]}
          vorgabe={urlaubVorgabe}
          onSetzen={async (u) => { const n = await zeitUrlaubSetzen(p.supabase, u); await neuLadenZeit(); return n; }}
          onLoeschen={async (u) => { const n = await zeitUrlaubLoeschen(p.supabase, u); await neuLadenZeit(); return n; }}
          onClose={() => setUrlaubVorgabe(null)}
        />
      )}

      {nachweis && <ZeitNachweis zeilen={nachweis} monat={monat} onClose={() => setNachweis(null)} />}
    </div>
  );
}

function TagListe({ daten, jetzt, leer, urlaubMs = 0 }: { daten: TagAuswertung; jetzt: number; leer: string; urlaubMs?: number }) {
  if (daten.schichten.length === 0 && urlaubMs === 0) return <div className="zt-hinweis info">{leer}</div>;
  return (
    <>
      <div className="zt-summen">
        <div><b>{dauerText(daten.arbeitMs)} h</b><span>Arbeitszeit</span></div>
        <div><b>{dauerText(daten.pauseMs)} h</b><span>Pausen</span></div>
        {daten.heimfahrtMs > 0 && <div><b>{dauerText(daten.heimfahrtMs)} h</b><span>davon Heimfahrt</span></div>}
        {urlaubMs > 0 && <div><b>{dauerText(urlaubMs)} h</b><span>Urlaub</span></div>}
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
      {heimfahrtMs(s) > 0 && <span className="zt-tag-unter zt-heimfahrt">+ {dauerText(heimfahrtMs(s))} h Heimfahrt gutgeschrieben (in der Arbeitszeit enthalten)</span>}
      {s.korrigiert_am && <span className="zt-tag-unter zt-korrigiert">korrigiert: {s.korrektur_grund}</span>}
      {onBearbeiten && <button type="button" className="zt-link" onClick={onBearbeiten}>Bearbeiten ›</button>}
    </div>
  );
}

function AlleTabelle({ zeilen, urlaub, montag, heute, onZelle }: {
  zeilen: { person: ZeitPerson; woche: ReturnType<typeof wocheAuswerten> }[];
  urlaub: ZeitAbwesenheit[];
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
          {woche.tage.map((x) => {
            // Urlaub ohne Schicht: „U“ in der Zelle (v136). Mit Schicht zählt die Arbeitszeit.
            const u = urlaubAm(urlaub, person.id, x.tag);
            return (
              <button key={x.tag} type="button" role="cell"
                className={"zt-zelle" + (x.hinweise.includes("offen") ? " offen" : x.laeuft ? " laeuft" : !x.schichten.length && u ? " urlaub" : "") + (x.hinweise.some((h) => h === "pause" || h === "lang") ? " warn" : "")}
                onClick={() => onZelle(person, x.tag)} aria-label={`${person.name}, ${tagTitel(x.tag)}: ${x.schichten.length ? dauerText(x.arbeitMs) + " h" : u ? "Urlaub" : "nichts"}`}>
                {x.hinweise.includes("offen") ? "offen" : x.schichten.length ? dauerText(x.arbeitMs) : u ? "U" : "–"}
              </button>
            );
          })}
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
// Seit v136 ein Blatt (components/Blatt.tsx) mit Urlaub und den Korrekturen des Tages.
export function ZeitTagBlatt(p: {
  person: ZeitPerson;
  tag: string;
  schichten: ZeitSchicht[];
  urlaubMs?: number;
  korrekturen?: ZeitKorrektur[];
  nameVon?: (id: string | null) => string;
  heute: string;
  jetzt: number;
  darfKorrigieren: boolean;
  onUrlaub?: () => void;
  onSpeichern: (s: { id: string | null; profileId: string; beginn: string; ende: string | null; pausen: { beginn: string; ende: string }[]; grund: string; heimfahrtMinuten?: number }) => Promise<void>;
  onLoeschen: (id: string, grund: string) => Promise<void>;
  onClose: () => void;
}) {
  const daten = tagAuswerten(p.schichten, p.tag, p.heute, p.jetzt);
  const urlaubMs = p.urlaubMs ?? 0;
  // `undefined` = nichts in Bearbeitung, `null` = neue Schicht nachtragen.
  const [bearbeiten, setBearbeiten] = useState<ZeitSchicht | null | undefined>(undefined);
  return (
    <Blatt titel={`${p.person.name} · ${tagTitel(p.tag)}`} ebene="zt-overlay" className="zt-blatt" onClose={p.onClose}>
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
            {daten.schichten.length ? `${dauerText(daten.arbeitMs)} h Arbeit · ${dauerText(daten.pauseMs)} h Pause` : "Nichts gestempelt."}
            {daten.heimfahrtMs > 0 && ` · davon Heimfahrt ${dauerText(daten.heimfahrtMs)} h`}
            {urlaubMs > 0 && ` · Urlaub ${dauerText(urlaubMs)} h`}{" "}
            <Marken hinweise={daten.hinweise} laeuft={daten.laeuft} />
          </span>
          {daten.schichten.map((s) => <SchichtZeile key={s.id} s={s} jetzt={p.jetzt} onBearbeiten={p.darfKorrigieren ? () => setBearbeiten(s) : undefined} />)}
          {p.darfKorrigieren && p.tag <= p.heute && (
            <button type="button" className="ab-option" onClick={() => setBearbeiten(null)}><span className="ab-text">+ Schicht nachtragen</span></button>
          )}
          {p.onUrlaub && (
            <button type="button" className="ab-option" onClick={p.onUrlaub}><span className="ab-text">{urlaubMs ? "Urlaub ändern oder entfernen" : "+ Urlaub eintragen"}</span></button>
          )}
          {p.korrekturen && <KorrekturListe korrekturen={p.korrekturen} tag={p.tag} nameVon={p.nameVon ?? (() => "Büro")} />}
        </>
      )}
    </Blatt>
  );
}

function SchichtFormularAnsicht(p: {
  schicht: ZeitSchicht | null;
  tag: string;
  personId: string;
  onSpeichern: (s: { id: string | null; profileId: string; beginn: string; ende: string | null; pausen: { beginn: string; ende: string }[]; grund: string; heimfahrtMinuten?: number }) => Promise<void>;
  onLoeschen?: (grund: string) => Promise<void>;
  onAbbrechen: () => void;
}) {
  const [f, setF] = useState<SchichtFormular>(() => formularAusSchicht(p.schicht, p.tag));
  // Heimfahrt (Migration 85): an/aus; gespeichert wird sie nur, wenn sie sich geändert hat.
  const heimVorher = p.schicht?.heimfahrt_minuten ?? 0;
  const [heim, setHeim] = useState(heimVorher > 0);
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
    const heimNeu = heim ? (heimVorher > 0 ? heimVorher : ZEIT_HEIMFAHRT_MINUTEN) : 0;
    void ausfuehren(() => p.onSpeichern({
      id: p.schicht?.id ?? null, profileId: p.personId, ...zeiten, grund: grund.trim(),
      ...(heimNeu !== heimVorher ? { heimfahrtMinuten: heimNeu } : {}),
    }));
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
      <label className="zt-heimfahrt-wahl">
        <input type="checkbox" checked={heim} onChange={(e) => setHeim(e.target.checked)} aria-label="Heimfahrt gutschreiben" />
        <span>Heimfahrt gutschreiben (+ {dauerText((heimVorher || ZEIT_HEIMFAHRT_MINUTEN) * 60_000)} h)</span>
      </label>
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
