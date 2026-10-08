import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RECHTE_VORGABE } from "./constants";
import { chatPushInhalt, chatReaktionPushInhalt, kuerzen } from "./chat";
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
    .select("id,autor,text,bezug_titel,erwaehnt,created_at");
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
  const frisch = (neu || []).filter(istFrisch);
  const frischeReaktionen = ((reaktionsFehler ? [] : neueReaktionen) || []).filter(istFrisch);
  if (frisch.length === 0 && frischeReaktionen.length === 0) return { ...leer, nachrichten: (neu || []).length };

  // Antworten (`antwort_auf`) und Reaktionen brauchen die Ursprungsnachricht: wer sie schrieb, was
  // darin stand. Vor Migration 81 fehlt die Spalte – dann gibt es keine Antworten.
  const { data: mitAntwort } = await supabase.from("chat_nachrichten").select("id,antwort_auf").in("id", frisch.map((n) => n.id as string));
  const antwortAuf = new Map((mitAntwort || []).filter((z) => z.antwort_auf).map((z) => [z.id as string, z.antwort_auf as string]));
  const ursprungIds = Array.from(new Set([...antwortAuf.values(), ...frischeReaktionen.map((r) => r.nachricht_id as string)]));
  const { data: urspruenge } = ursprungIds.length
    ? await supabase.from("chat_nachrichten").select("id,autor,text,bezug_titel").in("id", ursprungIds)
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

  // Ungelesene je Empfänger mit Gerät: nach dem eigenen „gelesen bis“, ohne eigene Nachrichten.
  const mitGeraet = empfaengerIds.filter((id) => geraeteNach.has(id));
  const { data: gelesen } = await supabase.from("chat_gelesen").select("profile_id,gelesen_bis").in("profile_id", mitGeraet);
  const gelesenNach = new Map((gelesen || []).map((g) => [g.profile_id as string, g.gelesen_bis as string]));
  const zahlNach = new Map<string, number>();
  await Promise.all(mitGeraet.map(async (id) => {
    let abfrage = supabase.from("chat_nachrichten").select("id", { count: "exact", head: true }).neq("autor", id);
    const bis = gelesenNach.get(id);
    if (bis) abfrage = abfrage.gt("created_at", bis);
    const { count } = await abfrage;
    zahlNach.set(id, count ?? 0);
  }));

  let gesendet = 0;
  const verwaist: string[] = [];
  async function zustellen(id: string, inhalt: string) {
    await Promise.all((geraeteNach.get(id) || []).map(async (g) => {
      try {
        await webpush.sendNotification({ endpoint: g.endpoint, keys: { p256dh: g.p256dh, auth: g.auth } }, inhalt);
        gesendet++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) verwaist.push(g.endpoint);
      }
    }));
  }
  await Promise.all(frisch.flatMap((n) => mitGeraet
    .filter((id) => id !== n.autor)
    .map((id) => {
      const ursprung = ursprungNach.get(antwortAuf.get(n.id as string) ?? "");
      return zustellen(id, pushNutzlast(chatPushInhalt({
        id: n.id as string,
        autorName: autorName(n.autor as string),
        text: n.text as string,
        bezugTitel: (n.bezug_titel as string | null) ?? null,
        erwaehnt: ((n.erwaehnt as string[] | null) || []).includes(id),
        geantwortet: !!ursprung && ursprung.autor === id,
        zahl: zahlNach.get(id) ?? 0,
      })));
    })));

  // Reaktionen: nur an den Verfasser – wenn er mitlesen darf, ein Gerät hat und nicht selbst reagiert.
  await Promise.all(frischeReaktionen.map((r) => {
    const ursprung = ursprungNach.get(r.nachricht_id as string);
    const an = ursprung?.autor as string | undefined;
    if (!ursprung || !an || an === r.profile_id || !geraeteNach.has(an)) return Promise.resolve();
    return zustellen(an, pushNutzlast(chatReaktionPushInhalt({
      nachrichtId: r.nachricht_id as string,
      vonId: r.profile_id as string,
      vonName: autorName(r.profile_id as string),
      emoji: r.emoji as string,
      text: kuerzen((ursprung.text as string) || (ursprung.bezug_titel as string) || "", 80),
      zahl: zahlNach.get(an) ?? 0,
    })));
  }));

  if (verwaist.length > 0) await supabase.from("push_geraete").delete().in("endpoint", verwaist);
  return { nachrichten: frisch.length, gesendet, reaktionen: frischeReaktionen.length };
}
