import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  antwortVorschau, bezugAus, bezugGeloescht, CHAT_REAKTIONEN, chatListe, darfBearbeiten, darfLoeschen, meineReaktion, reaktionenZaehlen,
  reaktionNachTipp, CHAT_BEZUG_ANSICHT, CHAT_TEXT_MAX, erwaehnteIds, erwaehnungEinsetzen, erwaehnungsAnfrage, erwaehnungsVorschlaege,
  initialen, nachTagen, personenFarbe, textTeile, uhrzeit, ungelesenAnderswo, zahlText,
  type ChatBezug, type ChatFotoAuswahl, type ChatNachricht, type ChatPerson, type ChatUnterhaltung,
} from "@/lib/chat";
import { ROLE_LABEL } from "@/lib/constants";
import { bildVerkleinern } from "@/lib/belegBild";
import { ChatFotoBild, ChatFotoGross } from "./ChatFoto";
import { ChatListe } from "./ChatListe";

// Der Team-Chat (Migration 80, v129, Entwurf „Team-Chat“ vom 08.10.2026). Am Handy über den
// ganzen Bildschirm, am Rechner als Fenster rechts. Ebene 10003 (`.ch-overlay`): Er geht auch
// aus dem Auftrags- oder Kundenfenster heraus auf („In den Chat“) und liegt dann darüber.
//
// Reaktionen und Antworten (Migration 81, v130): lange drücken (Handy) oder der kleine Knopf neben
// der Nachricht (Rechner, beim Darüberfahren) öffnet die Leiste mit sechs Reaktionen, „Antworten“
// und „Kopieren“. Ein Tipp auf eine Reaktion unter der Nachricht setzt oder nimmt die eigene.
//
// Nur mit Netz: Ohne Verbindung steht ein Hinweis da, und Senden ist gesperrt. Eine Nachricht,
// die erst Stunden später ankommt, wäre im Chat irreführender als eine, die gar nicht abgeht.
//
// Seit Migration 84 (v137): Einzelchats (der Knopf rechts im Kopf öffnet die Liste aller
// Unterhaltungen, mit der Zahl der Ungelesenen in den anderen), die eigene Nachricht bearbeiten
// (24 Stunden) und löschen (in derselben Leiste), Fotos (Kamera-Knopf neben „+“) und „Ältere
// Nachrichten laden“ oben im Verlauf. Im Einzelchat gibt es keine @-Erwähnungen – es liest ja nur
// die eine Person.

const KEINE_UNTERHALTUNGEN: ChatUnterhaltung[] = [];
const KEINE_LINKS: Record<string, string> = {};

type Props = {
  nachrichten: ChatNachricht[];
  laedt: boolean;
  fehler: string | null;
  personen: ChatPerson[];
  ichId: string | null;
  darfSchreiben: boolean;
  online: boolean;
  // Die Karte, die an der Eingabe hängt (aus „In den Chat“ oder über „+“).
  bezug: ChatBezug | null;
  onBezug: (b: ChatBezug | null) => void;
  vorschlaege: (suche: string) => ChatBezug[];
  onSenden: (n: { text: string; bezug: ChatBezug | null; erwaehnt: string[]; antwortAuf: string | null; foto: ChatFotoAuswahl | null }) => Promise<void>;
  // Reaktion setzen/ersetzen, `null` nimmt sie zurück. Fehlt ohne „Chat schreiben“.
  onReagieren?: (nachrichtId: string, emoji: string | null) => Promise<void>;
  // Eigene Nachricht bearbeiten / löschen (Migration 84). Fehlen ohne „Chat schreiben“.
  onBearbeiten?: (id: string, text: string) => Promise<void>;
  onLoeschen?: (id: string) => Promise<void>;
  // Die gewählte Unterhaltung: leer = Team-Chat, sonst der Einzelchat mit dieser Person.
  partner?: string | null;
  unterhaltungen?: ChatUnterhaltung[];
  onWechseln?: (partner: string | null) => void;
  // Anzeige-Links der Fotos (Pfad → Link).
  fotoLinks?: Record<string, string>;
  // „Ältere Nachrichten laden“.
  hatMehr?: boolean;
  laedtMehr?: boolean;
  onMehrLaden?: () => void;
  // Verkleinern vor dem Hochladen – austauschbar für die Tests (jsdom hat kein Canvas).
  fotoVerkleinern?: (datei: Blob) => Promise<ChatFotoAuswahl>;
  // Kann diese Rolle die Karte öffnen? Sonst ist sie nur zu lesen.
  kannOeffnen: (b: ChatBezug) => boolean;
  onBezugOeffnen: (b: ChatBezug) => void;
  onClose: () => void;
};

function BezugKarte({ b, klein, onOeffnen, onWeg }: { b: ChatBezug; klein?: boolean; onOeffnen?: () => void; onWeg?: () => void }) {
  const ansicht = CHAT_BEZUG_ANSICHT[b.art];
  const weg = bezugGeloescht(b);
  const inhalt = (
    <>
      <span className="ch-sym" aria-hidden="true">{ansicht.zeichen}</span>
      <span className="ch-bezug-text">
        <b>{b.titel}</b>
        {b.unter && <span>{b.unter}</span>}
        {onOeffnen && !weg && !klein && <span className="ch-oeffnen">{ansicht.oeffnen}</span>}
      </span>
    </>
  );
  const klasse = `ch-bezug ${ansicht.klasse}${klein ? " klein" : ""}${weg ? " weg" : ""}`;
  if (onWeg) {
    return (
      <div className={klasse}>
        {inhalt}
        <button type="button" className="ch-weg" onClick={onWeg} aria-label="Karte entfernen">✕</button>
      </div>
    );
  }
  return onOeffnen && !weg
    ? <button type="button" className={klasse} onClick={onOeffnen}>{inhalt}</button>
    : <div className={klasse}>{inhalt}</div>;
}

export function ChatFenster(p: Props) {
  const [text, setText] = useState("");
  const [ausgewaehlt, setAusgewaehlt] = useState<ChatPerson[]>([]);
  const [anfrage, setAnfrage] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const [sendeFehler, setSendeFehler] = useState<string | null>(null);
  const [plusOffen, setPlusOffen] = useState(false);
  const [plusSuche, setPlusSuche] = useState("");
  const [aktionenFuer, setAktionenFuer] = useState<string | null>(null);
  const [antwortAuf, setAntwortAuf] = useState<ChatNachricht | null>(null);
  const [hervor, setHervor] = useState<string | null>(null);
  const [liste, setListe] = useState(false);
  const [bearbeite, setBearbeite] = useState<ChatNachricht | null>(null);
  const [loeschFrage, setLoeschFrage] = useState<string | null>(null);
  const [foto, setFoto] = useState<(ChatFotoAuswahl & { url: string }) | null>(null);
  const [fotoLaeuft, setFotoLaeuft] = useState(false);
  const [gross, setGross] = useState<string | null>(null);
  const verlaufRef = useRef<HTMLDivElement>(null);
  const feldRef = useRef<HTMLTextAreaElement>(null);
  const dateiRef = useRef<HTMLInputElement>(null);
  const partner = p.partner ?? null;
  const unterhaltungen = p.unterhaltungen ?? KEINE_UNTERHALTUNGEN;
  const fotoLinks = p.fotoLinks ?? KEINE_LINKS;
  // Langes Drücken: Zeitgeber und Startpunkt. Wer dabei wischt, scrollt – dann keine Leiste.
  const druck = useRef<{ zeit: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);

  const nameNach = useMemo(() => new Map(p.personen.map((x) => [x.id, x.name])), [p.personen]);
  const nachrichtNach = useMemo(() => new Map(p.nachrichten.map((x) => [x.id, x])), [p.nachrichten]);
  const nameVon = (id: string) => (id === p.ichId ? "Du" : nameNach.get(id) ?? "Ehemaliger Zugang");
  const gruppen = useMemo(() => nachTagen(p.nachrichten), [p.nachrichten]);
  const vorschlaege = anfrage === null || partner ? [] : erwaehnungsVorschlaege(p.personen, anfrage, p.ichId).slice(0, 6);
  const andere = p.personen.filter((x) => x.id !== p.ichId).map((x) => x.name);
  const partnerName = partner ? nameNach.get(partner) ?? "Ehemaliger Zugang" : null;
  // Hat die Person (noch) Zugang zum Chat? Erst sicher, wenn die Personen geladen sind.
  const partnerErreichbar = !partner || p.personen.length === 0 || nameNach.has(partner);
  const anderswo = ungelesenAnderswo(unterhaltungen, partner);
  const eintraege = useMemo(() => chatListe(unterhaltungen, p.personen, p.ichId), [unterhaltungen, p.personen, p.ichId]);

  // Neue Nachricht oder andere Unterhaltung → nach unten. Kamen ältere oben dazu („Ältere laden“),
  // bleibt die Stelle stehen, an der man gerade liest.
  const ersteId = p.nachrichten[0]?.id;
  const letzteId = p.nachrichten.at(-1)?.id;
  const vorher = useRef<{ erste?: string; letzte?: string; hoehe: number; partner: string | null; liste: boolean }>({ hoehe: 0, partner: null, liste: false });
  useLayoutEffect(() => {
    const v = verlaufRef.current;
    // In der Liste gibt es keinen Verlauf – merken, damit es beim Zurück wieder unten steht.
    if (!v) { vorher.current = { ...vorher.current, liste }; return; }
    const alt = vorher.current;
    if (!liste && alt.partner === partner && !alt.liste && alt.letzte === letzteId && alt.erste !== ersteId && alt.hoehe > 0) {
      v.scrollTop += v.scrollHeight - alt.hoehe;
    } else if (!liste && (alt.letzte !== letzteId || alt.partner !== partner || alt.liste)) {
      v.scrollTop = v.scrollHeight;
    }
    vorher.current = { erste: ersteId, letzte: letzteId, hoehe: v.scrollHeight, partner, liste };
  }, [ersteId, letzteId, partner, liste]);

  // Beim Wechsel der Unterhaltung: Eingabe und offene Leisten zurücksetzen.
  const [fuer, setFuer] = useState(partner);
  if (fuer !== partner) {
    setFuer(partner);
    setText(""); setAusgewaehlt([]); setAnfrage(null); setAntwortAuf(null); setBearbeite(null);
    setAktionenFuer(null); setLoeschFrage(null); setSendeFehler(null);
  }

  // Escape schließt – erst die offene Auswahl, dann das Fenster.
  useEffect(() => {
    function taste(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (gross) setGross(null);
      else if (loeschFrage) setLoeschFrage(null);
      else if (plusOffen) setPlusOffen(false);
      else if (anfrage !== null) setAnfrage(null);
      else if (aktionenFuer) setAktionenFuer(null);
      else if (bearbeite) bearbeitenAbbrechen();
      else if (antwortAuf) setAntwortAuf(null);
      else if (liste) setListe(false);
      else p.onClose();
    }
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  });

  // Die Vorschau eines gewählten Fotos ist eine Blob-Adresse – beim Verwerfen wieder freigeben.
  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto.url); }, [foto]);

  function textAendern(neu: string, cursor: number) {
    setText(neu.slice(0, CHAT_TEXT_MAX));
    setAnfrage(erwaehnungsAnfrage(neu.slice(0, cursor)));
    setSendeFehler(null);
  }

  function erwaehnen(person: ChatPerson) {
    const feld = feldRef.current;
    const cursor = feld?.selectionStart ?? text.length;
    const neu = erwaehnungEinsetzen(text, cursor, person.name);
    setText(neu.text);
    setAnfrage(null);
    setAusgewaehlt((alt) => (alt.some((x) => x.id === person.id) ? alt : [...alt, person]));
    requestAnimationFrame(() => {
      feld?.focus();
      feld?.setSelectionRange(neu.cursor, neu.cursor);
    });
  }

  const hatInhalt = text.trim().length > 0 || (bearbeite ? !!bearbeite.foto_pfad : !!foto);
  const kannSenden = p.darfSchreiben && p.online && !sendet && !fotoLaeuft && partnerErreichbar && hatInhalt;

  async function senden() {
    if (!kannSenden) return;
    setSendet(true);
    setSendeFehler(null);
    try {
      const t = text.trim();
      if (bearbeite) {
        if (t !== bearbeite.text && p.onBearbeiten) await p.onBearbeiten(bearbeite.id, t);
        setBearbeite(null);
      } else {
        await p.onSenden({
          text: t, bezug: p.bezug, erwaehnt: partner ? [] : erwaehnteIds(t, ausgewaehlt), antwortAuf: antwortAuf?.id ?? null,
          foto: foto ? { blob: foto.blob, breite: foto.breite, hoehe: foto.hoehe } : null,
        });
        setAntwortAuf(null);
        setFoto(null);
      }
      setText("");
      setAusgewaehlt([]);
      setAnfrage(null);
    } catch (e) {
      setSendeFehler(e instanceof Error ? e.message : "Die Nachricht konnte nicht gesendet werden.");
    } finally {
      setSendet(false);
    }
  }

  function bearbeitenStart(n: ChatNachricht) {
    setAktionenFuer(null);
    setAntwortAuf(null);
    setBearbeite(n);
    setText(n.text);
    setSendeFehler(null);
    requestAnimationFrame(() => feldRef.current?.focus());
  }
  function bearbeitenAbbrechen() {
    setBearbeite(null);
    setText("");
  }

  async function loeschen(n: ChatNachricht) {
    setLoeschFrage(null);
    setAktionenFuer(null);
    if (!p.onLoeschen) return;
    try {
      await p.onLoeschen(n.id);
      if (bearbeite?.id === n.id) bearbeitenAbbrechen();
    } catch (e) {
      setSendeFehler(e instanceof Error ? e.message : "Die Nachricht konnte nicht gelöscht werden.");
    }
  }

  async function fotoGewaehlt(datei: File | undefined) {
    if (!datei) return;
    setFotoLaeuft(true);
    setSendeFehler(null);
    try {
      const klein = await (p.fotoVerkleinern ?? bildVerkleinern)(datei);
      setFoto({ ...klein, url: URL.createObjectURL(klein.blob) });
    } catch (e) {
      setSendeFehler(e instanceof Error ? e.message : "Das Foto konnte nicht verarbeitet werden.");
    } finally {
      setFotoLaeuft(false);
      if (dateiRef.current) dateiRef.current.value = "";
    }
  }

  function wechseln(ziel: string | null) {
    setListe(false);
    p.onWechseln?.(ziel);
  }

  function taste(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Am Rechner schickt Enter ab, Umschalt+Enter macht eine neue Zeile. Am Handy macht Enter
    // immer eine neue Zeile – dort gibt es den Senden-Knopf, und ein versehentliches Absenden
    // mitten im Satz wäre ärgerlicher als ein Knopfdruck mehr.
    if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
      if (vorschlaege.length > 0) { e.preventDefault(); erwaehnen(vorschlaege[0]); return; }
      e.preventDefault();
      void senden();
    }
  }

  const plusTreffer = plusOffen ? p.vorschlaege(plusSuche) : [];
  const kannReagieren = p.darfSchreiben && !!p.onReagieren;

  function druckStart(e: React.PointerEvent, id: string) {
    if (!kannReagieren || e.pointerType === "mouse" || nachrichtNach.get(id)?.geloescht_am) return;
    const x = e.clientX, y = e.clientY;
    druckEnde();
    druck.current = { x, y, zeit: setTimeout(() => { druck.current = null; setAktionenFuer(id); }, 450) };
  }
  function druckBewegt(e: React.PointerEvent) {
    const d = druck.current;
    if (d && (Math.abs(e.clientX - d.x) > 8 || Math.abs(e.clientY - d.y) > 8)) druckEnde();
  }
  function druckEnde() {
    if (druck.current) clearTimeout(druck.current.zeit);
    druck.current = null;
  }

  async function reagieren(n: ChatNachricht, emoji: string) {
    if (!p.onReagieren) return;
    setAktionenFuer(null);
    try {
      await p.onReagieren(n.id, reaktionNachTipp(meineReaktion(n.reaktionen, p.ichId), emoji));
    } catch (e) {
      setSendeFehler(e instanceof Error ? e.message : "Die Reaktion konnte nicht gespeichert werden.");
    }
  }

  function antworten(n: ChatNachricht) {
    setAktionenFuer(null);
    setAntwortAuf(n);
    requestAnimationFrame(() => feldRef.current?.focus());
  }

  // Zum Zitat springen: die Ursprungsnachricht in die Mitte holen und kurz hervorheben.
  function zuNachricht(id: string) {
    const el = verlaufRef.current?.querySelector(`[data-nachricht="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHervor(id);
    setTimeout(() => setHervor((h) => (h === id ? null : h)), 1600);
  }

  const kopf = liste ? (
    <div className="ch-kopf">
      <button type="button" className="dm-zu" onClick={p.onClose} aria-label="Schließen">×</button>
      <span className="ch-kopf-text"><b>Chats</b><span>Team-Chat und Einzelchats</span></span>
      <button type="button" className="ch-chats an" onClick={() => setListe(false)} aria-label="Zurück zur Unterhaltung" aria-expanded>
        <ListenZeichen />
      </button>
    </div>
  ) : (
    <div className="ch-kopf">
      <button type="button" className="dm-zu" onClick={p.onClose} aria-label="Schließen">×</button>
      {partner
        ? <span className="ch-gruppe" style={{ background: personenFarbe(partner) }} aria-hidden="true">{initialen(partnerName || "?")}</span>
        : <span className="ch-gruppe" aria-hidden="true">MR</span>}
      <span className="ch-kopf-text">
        <b>{partner ? partnerName : "Team-Chat"}</b>
        <span>{partner
          ? "Einzelchat · nur ihr beide seht das"
          : andere.length > 0 ? `${andere.join(", ")} · alle sehen alles` : "alle mit Zugang sehen alles"}</span>
      </span>
      {p.onWechseln && (
        <button type="button" className="ch-chats" onClick={() => { setListe(true); setAktionenFuer(null); }}
          aria-label={anderswo > 0 ? `Alle Chats, ${anderswo} ungelesen` : "Alle Chats"} title="Alle Chats">
          <ListenZeichen />
          {anderswo > 0 && <span className="ch-zahl">{zahlText(anderswo)}</span>}
        </button>
      )}
    </div>
  );

  return (
    <div className="modal-overlay ch-overlay" onClick={p.onClose}>
      <div className="ch-fenster" role="dialog" aria-label={partner ? `Einzelchat mit ${partnerName}` : "Team-Chat"} onClick={(e) => e.stopPropagation()}>
        {kopf}

        {liste ? <ChatListe eintraege={eintraege} aktuell={partner} onWahl={wechseln} /> : (
        <div className="ch-verlauf" ref={verlaufRef}>
          {p.hatMehr && p.onMehrLaden && (
            <button type="button" className="ch-mehr-laden" onClick={p.onMehrLaden} disabled={p.laedtMehr}>
              {p.laedtMehr ? "lädt …" : "Ältere Nachrichten laden"}
            </button>
          )}
          {p.fehler && <div className="ch-hinweis fehler" role="alert">{p.fehler}</div>}
          {p.laedt && p.nachrichten.length === 0 && <div className="ch-hinweis">Lädt …</div>}
          {!p.laedt && !p.fehler && p.nachrichten.length === 0 && (
            <div className="ch-hinweis">{partner
              ? `Noch nichts geschrieben. Diese Unterhaltung sehen nur du und ${partnerName}.`
              : "Noch keine Nachrichten. Schreib die erste – oder hol über „In den Chat“ einen Auftrag hierher."}</div>
          )}
          {gruppen.map((g) => (
            <div key={g.tag + g.nachrichten[0].id} className="ch-tag-gruppe">
              <span className="ch-tag">{g.tag}</span>
              {g.nachrichten.map((n) => {
                const eigen = n.autor === p.ichId;
                const weg = !!n.geloescht_am;
                const b = weg ? null : bezugAus(n);
                const namen = n.erwaehnt.map((id) => nameNach.get(id)).filter((x): x is string => !!x);
                const michGemeint = !weg && !!p.ichId && n.erwaehnt.includes(p.ichId);
                const zitat = !weg && n.antwort_auf !== undefined && n.antwort_auf !== null ? antwortVorschau(nachrichtNach.get(n.antwort_auf), nameVon) : null;
                const zaehlung = weg ? [] : reaktionenZaehlen(n.reaktionen, p.ichId, nameVon);
                const offen = aktionenFuer === n.id && !weg;
                const aktionen = kannReagieren && !weg;
                const mitBearbeiten = !!p.onBearbeiten && darfBearbeiten(n, p.ichId);
                const mitLoeschen = !!p.onLoeschen && darfLoeschen(n, p.ichId);
                return (
                  <div key={n.id} data-nachricht={n.id} className={"ch-zeile " + (eigen ? "eigen" : "fremd")}>
                    <div
                      className={"ch-nachricht " + (eigen ? "eigen" : "fremd") + (michGemeint ? " mich" : "") + (hervor === n.id ? " hervor" : "")
                        + (weg ? " geloescht" : "") + (bearbeite?.id === n.id ? " in-arbeit" : "")}
                      onPointerDown={(e) => druckStart(e, n.id)} onPointerMove={druckBewegt} onPointerUp={druckEnde} onPointerCancel={druckEnde}
                      onContextMenu={aktionen ? (e) => { e.preventDefault(); setAktionenFuer(n.id); } : undefined}
                    >
                      {!eigen && !partner && <div className="ch-wer" style={{ color: personenFarbe(n.autor) }}>{nameNach.get(n.autor) ?? "Ehemaliger Zugang"}</div>}
                      {weg ? <div className="ch-text ch-weg-text">Nachricht gelöscht</div> : (
                        <>
                          {zitat && (
                            <button type="button" className="ch-zitat" onClick={() => n.antwort_auf && zuNachricht(n.antwort_auf)} aria-label={`Antwort auf ${zitat.wer || "eine frühere Nachricht"}`}>
                              {zitat.wer && <b>{zitat.wer}</b>}
                              <span>{zitat.text}</span>
                            </button>
                          )}
                          {n.foto_pfad && <ChatFotoBild breite={n.foto_breite} hoehe={n.foto_hoehe} link={fotoLinks[n.foto_pfad]} onGross={setGross} />}
                          {b && <BezugKarte b={b} onOeffnen={p.kannOeffnen(b) ? () => p.onBezugOeffnen(b) : undefined} />}
                          {n.text && (
                            <div className="ch-text">
                              {textTeile(n.text, namen).map((t, i) => t.erwaehnung ? <span key={i} className="ch-at">{t.text}</span> : <span key={i}>{t.text}</span>)}
                            </div>
                          )}
                        </>
                      )}
                      <div className="ch-zeit">{n.bearbeitet_am && !weg ? "bearbeitet · " : ""}{uhrzeit(n.created_at)}</div>
                      {aktionen && (
                        <button type="button" className={"ch-mehr" + (offen ? " an" : "")} onClick={() => { setLoeschFrage(null); setAktionenFuer(offen ? null : n.id); }}
                          aria-label="Reagieren oder antworten" aria-expanded={offen}>☺</button>
                      )}
                    </div>
                    {zaehlung.length > 0 && (
                      <div className="ch-reaktionen">
                        {zaehlung.map((z) => (
                          <button key={z.emoji} type="button" className={"ch-reaktion" + (z.ich ? " ich" : "")} disabled={!kannReagieren}
                            title={z.namen.join(", ")} aria-label={`${z.emoji} ${z.anzahl}: ${z.namen.join(", ")}`} onClick={() => void reagieren(n, z.emoji)}>
                            {z.emoji}{z.anzahl > 1 && <span>{z.anzahl}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {offen && (
                      <div className="ch-aktionen" role="toolbar" aria-label="Reaktion oder Antwort">
                        {loeschFrage === n.id ? (
                          <div className="ch-loeschfrage">
                            <span>Nachricht für alle löschen? Das lässt sich nicht zurückholen.</span>
                            <div className="ch-aktion-knoepfe">
                              <button type="button" onClick={() => setLoeschFrage(null)}>Abbrechen</button>
                              <button type="button" className="gefahr" onClick={() => void loeschen(n)}>Löschen</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="ch-emojis">
                              {CHAT_REAKTIONEN.map((e) => (
                                <button key={e} type="button" className={"ch-emoji" + (meineReaktion(n.reaktionen, p.ichId) === e ? " ich" : "")}
                                  aria-pressed={meineReaktion(n.reaktionen, p.ichId) === e} aria-label={`Reaktion ${e}`} onClick={() => void reagieren(n, e)}>{e}</button>
                              ))}
                            </div>
                            <div className="ch-aktion-knoepfe">
                              <button type="button" onClick={() => antworten(n)}>↩ Antworten</button>
                              {n.text && <button type="button" onClick={() => { void navigator.clipboard?.writeText(n.text).catch(() => {}); setAktionenFuer(null); }}>Kopieren</button>}
                            </div>
                            {(mitBearbeiten || mitLoeschen) && (
                              <div className="ch-aktion-knoepfe">
                                {mitBearbeiten && <button type="button" onClick={() => bearbeitenStart(n)}>Bearbeiten</button>}
                                {mitLoeschen && <button type="button" className="gefahr" onClick={() => setLoeschFrage(n.id)}>Löschen</button>}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        )}

        {!liste && vorschlaege.length > 0 && (
          <div className="ch-liste" role="listbox" aria-label="Erwähnen">
            <div className="ch-liste-titel">ERWÄHNEN</div>
            {vorschlaege.map((x, i) => (
              <button key={x.id} type="button" role="option" aria-selected={i === 0} className={"ch-person" + (i === 0 ? " an" : "")}
                onMouseDown={(e) => e.preventDefault()} onClick={() => erwaehnen(x)}>
                <span className="ch-av" style={{ background: personenFarbe(x.id) }}>{initialen(x.name)}</span>
                <b>{x.name}<span>{ROLE_LABEL[x.rolle as keyof typeof ROLE_LABEL] ?? x.rolle}</span></b>
              </button>
            ))}
          </div>
        )}

        {!liste && plusOffen && (
          <div className="ch-liste ch-plus" role="dialog" aria-label="Karte anhängen">
            <div className="ch-liste-titel">KARTE ANHÄNGEN</div>
            <input
              className="ch-plus-suche" autoFocus value={plusSuche} onChange={(e) => setPlusSuche(e.target.value)}
              placeholder="Auftragsnummer, Titel oder Kunde" aria-label="Auftrag oder Kunde suchen"
            />
            {plusTreffer.length === 0
              ? <div className="ch-hinweis klein">{plusSuche.trim() ? "Nichts gefunden." : "Keine Termine ab heute – tipp eine Nummer oder einen Namen."}</div>
              : plusTreffer.map((b) => (
                <button key={b.art + b.id} type="button" className="ch-plus-treffer" onClick={() => { p.onBezug(b); setPlusOffen(false); setPlusSuche(""); feldRef.current?.focus(); }}>
                  <BezugKarte b={b} klein />
                </button>
              ))}
            <span className="small">Lagerplätze und Verkaufsreifen über „In den Chat“ im Lager.</span>
          </div>
        )}

        {liste ? null : p.darfSchreiben ? (
          <div className="ch-eingabe">
            {!p.online && <div className="ch-hinweis warn">Ohne Netz – Senden geht erst wieder mit Verbindung.</div>}
            {!partnerErreichbar && <div className="ch-hinweis warn">{partnerName} hat keinen Zugang zum Chat mehr – schreiben geht hier nicht.</div>}
            {sendeFehler && <div className="ch-hinweis fehler" role="alert">{sendeFehler}</div>}
            {bearbeite && (
              <div className="ch-zitat eingabe bearbeiten">
                <span><b>Nachricht bearbeiten</b><span>{bearbeite.text || "Foto ohne Text"}</span></span>
                <button type="button" className="ch-weg" onClick={bearbeitenAbbrechen} aria-label="Bearbeiten abbrechen">✕</button>
              </div>
            )}
            {!bearbeite && antwortAuf && (() => {
              const z = antwortVorschau(antwortAuf, nameVon);
              return (
                <div className="ch-zitat eingabe">
                  <span><b>{antwortAuf.autor === p.ichId ? "Antwort auf deine Nachricht" : `Antwort an ${z.wer}`}</b><span>{z.text}</span></span>
                  <button type="button" className="ch-weg" onClick={() => setAntwortAuf(null)} aria-label="Antwort abbrechen">✕</button>
                </div>
              );
            })()}
            {!bearbeite && foto && (
              <div className="ch-foto-vorschau">
                <img src={foto.url} alt="Gewähltes Foto" />
                <span>Foto · wird mit der Nachricht gesendet</span>
                <button type="button" className="ch-weg" onClick={() => setFoto(null)} aria-label="Foto entfernen">✕</button>
              </div>
            )}
            {!bearbeite && p.bezug && <BezugKarte b={p.bezug} klein onWeg={() => p.onBezug(null)} />}
            <div className="ch-feld">
              {!bearbeite && (
                <>
                  <button type="button" className={"ch-plus-knopf" + (plusOffen ? " an" : "")} onClick={() => setPlusOffen(!plusOffen)}
                    aria-label="Auftrag oder Kunde anhängen" aria-expanded={plusOffen}>+</button>
                  <button type="button" className="ch-plus-knopf ch-kamera" onClick={() => dateiRef.current?.click()} disabled={fotoLaeuft || !!foto}
                    aria-label={fotoLaeuft ? "Foto wird vorbereitet" : "Foto anhängen"} title="Foto anhängen">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l1.5 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5L9 4zm3 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" /></svg>
                  </button>
                  <input ref={dateiRef} type="file" accept="image/*" hidden aria-label="Foto auswählen" onChange={(e) => void fotoGewaehlt(e.target.files?.[0])} />
                </>
              )}
              <textarea
                ref={feldRef}
                className="ch-textfeld"
                rows={1}
                value={text}
                maxLength={CHAT_TEXT_MAX}
                placeholder={bearbeite ? "Neuer Text" : partner ? `Nachricht an ${partnerName}` : "Nachricht · @ erwähnen"}
                aria-label="Nachricht"
                onChange={(e) => textAendern(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                onKeyDown={taste}
                onBlur={() => setTimeout(() => setAnfrage(null), 150)}
              />
              <button type="button" className="ch-senden" onClick={() => void senden()} disabled={!kannSenden} aria-label={bearbeite ? "Änderung speichern" : "Senden"}>
                {bearbeite ? "✓" : "➤"}
              </button>
            </div>
          </div>
        ) : (
          <div className="ch-eingabe"><div className="ch-hinweis">Du kannst hier mitlesen, aber nicht schreiben.</div></div>
        )}
      </div>
      {gross && <ChatFotoGross link={gross} onClose={() => setGross(null)} />}
    </div>
  );
}

function ListenZeichen() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z" /></svg>;
}
