import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "./types";
import { RECHTE_VORGABE } from "./constants";
import { stempelErinnerungenFaellig, stempelPushInhalt, type StempelTermin } from "./stempelErinnerung";
import { pushNutzlast } from "./pushInhalt";

// Der Versand der Stempel-Erinnerung (Migration 85, v138) – im Minutentakt aus app/api/push/senden,
// mit dem Dienstschlüssel. Die Regeln (wann, an wen, welcher Text) stehen in lib/stempelErinnerung.ts.
//
// Billig, solange nichts zu tun ist: erst die Termine von heute mit Uhrzeit; liegt für niemanden
// jetzt etwas im Fenster, endet der Lauf, bevor Schichten, Rechte oder Geräte gelesen werden.
//
// EMPFÄNGER: die dem Termin zugeteilten Mitarbeiter mit verknüpftem Konto, deren Rolle stempeln
// darf (Recht „Zeiterfassung · schreiben“, der Superadmin immer), die ein Gerät angemeldet und die
// Erinnerung nicht abgeschaltet haben (`user_settings.stempel_erinnerung_aktiv`).
//
// EINMAL JE TAG UND ART: „erst eintragen, dann senden“ gegen den Primärschlüssel von
// `push_stempel_erinnerung` – wie bei Terminerinnerung und Abendhinweis.

type Geraet = { endpoint: string; p256dh: string; auth: string };

export type StempelErinnerungErgebnis = { faellig: number; gesendet: number };

// Vor Migration 85 fehlen Tabelle bzw. Spalte – kein Fehler des Minutenlaufs.
function fehlt(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204";
}

function tagMinus(datum: string, tage: number): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - tage);
  return d.toISOString().slice(0, 10);
}

export async function stempelErinnerungenVersenden(
  supabase: SupabaseClient,
  jetzt: { datum: string; minuten: number }
): Promise<StempelErinnerungErgebnis> {
  const leer: StempelErinnerungErgebnis = { faellig: 0, gesendet: 0 };

  // 1. Termine von heute mit Uhrzeit und wer ihnen zugeteilt ist
  const { data: auftraege, error } = await supabase
    .from("orders").select("id,time,end_time,status")
    .eq("order_date", jetzt.datum).in("status", ["offen", "in_arbeit", "erledigt"])
    .is("deleted_at", null).not("time", "is", null);
  if (error) throw new Error(error.message);
  if (!auftraege || auftraege.length === 0) return leer;
  const { data: zuordnungen } = await supabase
    .from("order_employees").select("order_id,employee_id").in("order_id", auftraege.map((a) => a.id as string));
  const mitarbeiterIds = Array.from(new Set((zuordnungen || []).map((z) => z.employee_id as string)));
  if (mitarbeiterIds.length === 0) return leer;
  const { data: mitarbeiter } = await supabase
    .from("employees").select("id,profile_id").in("id", mitarbeiterIds).not("profile_id", "is", null);
  const kontoVon = new Map((mitarbeiter || []).map((m) => [m.id as string, m.profile_id as string]));
  const auftragVon = new Map(auftraege.map((a) => [a.id as string, a]));
  const termine: StempelTermin[] = [];
  for (const z of zuordnungen || []) {
    const konto = kontoVon.get(z.employee_id as string);
    const a = auftragVon.get(z.order_id as string);
    if (konto && a) termine.push({ profileId: konto, time: a.time as string | null, end_time: a.end_time as string | null, status: a.status as OrderStatus });
  }

  // 2. Liegt überhaupt etwas im Fenster? (ohne Rücksicht auf den Stempelstand)
  const kandidaten = Array.from(new Set(stempelErinnerungenFaellig(termine, jetzt.minuten, null).map((e) => e.profileId)));
  if (kandidaten.length === 0) return leer;

  // 3. Wer darf stempeln, hat es nicht abgeschaltet, hat ein Gerät?
  const { data: recht } = await supabase.from("module_permissions").select("edit_roles").eq("module_key", "zeiterfassung").maybeSingle();
  const rollen: string[] = (recht?.edit_roles as string[] | undefined) ?? RECHTE_VORGABE.zeiterfassung?.schreiben ?? [];
  const { data: profile } = await supabase.from("profiles").select("id,role").in("id", kandidaten);
  const mitRecht = (profile || []).filter((p) => p.role === "superadmin" || rollen.includes(p.role as string)).map((p) => p.id as string);
  if (mitRecht.length === 0) return leer;
  const { data: einstellungen, error: einstellungsFehler } = await supabase
    .from("user_settings").select("user_id,stempel_erinnerung_aktiv").in("user_id", mitRecht);
  if (einstellungsFehler) {
    if (fehlt(einstellungsFehler.code)) return leer;
    throw new Error(einstellungsFehler.message);
  }
  const aus = new Set((einstellungen || []).filter((e) => e.stempel_erinnerung_aktiv === false).map((e) => e.user_id as string));
  const { data: geraete } = await supabase.from("push_geraete").select("profile_id,endpoint,p256dh,auth").in("profile_id", mitRecht);
  const geraeteVon = new Map<string, Geraet[]>();
  (geraete || []).forEach((g) => {
    const liste = geraeteVon.get(g.profile_id as string) || [];
    liste.push({ endpoint: g.endpoint as string, p256dh: g.p256dh as string, auth: g.auth as string });
    geraeteVon.set(g.profile_id as string, liste);
  });
  const erreichbar = mitRecht.filter((id) => !aus.has(id) && geraeteVon.has(id));
  if (erreichbar.length === 0) return leer;

  // 4. Stempelstand – erst jetzt
  const { data: offen } = await supabase.from("zeit_schichten").select("profile_id").is("ende", null).in("profile_id", erreichbar);
  const eingestempelt = new Set((offen || []).map((s) => s.profile_id as string));
  const erreichbarSet = new Set(erreichbar);
  const faellig = stempelErinnerungenFaellig(termine, jetzt.minuten, eingestempelt).filter((e) => erreichbarSet.has(e.profileId));
  if (faellig.length === 0) return leer;

  // 5. Erst eintragen, dann nur das Neue senden
  const { data: neu, error: eintragFehler } = await supabase
    .from("push_stempel_erinnerung")
    .upsert(faellig.map((e) => ({ profile_id: e.profileId, tag: jetzt.datum, art: e.art })), { onConflict: "profile_id,tag,art", ignoreDuplicates: true })
    .select("profile_id,art");
  if (eintragFehler) {
    if (fehlt(eintragFehler.code)) return leer;
    throw new Error(eintragFehler.message);
  }
  const neuSet = new Set((neu || []).map((z) => `${z.profile_id}|${z.art}`));

  let gesendet = 0;
  const verwaist: string[] = [];
  await Promise.all(faellig.filter((e) => neuSet.has(`${e.profileId}|${e.art}`)).flatMap((e) => {
    const inhalt = pushNutzlast(stempelPushInhalt(e, jetzt.datum));
    return (geraeteVon.get(e.profileId) || []).map(async (g) => {
      try {
        await webpush.sendNotification({ endpoint: g.endpoint, keys: { p256dh: g.p256dh, auth: g.auth } }, inhalt);
        gesendet++;
      } catch (fehler) {
        const status = (fehler as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) verwaist.push(g.endpoint);
      }
    });
  }));
  if (verwaist.length > 0) await supabase.from("push_geraete").delete().in("endpoint", verwaist);
  // Alte Einträge brauchen wir nicht mehr – sie verhindern nur Doppelmeldungen am selben Tag.
  await supabase.from("push_stempel_erinnerung").delete().lt("tag", tagMinus(jetzt.datum, 30));
  return { faellig: faellig.length, gesendet };
}
