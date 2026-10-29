import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RECHTE_VORGABE } from "./constants";
import { BESTELL_FOTO_BUCKET, bestellPushDringend, bestellPushStand } from "./bestellung";
import { pushNutzlast } from "./pushInhalt";
import type { BestellStatus } from "./types";

// Push zur Bestellliste (Migration 104, v173). Aufgerufen aus app/api/push/senden – sofort (ein Trigger stößt
// die Route mit `{"anlass":"bestellung"}` an) und in jedem Minutenlauf als Nachholer. Mit dem Dienstschlüssel.
//
//   dringend eingetragen → an alle, die „Bestellliste verwalten“ dürfen (und den Superadmin), nicht an den
//                          Eintragenden selbst. Einmal je Wunsch (`push_buero_am`).
//   da / nicht nötig      → an den, der eingetragen hat, und alle mit „+1“, nicht an den, der den Stand
//                          gesetzt hat. Einmal je Stand (`push_ersteller_am`, die Datenbank leert ihn beim Wechsel).
//
// „Erst eintragen, dann senden“ wie beim Chat: Das Update setzt den Stempel nur, wo er leer ist, und gibt genau
// diese Zeilen zurück – zwei Läufe senden nie doppelt. Was älter als eine Stunde ist, wird nur noch abgehakt.

const NACHHOLEN_MS = 60 * 60_000;
type Geraet = { endpoint: string; p256dh: string; auth: string };
export type BestellVersandErgebnis = { dringend: number; stand: number; gesendet: number };

function tabelleFehlt(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205" || code === "42703";
}

export async function bestellungenVersenden(supabase: SupabaseClient): Promise<BestellVersandErgebnis> {
  const leer: BestellVersandErgebnis = { dringend: 0, stand: 0, gesendet: 0 };
  const jetzt = Date.now();
  const stempel = new Date(jetzt).toISOString();

  const { data: dringend, error } = await supabase.from("bestellwuensche")
    .update({ push_buero_am: stempel })
    .is("push_buero_am", null).eq("dringend", true).eq("status", "offen")
    .select("id,text,menge,erstellt_von,created_at");
  if (error) {
    if (tabelleFehlt(error.code)) return leer;
    throw new Error(error.message);
  }
  const { data: stand, error: standFehler } = await supabase.from("bestellwuensche")
    .update({ push_ersteller_am: stempel })
    .is("push_ersteller_am", null).in("status", ["da", "nicht_noetig"])
    .select("id,text,status,grund,notiz,erstellt_von,status_von,status_am,bestellwunsch_plus(profile_id)");
  if (standFehler) throw new Error(standFehler.message);

  const frischD = (dringend || []).filter((d) => jetzt - new Date(d.created_at as string).getTime() <= NACHHOLEN_MS);
  const frischS = (stand || []).filter((s) => s.status_am && jetzt - new Date(s.status_am as string).getTime() <= NACHHOLEN_MS);
  if (frischD.length === 0 && frischS.length === 0) return { ...leer, dringend: (dringend || []).length, stand: (stand || []).length };

  // Wer verwalten darf – dieselbe Frage wie `public.darf('bestellungen.verwalten','schreiben')`, für alle auf einmal.
  const { data: recht } = await supabase.from("module_permissions").select("edit_roles").eq("module_key", "bestellungen.verwalten").maybeSingle();
  const rollen: string[] = (recht?.edit_roles as string[] | undefined) ?? RECHTE_VORGABE["bestellungen.verwalten"]?.schreiben ?? [];
  const { data: profile } = await supabase.from("profiles").select("id,email,role");
  const verwalter = (profile || []).filter((p) => p.role === "superadmin" || rollen.includes(p.role as string)).map((p) => p.id as string);

  const empfaengerAlle = new Set<string>(verwalter);
  for (const s of frischS) {
    if (s.erstellt_von) empfaengerAlle.add(s.erstellt_von as string);
    for (const p of (s.bestellwunsch_plus as { profile_id: string }[] | null) || []) empfaengerAlle.add(p.profile_id);
  }
  const { data: geraete } = await supabase.from("push_geraete").select("profile_id,endpoint,p256dh,auth").in("profile_id", [...empfaengerAlle]);
  const geraeteNach = new Map<string, Geraet[]>();
  (geraete || []).forEach((g) => {
    const liste = geraeteNach.get(g.profile_id as string) || [];
    liste.push({ endpoint: g.endpoint as string, p256dh: g.p256dh as string, auth: g.auth as string });
    geraeteNach.set(g.profile_id as string, liste);
  });

  // Name des Eintragenden: Mitarbeitername, sonst der Teil der E-Mail vor dem @ (wie im Chat).
  const autoren = [...new Set(frischD.map((d) => d.erstellt_von as string).filter(Boolean))];
  const { data: mitarbeiter } = autoren.length
    ? await supabase.from("employees").select("profile_id,name").in("profile_id", autoren)
    : { data: [] as { profile_id: string; name: string }[] };
  const nameVon = (id: string | null) =>
    (mitarbeiter || []).find((m) => m.profile_id === id)?.name?.trim()
    || (profile || []).find((p) => p.id === id)?.email?.split("@")[0] || "Jemand";

  let gesendet = 0;
  const verwaist: string[] = [];
  async function zustellen(an: string, inhalt: string) {
    await Promise.all((geraeteNach.get(an) || []).map(async (g) => {
      try {
        await webpush.sendNotification({ endpoint: g.endpoint, keys: { p256dh: g.p256dh, auth: g.auth } }, inhalt);
        gesendet++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) verwaist.push(g.endpoint);
      }
    }));
  }

  await Promise.all(frischD.flatMap((d) => verwalter
    .filter((id) => id !== d.erstellt_von)
    .map((id) => zustellen(id, pushNutzlast(bestellPushDringend(
      { id: d.id as string, text: d.text as string, menge: (d.menge as string | null) ?? null }, nameVon(d.erstellt_von as string | null)))))));
  await Promise.all(frischS.flatMap((s) => {
    const an = new Set<string>([s.erstellt_von as string, ...((s.bestellwunsch_plus as { profile_id: string }[] | null) || []).map((p) => p.profile_id)]);
    an.delete(s.status_von as string);
    return [...an].filter(Boolean).map((id) => zustellen(id, pushNutzlast(bestellPushStand({
      id: s.id as string, text: s.text as string, status: s.status as BestellStatus,
      grund: (s.grund as string | null) ?? null, notiz: (s.notiz as string | null) ?? null,
    }))));
  }));

  if (verwaist.length > 0) await supabase.from("push_geraete").delete().in("endpoint", verwaist);
  return { dringend: frischD.length, stand: frischS.length, gesendet };
}

// Fotodateien gelöschter Bestellwünsche (Migration 105, v174) – wie beim Chat (`chatFotosAufraeumen`): Die
// Datenbank merkt den Pfad vor, wenn ein Wunsch gelöscht oder sein Foto ersetzt wird – auch beim endgültigen
// Löschen eines Kunden und beim nächtlichen Aufräumen. Der Minutentakt löscht die Datei mit dem
// Dienstschlüssel (SQL darf Storage nicht löschen, Migration 65) und hakt sie ab.
export async function bestellFotosAufraeumen(supabase: SupabaseClient): Promise<{ entfernt: number }> {
  const { data, error } = await supabase.rpc("bestell_fotos_weg_liste", { p_anzahl: 200 });
  if (error) {
    // Vor Migration 105 gibt es die Funktion nicht.
    if (error.code === "PGRST202" || error.code === "42883") return { entfernt: 0 };
    throw new Error(error.message);
  }
  const pfade = ((data as string[] | null) || []).filter(Boolean);
  if (pfade.length === 0) return { entfernt: 0 };
  const { error: speicherFehler } = await supabase.storage.from(BESTELL_FOTO_BUCKET).remove(pfade);
  if (speicherFehler) throw new Error(speicherFehler.message);
  const { error: hakenFehler } = await supabase.rpc("bestell_fotos_weg_erledigt", { p_pfade: pfade });
  if (hakenFehler) throw new Error(hakenFehler.message);
  return { entfernt: pfade.length };
}
