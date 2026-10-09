import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RECHTE_VORGABE } from "./constants";
import { CHAT_FOTO_BUCKET, chatPushInhalt, chatReaktionPushInhalt, kuerzen } from "./chat";
import { pushNutzlast } from "./pushInhalt";

// Push-Meldung bei jeder neuen Nachricht im Team-Chat (Migration 80, v129).
//
// Aufgerufen aus app/api/push/senden – sofort nach dem Schreiben (ein Trigger stößt die Route
// über pg_net an, `anlass: "chat"`) und zusätzlich in jedem Minutenlauf als Nachholer. Mit dem
// Dienstschlüssel, weil der Anstoß niemand ist und sich nicht auf die RLS stützen kann.
//
// EINMAL JE NACHRICHT: „erst eintragen, dann das Eingetragene senden“ wie bei der
// Terminerinnerung. Das Update setzt `push_gesendet_am` nur dort, wo es noch leer ist, und gibt
// genau diese Zeilen zurück – zwei gleichzeitige Läufe teilen sich die Nachrichten, keiner sendet
// doppelt. Was älter als eine Stunde ist, wird nur noch abgehakt: Eine Meldung zu einer Nachricht
// von gestern weckt niemanden mehr sinnvoll.
//
// EMPFÄNGER: Alle Zugänge, deren Rolle den Chat lesen darf (und der Superadmin), außer dem
// Schreiber selbst. Wer erwähnt ist, bekommt „… hat dich erwähnt“ als Titel. Jede Meldung trägt
// die Zahl der Ungelesenen dieses Empfängers – daraus setzt der Service Worker das rote Abzeichen
// am App-Symbol.
//
// SEIT MIGRATION 81 (v130): Antworten und Reaktionen. Eine Antwort ist eine normale Nachricht; wer
// die Ursprungsnachricht geschrieben hat, sieht „… hat dir geantwortet“ (eine Erwähnung geht vor).
// Eine Reaktion meldet sich NUR beim Verfasser der Nachricht – nach demselben „erst eintragen, dann
// senden“ über `chat_reaktionen.push_gesendet_am` – und nicht bei einer Reaktion auf die eigene.
//
// SEIT MIGRATION 84 (v137): Einzelchats – die Meldung geht NUR an den Empfänger (`an`), Titel
// „… an dich“, Antippen öffnet genau diese Unterhaltung. Eine gelöschte Nachricht meldet sich nicht
// (auch nicht, wenn sie in den Sekunden vor dem Versand gelöscht wurde); eine Bearbeitung löst keine
// zweite Meldung aus (`push_gesendet_am` bleibt gesetzt). Die Zahl der Ungelesenen zählt die
// Datenbank (`chat_ungelesen_von()`, Team und Einzelchats). Dazu räumt `chatFotosAufraeumen()` die
// Fotodateien gelöschter oder aufgeräumter Nachrichten weg.
//
// SEIT MIGRATION 85 (v138): Haken. Hat eine Meldung mindestens ein Gerät des Empfängers erreicht,
// gilt die Nachricht bei ihm als angekommen (`chat_zugestellt_setzen()`) – zwei graue Haken beim
// Schreiber, sobald das für alle Empfänger gilt.

const NACHHOLEN_MS = 60 * 60_000;

type Geraet = { endpoint: string; p256dh: string; auth: string };

export type ChatVersandErgebnis = { nachrichten: number; gesendet: number; reaktionen?: number };

type Zeile = Record<string, unknown>;

// Fehlt eine Tabelle (Migration 80 bzw. 81 noch nicht gelaufen), ist das kein Fehler des Laufs.
function tabelleFehlt(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205" || code === "42703";
}

export async function chatNachrichtenVersenden(supabase: SupabaseClient): Promise<ChatVersandErgebnis> {
  const leer: ChatVersandErgebnis = { nachrichten: 0, gesendet: 0 };
  const jetzt = Date.now();

  const { data: neu, error } = await supabase
    .from("chat_nachrichten")
    .update({ push_gesendet_am: new Date(jetzt).toISOString() })
    .is("push_gesendet_am", null)
    .select("id,autor,text,bezug_titel,erwaehnt,created_at,kanal,an,geloescht_am,foto_pfad");
  if (error) {
    // Vor Migration 80 gibt es die Tabelle nicht – das ist kein Fehler des Minutenlaufs.
    if (tabelleFehlt(error.code)) return leer;
    throw new Error(error.message);
  }
  const { data: neueReaktionen, error: reaktionsFehler } = await supabase
    .from("chat_reaktionen")
    .update({ push_gesendet_am: new Date(jetzt).toISOString() })
    .is("push_gesendet_am", null)
    .select("nachricht_id,profile_id,emoji,created_at");
  if (reaktionsFehler && !tabelleFehlt(reaktionsFehler.code)) throw new Error(reaktionsFehler.message);
  const istFrisch = (z: Zeile) => jetzt - new Date(z.created_at as string).getTime() <= NACHHOLEN_MS;
  const frisch = (neu || []).filter((n) => istFrisch(n) && !n.geloescht_am);
  const frischeReaktionen = ((reaktionsFehler ? [] : neueReaktionen) || []).filter(istFrisch);
  if (frisch.length === 0 && frischeReaktionen.length === 0) return { ...leer, nachrichten: (neu || []).length };

  // Antworten (`antwort_auf`) und Reaktionen brauchen die Ursprungsnachricht: wer sie schrieb, was
  // darin stand. Vor Migration 81 fehlt die Spalte – dann gibt es keine Antworten.
  const { data: mitAntwort } = await supabase.from("chat_nachrichten").select("id,antwort_auf").in("id", frisch.map((n) => n.id as string));
  const antwortAuf = new Map((mitAntwort || []).filter((z) => z.antwort_auf).map((z) => [z.id as string, z.antwort_auf as string]));
  const ursprungIds = Array.from(new Set([...antwortAuf.values(), ...frischeReaktionen.map((r) => r.nachricht_id as string)]));
  const { data: urspruenge } = ursprungIds.length
    ? await supabase.from("chat_nachrichten").select("id,autor,text,bezug_titel,kanal,foto_pfad,geloescht_am").in("id", ursprungIds)
    : { data: [] as Zeile[] };
  const ursprungNach = new Map((urspruenge || []).map((u) => [u.id as string, u]));

  // Wer darf mitlesen? Dieselbe Frage wie `public.darf('chat','lesen')`, nur für alle auf einmal.
  const { data: recht } = await supabase.from("module_permissions").select("read_roles").eq("module_key", "chat").maybeSingle();
  const rollen: string[] = (recht?.read_roles as string[] | undefined) ?? RECHTE_VORGABE.chat?.lesen ?? [];
  const { data: profile } = await supabase.from("profiles").select("id,email,role");
  const empfaenger = (profile || []).filter((p) => p.role === "superadmin" || rollen.includes(p.role as string));
  if (empfaenger.length === 0) return { nachrichten: frisch.length, gesendet: 0, reaktionen: frischeReaktionen.length };
  const empfaengerIds = empfaenger.map((p) => p.id as string);

  const { data: geraete } = await supabase.from("push_geraete").select("profile_id,endpoint,p256dh,auth").in("profile_id", empfaengerIds);
  const geraeteNach = new Map<string, Geraet[]>();
  (geraete || []).forEach((g) => {
    const liste = geraeteNach.get(g.profile_id as string) || [];
    liste.push({ endpoint: g.endpoint as string, p256dh: g.p256dh as string, auth: g.auth as string });
    geraeteNach.set(g.profile_id as string, liste);
  });
  if (geraeteNach.size === 0) return { nachrichten: frisch.length, gesendet: 0, reaktionen: frischeReaktionen.length };

  // Name des Schreibers: wie `chat_personen()` – Mitarbeitername, sonst der Teil der E-Mail vor dem @.
  const autoren = Array.from(new Set([...frisch.map((n) => n.autor as string), ...frischeReaktionen.map((r) => r.profile_id as string)]));
  const { data: mitarbeiter } = await supabase.from("employees").select("profile_id,name,created_at").in("profile_id", autoren).order("created_at");
  const nameNach = new Map<string, string>();
  (mitarbeiter || []).forEach((m) => { if (m.name?.trim() && !nameNach.has(m.profile_id as string)) nameNach.set(m.profile_id as string, m.name.trim()); });
  const emailNach = new Map((profile || []).map((p) => [p.id as string, (p.email as string | null) || ""]));
  const autorName = (id: string) => nameNach.get(id) || emailNach.get(id)?.split("@")[0] || "Jemand";

  // Ungelesene je Empfänger mit Gerät. Seit Migration 84 zählt die Datenbank (Team nach dem
  // eigenen „gelesen bis“, Einzelchats je Partner); fehlt die Funktion, wie bisher nur das Team.
  const mitGeraet = empfaengerIds.filter((id) => geraeteNach.has(id));
  const zahlNach = new Map<string, number>();
  const { data: gelesen } = await supabase.from("chat_gelesen").select("profile_id,gelesen_bis").in("profile_id", mitGeraet);
  const gelesenNach = new Map((gelesen || []).map((g) => [g.profile_id as string, g.gelesen_bis as string]));
  await Promise.all(mitGeraet.map(async (id) => {
    const { data: zahl, error: zahlFehler } = await supabase.rpc("chat_ungelesen_von", { p_profile: id });
    if (!zahlFehler && typeof zahl === "number") { zahlNach.set(id, zahl); return; }
    let abfrage = supabase.from("chat_nachrichten").select("id", { count: "exact", head: true }).neq("autor", id);
    const bis = gelesenNach.get(id);
    if (bis) abfrage = abfrage.gt("created_at", bis);
    const { count } = await abfrage;
    zahlNach.set(id, count ?? 0);
  }));

  let gesendet = 0;
  const verwaist: string[] = [];
  // Gibt zurück, ob die Meldung mindestens ein Gerät der Person erreicht hat.
  async function zustellen(id: string, inhalt: string): Promise<boolean> {
    let angekommen = false;
    await Promise.all((geraeteNach.get(id) || []).map(async (g) => {
      try {
        await webpush.sendNotification({ endpoint: g.endpoint, keys: { p256dh: g.p256dh, auth: g.auth } }, inhalt);
        gesendet++;
        angekommen = true;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) verwaist.push(g.endpoint);
      }
    }));
    return angekommen;
  }
  // Haken (Migration 85): Wem eine Nachricht zugestellt wurde, bei dem ist sie „angekommen“ –
  // je Person und Unterhaltung der späteste Zeitpunkt.
  const angekommenBis = new Map<string, { profil: string; partner: string | null; bis: string }>();
  await Promise.all(frisch.flatMap((n) => mitGeraet
    // Einzelchat: nur der Empfänger. Team: alle außer dem Schreiber.
    .filter((id) => id !== n.autor && (n.kanal !== "direkt" || id === n.an))
    .map((id) => {
      const ursprung = ursprungNach.get(antwortAuf.get(n.id as string) ?? "");
      const partner = n.kanal === "direkt" ? (n.autor as string) : null;
      const merken = (ok: boolean) => {
        if (!ok) return;
        const schluessel = `${id}|${partner ?? ""}`;
        const alt = angekommenBis.get(schluessel);
        if (!alt || alt.bis < (n.created_at as string)) angekommenBis.set(schluessel, { profil: id, partner, bis: n.created_at as string });
      };
      return zustellen(id, pushNutzlast(chatPushInhalt({
        id: n.id as string,
        autorName: autorName(n.autor as string),
        text: (n.text as string | null) || "",
        bezugTitel: (n.bezug_titel as string | null) ?? null,
        erwaehnt: ((n.erwaehnt as string[] | null) || []).includes(id),
        geantwortet: !!ursprung && ursprung.autor === id,
        zahl: zahlNach.get(id) ?? 0,
        direktVon: partner,
        foto: !!n.foto_pfad,
      }))).then(merken);
    })));
  // Vor Migration 85 fehlt die Funktion – dann eben ohne Haken.
  await Promise.all(Array.from(angekommenBis.values()).map((a) =>
    Promise.resolve(supabase.rpc("chat_zugestellt_setzen", { p_profile: a.profil, p_partner: a.partner, p_bis: a.bis })).catch(() => null)));

  // Reaktionen: nur an den Verfasser – wenn er mitlesen darf, ein Gerät hat und nicht selbst reagiert.
  await Promise.all(frischeReaktionen.map((r) => {
    const ursprung = ursprungNach.get(r.nachricht_id as string);
    const an = ursprung?.autor as string | undefined;
    if (!ursprung || !an || an === r.profile_id || ursprung.geloescht_am || !geraeteNach.has(an)) return Promise.resolve(false);
    return zustellen(an, pushNutzlast(chatReaktionPushInhalt({
      nachrichtId: r.nachricht_id as string,
      vonId: r.profile_id as string,
      vonName: autorName(r.profile_id as string),
      emoji: r.emoji as string,
      text: kuerzen((ursprung.text as string) || (ursprung.bezug_titel as string) || (ursprung.foto_pfad ? "📷 Foto" : ""), 80),
      zahl: zahlNach.get(an) ?? 0,
      direkt: ursprung.kanal === "direkt",
    })));
  }));

  if (verwaist.length > 0) await supabase.from("push_geraete").delete().in("endpoint", verwaist);
  return { nachrichten: frisch.length, gesendet, reaktionen: frischeReaktionen.length };
}

// Fotodateien gelöschter oder aufgeräumter Nachrichten entfernen (Migration 84). Die Datenbank merkt
// die Pfade vor (`private.chat_fotos_weg`); SQL darf in Supabase keine Dateien löschen, die
// Storage-Schnittstelle mit dem Dienstschlüssel schon. Je Lauf höchstens 200 – was übrig bleibt,
// nimmt der nächste Minutenlauf. Abgehakt wird nur, was wirklich weg ist (oder schon fehlte).
export async function chatFotosAufraeumen(supabase: SupabaseClient): Promise<{ entfernt: number }> {
  const { data, error } = await supabase.rpc("chat_fotos_weg_liste", { p_anzahl: 200 });
  if (error) {
    // Vor Migration 84 gibt es die Funktion nicht.
    if (error.code === "PGRST202" || error.code === "42883") return { entfernt: 0 };
    throw new Error(error.message);
  }
  const pfade = ((data as string[] | null) || []).filter(Boolean);
  if (pfade.length === 0) return { entfernt: 0 };
  const { error: speicherFehler } = await supabase.storage.from(CHAT_FOTO_BUCKET).remove(pfade);
  if (speicherFehler) throw new Error(speicherFehler.message);
  const { error: hakenFehler } = await supabase.rpc("chat_fotos_weg_erledigt", { p_pfade: pfade });
  if (hakenFehler) throw new Error(hakenFehler.message);
  return { entfernt: pfade.length };
}
