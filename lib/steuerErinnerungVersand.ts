import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RECHTE_VORGABE } from "./constants";
import { SYSTEM_PARAMETER } from "./systeme";
import { pushNutzlast } from "./pushInhalt";
import { ustErinnerungen, ustErinnerungText, type UstErinnerung } from "./finance/steuern";
import type { FinEinstellungen } from "./finance/einstellungen";

// Erinnerung an die Frist der Umsatzsteuer-Voranmeldung (Migration 93, v151) – im Minutentakt aus
// app/api/push/senden, mit dem Dienstschlüssel. Wann und welcher Text: lib/finance/steuern.ts
// (`ustErinnerungen`, drei Tage vorher und am Tag selbst, ab 8 Uhr).
//
// EMPFÄNGER: wer Voranmeldungen festhalten darf (Recht „Finance › Steuern · schreiben“, der Superadmin
// immer) und ein Gerät angemeldet hat. EINMAL JE ZEITRAUM UND STUFE: „erst eintragen, dann senden“ gegen den
// Primärschlüssel von `fin_steuer_erinnerungen`. Der Text nennt nur Zeitraum und Frist, keine Beträge.

type Geraet = { endpoint: string; p256dh: string; auth: string };
export type SteuerErinnerungErgebnis = { faellig: number; gesendet: number };

export const FIN_UST_ERINNERUNG_AB_MINUTEN = 8 * 60;

function fehlt(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204";
}

export async function steuerErinnerungenVersenden(supabase: SupabaseClient, jetzt: { datum: string; minuten: number }): Promise<SteuerErinnerungErgebnis> {
  const leer: SteuerErinnerungErgebnis = { faellig: 0, gesendet: 0 };
  if (jetzt.minuten < FIN_UST_ERINNERUNG_AB_MINUTEN) return leer;
  const jahr = Number(jetzt.datum.slice(0, 4));

  // 1. Einstellungen dieses und des Vorjahres (die Dezember-Frist liegt im neuen Jahr), Abgaben
  const { data: einstellungen, error } = await supabase.from("fin_einstellungen")
    .select("wirtschaftsjahr, voranmeldung, dauerfrist, besteuerung, start_datum").in("wirtschaftsjahr", [jahr - 1, jahr]);
  if (error) {
    if (fehlt(error.code)) return leer;
    throw new Error(error.message);
  }
  if (!einstellungen?.length) return leer;
  const { data: abgaben, error: abgabeFehler } = await supabase.from("fin_voranmeldungen").select("jahr, zeitraum").in("jahr", [jahr - 1, jahr]);
  if (abgabeFehler) {
    if (fehlt(abgabeFehler.code)) return leer;
    throw new Error(abgabeFehler.message);
  }
  const faellig: UstErinnerung[] = ustErinnerungen(einstellungen as Pick<FinEinstellungen, "wirtschaftsjahr" | "voranmeldung" | "dauerfrist" | "besteuerung" | "start_datum">[],
    (abgaben ?? []) as { jahr: number; zeitraum: string }[], jetzt.datum);
  if (faellig.length === 0) return leer;

  // 2. Wer darf festhalten und hat ein Gerät?
  const { data: recht } = await supabase.from("module_permissions").select("edit_roles").eq("module_key", "finance.steuer").maybeSingle();
  const rollen: string[] = (recht?.edit_roles as string[] | undefined) ?? RECHTE_VORGABE["finance.steuer"]?.schreiben ?? [];
  const { data: profile } = await supabase.from("profiles").select("id, role");
  const mitRecht = (profile || []).filter((p) => p.role === "superadmin" || rollen.includes(p.role as string)).map((p) => p.id as string);
  if (mitRecht.length === 0) return leer;
  const { data: geraete } = await supabase.from("push_geraete").select("profile_id, endpoint, p256dh, auth").in("profile_id", mitRecht);
  const geraeteVon = new Map<string, Geraet[]>();
  (geraete || []).forEach((g) => {
    const l = geraeteVon.get(g.profile_id as string) || [];
    l.push({ endpoint: g.endpoint as string, p256dh: g.p256dh as string, auth: g.auth as string });
    geraeteVon.set(g.profile_id as string, l);
  });
  const erreichbar = mitRecht.filter((id) => geraeteVon.has(id));
  if (erreichbar.length === 0) return leer;

  // 3. Erst eintragen, dann nur das Neue senden
  const zeilen = erreichbar.flatMap((p) => faellig.map((f) => ({ profile_id: p, jahr: f.jahr, zeitraum: f.zeitraum, stufe: f.stufe })));
  const { data: neu, error: eintragFehler } = await supabase.from("fin_steuer_erinnerungen")
    .upsert(zeilen, { onConflict: "profile_id,jahr,zeitraum,stufe", ignoreDuplicates: true }).select("profile_id, jahr, zeitraum, stufe");
  if (eintragFehler) {
    if (fehlt(eintragFehler.code)) return leer;
    throw new Error(eintragFehler.message);
  }
  const neuSet = new Set((neu || []).map((z) => `${z.profile_id}|${z.jahr}|${z.zeitraum}|${z.stufe}`));

  let gesendet = 0;
  const verwaist: string[] = [];
  await Promise.all(erreichbar.flatMap((p) => faellig.filter((f) => neuSet.has(`${p}|${f.jahr}|${f.zeitraum}|${f.stufe}`)).flatMap((f) => {
    const t = ustErinnerungText(f);
    const inhalt = pushNutzlast({ titel: t.titel, text: t.text, url: `/?${SYSTEM_PARAMETER}=finance`, kennung: `ust-${f.jahr}-${f.zeitraum}` });
    return (geraeteVon.get(p) || []).map(async (g) => {
      try {
        await webpush.sendNotification({ endpoint: g.endpoint, keys: { p256dh: g.p256dh, auth: g.auth } }, inhalt);
        gesendet++;
      } catch (fehler) {
        const status = (fehler as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) verwaist.push(g.endpoint);
      }
    });
  })));
  if (verwaist.length > 0) await supabase.from("push_geraete").delete().in("endpoint", verwaist);
  return { faellig: faellig.length, gesendet };
}
