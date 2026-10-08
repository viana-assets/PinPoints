import type { Customer, Order, Saison, Verkaufsreifen } from "./types";
import { CHAT_PARAMETER, SAISON_LABEL } from "./constants";
import { anzeigeName } from "./kundenAnsicht";
import { ortAus } from "./saisonAnsicht";
import { datumKurz, WOCHENTAG_KURZ } from "./dashboard";
import { groesseText, reifenName } from "./reifenverkauf";
import type { PushInhalt } from "./pushInhalt";

// Die Regeln hinter dem Team-Chat (Migration 80, v129). Reine Funktionen, geprüft in
// tests/chat.test.ts. Datenzugriff in lib/api/chat.ts, Versand der Push-Meldung in
// lib/chatVersand.ts, Oberfläche in components/chat/.
//
// Ein gemeinsamer Chat für alle mit dem Recht „chat · lesen“ – seit Migration 84 (v137) dazu
// Einzelchats zwischen zwei Personen, Bearbeiten/Löschen der eigenen Nachricht und Fotos (unten,
// „Einzelchats, Bearbeiten/Löschen, Fotos“). Eine Nachricht kann eine KARTE
// tragen – Auftrag, Kunde, Lagerplatz oder Verkaufsreifen. Die Karte ist ein Schnappschuss
// (Titel und Unterzeile, wie sie beim Schreiben galten) plus die Kennung, über die das Antippen
// den aktuellen Stand öffnet.

// So lang darf eine Nachricht sein. Dieselbe Grenze prüft die Datenbank (`chat_text_laenge`).
export const CHAT_TEXT_MAX = 4000;
// So viel von der Nachricht steht in der Push-Meldung. Der Sperrbildschirm zeigt ohnehin nur
// zwei, drei Zeilen; der Rest steht im Chat.
export const CHAT_PUSH_TEXT_MAX = 140;
// So viele Nachrichten lädt der Chat beim Öffnen einer Unterhaltung. Ältere bleiben gespeichert
// (12 Monate); „Ältere laden“ oben im Verlauf holt jeweils so viele dazu (seit v137).
export const CHAT_LADEN_ANZAHL = 300;
export const CHAT_NACHLADEN_ANZAHL = 300;
// So lange nach dem Schreiben lässt sich eine Nachricht bearbeiten (Migration 84). Dieselbe Frist
// prüft die Datenbank (`chat_nachricht_aendern()`). Wer eine Stelle ändert, ändert beide. Löschen
// geht jederzeit.
export const CHAT_BEARBEITEN_STUNDEN = 24;
// Der private Speicherbereich für Fotos im Chat (Migration 84). Erster Ordner = der Schreiber.
export const CHAT_FOTO_BUCKET = "chat-fotos";
// Rückfall, falls die Live-Verbindung (Supabase Realtime) nicht steht: so oft wird nachgefragt.
export const CHAT_ABFRAGE_MS = 20_000;
// Länge eines Kartentitels und einer Unterzeile. Ein Auftragstitel kann lang sein; auf der Karte
// zählt, dass man sie erkennt.
export const CHAT_BEZUG_MAX = 120;

export type ChatBezugArt = "auftrag" | "kunde" | "platz" | "verkaufsreifen";

export type ChatBezug = { art: ChatBezugArt; id: string; titel: string; unter: string | null };

// Die Reaktionen (Migration 81, v130). Dieselbe Liste prüft die Datenbank (`chat_reaktion_bekannt`).
// Wer eine Stelle ändert, ändert beide.
export const CHAT_REAKTIONEN = ["👍", "👎", "❤️", "😂", "😮", "✅"] as const;
export type ChatReaktionEmoji = (typeof CHAT_REAKTIONEN)[number];
export type ChatReaktion = { profile_id: string; emoji: string };

export type ChatNachricht = {
  id: string;
  // Seit Migration 84: 'team' oder 'direkt' (Einzelchat mit Empfänger `an`).
  kanal?: "team" | "direkt";
  an?: string | null;
  autor: string;
  text: string;
  // Bearbeitet bzw. gelöscht (Migration 84). Eine gelöschte Nachricht hat keinen Text mehr.
  bearbeitet_am?: string | null;
  geloescht_am?: string | null;
  // Foto (Migration 84): Pfad im Bucket `chat-fotos` und die Maße nach dem Verkleinern.
  foto_pfad?: string | null;
  foto_breite?: number | null;
  foto_hoehe?: number | null;
  // Worauf die Nachricht antwortet (Migration 81). Leer, wenn keine Antwort oder die
  // Ursprungsnachricht aufgeräumt ist.
  antwort_auf?: string | null;
  reaktionen?: ChatReaktion[];
  bezug_art: ChatBezugArt | null;
  bezug_id: string | null;
  bezug_titel: string | null;
  bezug_unter: string | null;
  erwaehnt: string[];
  created_at: string;
};

export type ChatPerson = { id: string; name: string; rolle: string };

// Eine Zeile der Unterhaltungsliste (`chat_unterhaltungen()`, Migration 84). `partner` leer = Team.
export type ChatUnterhaltung = {
  partner: string | null;
  letzte_am: string | null;
  letzte_von: string | null;
  letzte_text: string | null;
  letzte_foto: boolean;
  ungelesen: number;
};

// Wie die Karte im Verlauf aussieht: Zeichen links, Farbe, Text des Knopfes.
export const CHAT_BEZUG_ANSICHT: Record<ChatBezugArt, { zeichen: string; oeffnen: string; klasse: string }> = {
  auftrag:        { zeichen: "#", oeffnen: "Auftrag öffnen ›", klasse: "" },
  kunde:          { zeichen: "K", oeffnen: "Kunde öffnen ›", klasse: "kunde" },
  platz:          { zeichen: "L", oeffnen: "Im Lager öffnen ›", klasse: "lager" },
  verkaufsreifen: { zeichen: "R", oeffnen: "Im Lager öffnen ›", klasse: "lager" },
};

export function kuerzen(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function zusammen(teile: (string | null | undefined)[]): string | null {
  const t = teile.map((x) => (x || "").trim()).filter(Boolean).join(" · ");
  return t ? kuerzen(t, CHAT_BEZUG_MAX) : null;
}

// „Auftrag #114 · Räderwechsel“ – darunter Kunde, Tag und Uhrzeit.
export function bezugAuftrag(
  o: Pick<Order, "id" | "order_number" | "title" | "order_date" | "time">,
  kundenName: string | null | undefined
): ChatBezug {
  return {
    art: "auftrag",
    id: o.id,
    titel: kuerzen(`Auftrag #${o.order_number}${o.title?.trim() ? ` · ${o.title.trim()}` : ""}`, CHAT_BEZUG_MAX),
    unter: zusammen([kundenName, o.order_date ? datumKurz(o.order_date) : null, o.time]),
  };
}

// „Kunde Autohaus Beispiel GmbH“ – darunter der Ansprechpartner (bei Firmen) und der Ort. Keine
// Straße und keine Rufnummer: Die Karte zeigt, WER gemeint ist; der Rest steht im Kundenfenster.
export function bezugKunde(c: Pick<Customer, "id" | "name" | "company" | "address">): ChatBezug {
  const name = anzeigeName(c);
  return {
    art: "kunde",
    id: c.id,
    titel: kuerzen(`Kunde ${name}`, CHAT_BEZUG_MAX),
    unter: zusammen([c.company?.trim() && c.name.trim() !== name ? c.name : null, ortAus(c.address)]),
  };
}

// „Lagerplatz A-11“ – darunter, was dort liegt.
export function bezugPlatz(
  platz: { id: string; code: string },
  inhalt: { kundenName?: string | null; saison?: Saison | null; groesse?: string | null; lager?: string | null } = {}
): ChatBezug {
  return {
    art: "platz",
    id: platz.id,
    titel: kuerzen(`Lagerplatz ${platz.code}`, CHAT_BEZUG_MAX),
    unter: zusammen([inhalt.kundenName, inhalt.saison ? SAISON_LABEL[inhalt.saison] : null, inhalt.groesse, inhalt.lager]),
  };
}

// „Verkaufsreifen 205/55 R16“ – darunter Hersteller, Saison und Bestand.
export function bezugVerkaufsreifen(
  r: Pick<Verkaufsreifen, "id" | "breite" | "querschnitt" | "zoll" | "hersteller" | "modell" | "saison" | "bestand">
): ChatBezug {
  return {
    art: "verkaufsreifen",
    id: r.id,
    titel: kuerzen(`Verkaufsreifen ${groesseText(r)}`, CHAT_BEZUG_MAX),
    unter: zusammen([reifenName(r), SAISON_LABEL[r.saison], `${r.bestand} Stk.`]),
  };
}

export function bezugAus(n: Pick<ChatNachricht, "bezug_art" | "bezug_id" | "bezug_titel" | "bezug_unter">): ChatBezug | null {
  if (!n.bezug_art || !n.bezug_id) return null;
  return { art: n.bezug_art, id: n.bezug_id, titel: n.bezug_titel || "", unter: n.bezug_unter };
}

// Eine Karte, deren Sache endgültig gelöscht wurde (Migration 80, `chat_bezug_vergessen`), öffnet
// nichts mehr.
// Die Texte setzt die Datenbank; hier stehen dieselben drei.
const GELOESCHT = new Set(["Kunde gelöscht", "Auftrag gelöscht", "gelöscht"]);
export function bezugGeloescht(b: ChatBezug): boolean {
  return GELOESCHT.has(b.titel);
}

// ---------------------------------------------------------------------------------------------
// @-Erwähnungen
//
// Im Text steht „@Name“ als gewöhnlicher Text; welche Personen gemeint sind, steht daneben in
// `erwaehnt` (Kennungen). Beim Absenden zählt nur, wessen „@Name“ noch im Text steht – wer ein
// ausgewähltes @Jan wieder löscht, erwähnt Jan nicht mehr.
// ---------------------------------------------------------------------------------------------

// Steht der Cursor hinter einem angefangenen „@…“? Dann die Buchstaben danach, sonst null.
// „Danke @Vi|“ → „Vi“, „Danke @|“ → „“, „mail@firma|“ → null (kein Leerzeichen davor).
export function erwaehnungsAnfrage(textBisCursor: string): string | null {
  const t = /(?:^|\s)@([^\s@]{0,30})$/.exec(textBisCursor);
  return t ? t[1] : null;
}

// Wer passt zu dem Angefangenen? Groß/klein egal, Anfang eines beliebigen Namensteils.
export function erwaehnungsVorschlaege(personen: ChatPerson[], anfrage: string, ohne: string | null): ChatPerson[] {
  const a = anfrage.toLocaleLowerCase("de");
  return personen.filter((p) => p.id !== ohne && (a === "" || p.name.toLocaleLowerCase("de").split(/\s+/).some((teil) => teil.startsWith(a)) || p.name.toLocaleLowerCase("de").startsWith(a)));
}

// Setzt „@Name “ an die Stelle des angefangenen „@…“. Gibt den neuen Text und die neue
// Cursorposition zurück.
export function erwaehnungEinsetzen(text: string, cursor: number, name: string): { text: string; cursor: number } {
  const vorher = text.slice(0, cursor);
  const nachher = text.slice(cursor);
  const anfrage = erwaehnungsAnfrage(vorher);
  const anfang = anfrage === null ? vorher : vorher.slice(0, vorher.length - anfrage.length - 1);
  const eingesetzt = `${anfang}${anfrage === null && anfang && !/\s$/.test(anfang) ? " " : ""}@${name} `;
  return { text: eingesetzt + nachher.replace(/^\s+/, ""), cursor: eingesetzt.length };
}

// Welche der ausgewählten Personen stehen beim Absenden noch als „@Name“ im Text?
export function erwaehnteIds(text: string, ausgewaehlt: ChatPerson[]): string[] {
  return Array.from(new Set(ausgewaehlt.filter((p) => text.includes(`@${p.name}`)).map((p) => p.id)));
}

export type TextTeil = { text: string; erwaehnung: boolean };

// Zerlegt den Text für die Anzeige: „@Name“ der erwähnten Personen wird hervorgehoben. Längere
// Namen zuerst, damit „@Jan Becker“ nicht als „@Jan“ + „ Becker“ zerfällt.
export function textTeile(text: string, namen: string[]): TextTeil[] {
  const sortiert = Array.from(new Set(namen.filter(Boolean))).sort((a, b) => b.length - a.length);
  if (sortiert.length === 0) return [{ text, erwaehnung: false }];
  const muster = new RegExp(`@(?:${sortiert.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const teile: TextTeil[] = [];
  let pos = 0;
  for (const treffer of text.matchAll(muster)) {
    const i = treffer.index ?? 0;
    if (i > pos) teile.push({ text: text.slice(pos, i), erwaehnung: false });
    teile.push({ text: treffer[0], erwaehnung: true });
    pos = i + treffer[0].length;
  }
  if (pos < text.length) teile.push({ text: text.slice(pos), erwaehnung: false });
  return teile;
}

// ---------------------------------------------------------------------------------------------
// Anzeige
// ---------------------------------------------------------------------------------------------

function tagSchluessel(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ---------------------------------------------------------------------------------------------
// Reaktionen und Antworten (Migration 81, v130)
// ---------------------------------------------------------------------------------------------

export type ReaktionsZaehlung = { emoji: string; anzahl: number; ich: boolean; namen: string[] };

// Die Reaktionen unter einer Nachricht: je Emoji die Zahl, ob ich dabei bin, und wer – in der
// festen Reihenfolge von CHAT_REAKTIONEN, nicht in der Reihenfolge des Eintreffens (sonst springen
// die Knöpfe herum, während man tippt).
export function reaktionenZaehlen(reaktionen: ChatReaktion[] | undefined, ichId: string | null, nameVon: (id: string) => string): ReaktionsZaehlung[] {
  const liste = reaktionen || [];
  return CHAT_REAKTIONEN
    .map((emoji) => {
      const wer = liste.filter((r) => r.emoji === emoji);
      return { emoji, anzahl: wer.length, ich: wer.some((r) => r.profile_id === ichId), namen: wer.map((r) => nameVon(r.profile_id)) };
    })
    .filter((z) => z.anzahl > 0);
}

// Ein Tipp auf ein Emoji: dasselbe noch einmal nimmt die Reaktion zurück, ein anderes ersetzt sie
// (je Person eine Reaktion je Nachricht, wie bei WhatsApp).
export function reaktionNachTipp(meine: string | null, getippt: string): string | null {
  return meine === getippt ? null : getippt;
}

export function meineReaktion(reaktionen: ChatReaktion[] | undefined, ichId: string | null): string | null {
  return (reaktionen || []).find((r) => r.profile_id === ichId)?.emoji ?? null;
}

// Das Zitat über einer Antwort: wer, und der Anfang des Textes. Ist die Ursprungsnachricht nicht
// (mehr) geladen, steht „frühere Nachricht“ da.
export const CHAT_ZITAT_MAX = 90;
export function antwortVorschau(
  ursprung: Pick<ChatNachricht, "autor" | "text" | "bezug_titel" | "geloescht_am" | "foto_pfad"> | null | undefined,
  nameVon: (id: string) => string
): { wer: string; text: string } {
  if (!ursprung) return { wer: "", text: "frühere Nachricht" };
  if (ursprung.geloescht_am) return { wer: nameVon(ursprung.autor), text: "Nachricht gelöscht" };
  return { wer: nameVon(ursprung.autor), text: kuerzen(ursprung.text || ursprung.bezug_titel || (ursprung.foto_pfad ? "📷 Foto" : ""), CHAT_ZITAT_MAX) };
}

// ---------------------------------------------------------------------------------------------
// Einzelchats, Bearbeiten/Löschen, Fotos (Migration 84, v137)
// ---------------------------------------------------------------------------------------------

// Bearbeiten: nur die eigene, nicht gelöschte Nachricht, nur innerhalb der Frist.
export function darfBearbeiten(
  n: Pick<ChatNachricht, "autor" | "created_at" | "geloescht_am">,
  ichId: string | null,
  jetzt: Date = new Date()
): boolean {
  if (!ichId || n.autor !== ichId || n.geloescht_am) return false;
  return jetzt.getTime() - new Date(n.created_at).getTime() <= CHAT_BEARBEITEN_STUNDEN * 3_600_000;
}

export function darfLoeschen(n: Pick<ChatNachricht, "autor" | "geloescht_am">, ichId: string | null): boolean {
  return !!ichId && n.autor === ichId && !n.geloescht_am;
}

// Der Pfad im Bucket: erst der Schreiber (danach richten sich Speicher-Richtlinien und die
// Prüfregel `chat_foto_passt`), dann Zeitstempel und Zufall.
export function chatFotoPfad(autorId: string, zufall: string, zeit: Date, endung: "jpg" | "png" = "jpg"): string {
  const stempel = zeit.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  return `${autorId}/${stempel}-${zufall}.${endung}`;
}

// Das Ziel aus dem Link einer Push-Meldung (`?chat=…`): „1“ ist der Team-Chat, eine Kennung der
// Einzelchat mit dieser Person.
export function chatZielAus(wert: string | null | undefined): string | null {
  const w = (wert || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(w) ? w.toLowerCase() : null;
}

// Was in der Unterhaltungsliste unter dem Namen steht.
export function unterhaltungVorschau(u: ChatUnterhaltung, ichId: string | null, nameVon: (id: string) => string): string {
  if (!u.letzte_am) return u.partner ? "Noch nichts geschrieben" : "Noch keine Nachrichten";
  const wer = u.letzte_von === ichId ? "Du: " : !u.partner && u.letzte_von ? `${nameVon(u.letzte_von)}: ` : "";
  const text = u.letzte_text?.trim() ? u.letzte_text : u.letzte_foto ? "📷 Foto" : "Nachricht gelöscht";
  return kuerzen(wer + text, CHAT_ZITAT_MAX);
}

// Ein ausgewähltes, schon verkleinertes Foto vor dem Senden (lib/belegBild.ts).
export type ChatFotoAuswahl = { blob: Blob; breite: number; hoehe: number };

// Die Zeit rechts in der Unterhaltungsliste: heute die Uhrzeit, gestern „gestern“, sonst das Datum.
export function listenZeit(iso: string | null, jetzt: Date = new Date()): string {
  if (!iso) return "";
  const l = tagLabel(iso, jetzt);
  if (l === "HEUTE") return uhrzeit(iso);
  if (l === "GESTERN") return "gestern";
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

export type ChatListenEintrag = { partner: string | null; name: string; vorschau: string; am: string | null; ungelesen: number; neu: boolean };

// Die Liste: Team-Chat oben, dann die Einzelchats nach der letzten Nachricht, dann alle anderen
// Personen mit Zugang (für eine neue Unterhaltung), nach Namen. Ohne mich selbst.
export function chatListe(unterhaltungen: ChatUnterhaltung[], personen: ChatPerson[], ichId: string | null): ChatListenEintrag[] {
  const nameNach = new Map(personen.map((p) => [p.id, p.name]));
  const nameVon = (id: string) => nameNach.get(id) ?? "Ehemaliger Zugang";
  const team = unterhaltungen.find((u) => u.partner === null);
  const direkt = unterhaltungen
    .filter((u): u is ChatUnterhaltung & { partner: string } => !!u.partner && u.partner !== ichId)
    .sort((a, b) => (b.letzte_am || "").localeCompare(a.letzte_am || ""));
  const mit = new Set(direkt.map((u) => u.partner));
  return [
    {
      partner: null, name: "Team-Chat", am: team?.letzte_am ?? null, ungelesen: team?.ungelesen ?? 0, neu: false,
      vorschau: team ? unterhaltungVorschau(team, ichId, nameVon) : "Alle mit Zugang",
    },
    ...direkt.map((u) => ({ partner: u.partner, name: nameVon(u.partner), vorschau: unterhaltungVorschau(u, ichId, nameVon), am: u.letzte_am, ungelesen: u.ungelesen, neu: false })),
    ...personen
      .filter((p) => p.id !== ichId && !mit.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
      .map((p) => ({ partner: p.id, name: p.name, vorschau: "Neue Unterhaltung", am: null, ungelesen: 0, neu: true })),
  ];
}

// Ungelesen in den ANDEREN Unterhaltungen – die Zahl am Knopf „Chats“ im Kopf.
export function ungelesenAnderswo(unterhaltungen: ChatUnterhaltung[], partner: string | null): number {
  return unterhaltungen.filter((u) => u.partner !== partner).reduce((s, u) => s + (u.ungelesen || 0), 0);
}

// Die Trennlinie zwischen den Tagen: HEUTE, GESTERN, sonst „Mi 7.10.2026“.
export function tagLabel(iso: string, jetzt: Date = new Date()): string {
  const d = new Date(iso);
  if (tagSchluessel(d) === tagSchluessel(jetzt)) return "HEUTE";
  const gestern = new Date(jetzt);
  gestern.setDate(gestern.getDate() - 1);
  if (tagSchluessel(d) === tagSchluessel(gestern)) return "GESTERN";
  return `${WOCHENTAG_KURZ[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

export function uhrzeit(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Nachrichten in Tagesgruppen, älteste zuerst.
export function nachTagen<T extends { created_at: string }>(nachrichten: T[], jetzt: Date = new Date()): { tag: string; nachrichten: T[] }[] {
  const gruppen: { tag: string; schluessel: string; nachrichten: T[] }[] = [];
  for (const n of [...nachrichten].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const schluessel = tagSchluessel(new Date(n.created_at));
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.schluessel === schluessel) letzte.nachrichten.push(n);
    else gruppen.push({ tag: tagLabel(n.created_at, jetzt), schluessel, nachrichten: [n] });
  }
  return gruppen.map(({ tag, nachrichten: liste }) => ({ tag, nachrichten: liste }));
}

export function initialen(name: string): string {
  const teile = name.trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return "?";
  if (teile.length === 1) return teile[0].slice(0, 2).toUpperCase();
  return (teile[0][0] + teile[teile.length - 1][0]).toUpperCase();
}

const FARBEN = ["#1E9B6E", "#E24C3D", "#2F8FCB", "#8A5CC2", "#C77D12", "#092633"] as const;

// Eine feste Farbe je Person – dieselbe auf jedem Gerät, ohne sie irgendwo zu speichern.
export function personenFarbe(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FARBEN[h % FARBEN.length];
}

// Die Zahl an der Blase: „99+“ statt einer dreistelligen Zahl, die den Kreis sprengt.
export function zahlText(n: number): string {
  return n > 99 ? "99+" : String(n);
}

// ---------------------------------------------------------------------------------------------
// Push-Meldung (lib/chatVersand.ts)
// ---------------------------------------------------------------------------------------------

export function chatPushInhalt(a: {
  id: string; autorName: string; text: string; bezugTitel: string | null; erwaehnt: boolean; zahl: number;
  // Der Empfänger hat die Nachricht geschrieben, auf die hier geantwortet wird (Migration 81).
  geantwortet?: boolean;
  // Einzelchat (Migration 84): die Kennung des Schreibers – Antippen öffnet genau diese Unterhaltung.
  direktVon?: string | null;
  foto?: boolean;
}): PushInhalt {
  const inhalt = a.text.trim() ? a.text : a.foto ? "📷 Foto" : "";
  return {
    titel: a.direktVon
      ? (a.geantwortet ? `${a.autorName} hat dir geantwortet` : `${a.autorName} an dich`)
      : a.erwaehnt ? `${a.autorName} hat dich erwähnt` : a.geantwortet ? `${a.autorName} hat dir geantwortet` : `${a.autorName} im Team-Chat`,
    text: kuerzen(a.bezugTitel ? `${inhalt} · ${a.bezugTitel}` : inhalt, CHAT_PUSH_TEXT_MAX),
    // Antippen öffnet den Chat, nicht die Karte: Erst lesen, was dazu geschrieben wurde.
    url: `/?${CHAT_PARAMETER}=${a.direktVon ?? "1"}`,
    kennung: `chat-${a.id}`,
    zahl: a.zahl,
  };
}

// ---------------------------------------------------------------------------------------------
// „+“ im Chat: eine Karte anhängen, ohne erst in den Auftrag zu gehen
// ---------------------------------------------------------------------------------------------

// So viele Treffer je Art. Mehr liest am Handy niemand; wer nicht findet, tippt weiter.
export const CHAT_VORSCHLAEGE_MAX = 6;

// Aufträge (Nummer, Titel, Kunde) und Kunden (Name, Firma) passend zum Suchtext – aus dem, was
// auf dem Gerät ohnehin geladen ist. Aufträge die neuesten zuerst. Ohne Suchtext nur die
// Aufträge von heute an, denn um die geht es meistens.
export function bezugVorschlaege(
  suche: string,
  auftraege: Pick<Order, "id" | "order_number" | "title" | "order_date" | "time" | "customer_id" | "deleted_at">[],
  kunden: Pick<Customer, "id" | "name" | "company" | "address">[],
  heute: string
): ChatBezug[] {
  const s = suche.trim().toLocaleLowerCase("de").replace(/^#/, "");
  const kundeNach = new Map(kunden.map((k) => [k.id, k]));
  const name = (id: string) => { const k = kundeNach.get(id); return k ? anzeigeName(k) : null; };
  const passt = (...felder: (string | null | undefined)[]) => felder.some((f) => (f || "").toLocaleLowerCase("de").includes(s));
  const offeneAuftraege = auftraege.filter((o) => !o.deleted_at);
  const treffer = (s
    ? offeneAuftraege.filter((o) => String(o.order_number) === s || passt(o.title, name(o.customer_id)) || String(o.order_number).startsWith(s))
    : offeneAuftraege.filter((o) => o.order_date >= heute).sort((a, b) => a.order_date.localeCompare(b.order_date) || (a.time || "").localeCompare(b.time || ""))
  );
  const auftragsTreffer = (s ? [...treffer].sort((a, b) => b.order_date.localeCompare(a.order_date) || b.order_number - a.order_number) : treffer)
    .slice(0, CHAT_VORSCHLAEGE_MAX)
    .map((o) => bezugAuftrag(o, name(o.customer_id)));
  const kundenTreffer = s
    ? kunden.filter((k) => passt(k.name, k.company)).sort((a, b) => anzeigeName(a).localeCompare(anzeigeName(b), "de")).slice(0, CHAT_VORSCHLAEGE_MAX).map(bezugKunde)
    : [];
  return [...auftragsTreffer, ...kundenTreffer];
}

// Die Meldung zu einer Reaktion – nur an den Verfasser der Nachricht (Migration 81).
export function chatReaktionPushInhalt(a: {
  nachrichtId: string; vonId: string; vonName: string; emoji: string; text: string; zahl: number;
  // Reaktion im Einzelchat (Migration 84): Antippen öffnet die Unterhaltung mit dieser Person.
  direkt?: boolean;
}): PushInhalt {
  return {
    titel: `${a.vonName} hat reagiert`,
    text: kuerzen(`${a.emoji} zu „${a.text}“`, CHAT_PUSH_TEXT_MAX),
    url: `/?${CHAT_PARAMETER}=${a.direkt ? a.vonId : "1"}`,
    // Eine geänderte Reaktion ersetzt die offene Meldung, statt eine zweite daneben zu legen.
    kennung: `chat-reaktion-${a.nachrichtId}-${a.vonId}`,
    zahl: a.zahl,
  };
}
