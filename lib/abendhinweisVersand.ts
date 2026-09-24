import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuftragFahrzeug, Order, TireStorage } from "./types";
import { MITNEHMEN_PARAMETER } from "./constants";
import { abendhinweisFaellig, folgetag, mitnehmenListe, mitnehmenText, type MitnehmenEintrag } from "./mitnehmen";
import { pushNutzlast } from "./pushInhalt";

// Der Versand des Abendhinweises „Reifen mitnehmen" (Migration 55, 23.09.2026).
//
// Aufgerufen aus app/api/push/senden, also jede Minute vom Zeitgeber aus Migration 28 – mit dem
// Dienstschlüssel, weil der Zeitgeber niemand ist und sich nicht auf die RLS stützen kann. Die
// fachliche Regel (welcher Auftrag, welche Sätze) steht NICHT hier, sondern in lib/mitnehmen.ts;
// dort liest sie auch das Fenster, das beim Antippen aufgeht.
//
// Der Ablauf je Minute, bewusst billig, solange nichts zu tun ist:
//   1. Wer hat überhaupt ein Gerät angemeldet? Niemand → fertig.
//   2. Für wen ist jetzt die eingestellte Uhrzeit erreicht, und wer hat für morgen noch nichts
//      bekommen? Niemand → fertig. Tagsüber endet jeder Lauf hier.
//   3. Erst dann: die Aufträge von morgen, die Sätze im Regal, die Empfänger.
//
// EMPFÄNGER (entschieden am 23.09.2026): die zugeteilten Mitarbeiter mit verknüpftem Konto.
// Ist an einem Auftrag niemand ERREICHBAR – niemand zugeteilt, oder keiner der Zugeteilten hat
// ein Konto –, geht er an die Admins. Sonst bliebe genau der Satz liegen, um den sich niemand
// kümmert.
//
// EINMAL JE ABEND: „erst eintragen, dann das Eingetragene senden" gegen den Primärschlüssel von
// `push_abendhinweis` – dasselbe Muster wie `push_versand` bei der Terminerinnerung. Wer für
// morgen nichts mitnehmen muss, bekommt nichts und wird auch nicht eingetragen: Kommt um 21 Uhr
// noch ein Auftrag für morgen dazu, geht der Hinweis dann eben um 21:01.

type Geraet = { endpoint: string; p256dh: string; auth: string };

export type AbendhinweisErgebnis = { faellig: number; hinweise: number; gesendet: number };

export async function abendhinweiseVersenden(
  supabase: SupabaseClient,
  jetzt: { datum: string; minuten: number }
): Promise<AbendhinweisErgebnis> {
  const leer: AbendhinweisErgebnis = { faellig: 0, hinweise: 0, gesendet: 0 };

  // 1. Konten mit Gerät
  const { data: geraete, error: geraeteFehler } = await supabase
    .from("push_geraete").select("profile_id,endpoint,p256dh,auth");
  if (geraeteFehler) throw new Error(geraeteFehler.message);
  const konten = Array.from(new Set((geraete || []).map((g) => g.profile_id as string)));
  if (konten.length === 0) return leer;

  // 2. Wem ist die Uhrzeit erreicht, und wer hat für morgen noch nichts?
  const { data: einstellungen } = await supabase
    .from("user_settings").select("user_id,abendhinweis_aktiv,abendhinweis_uhrzeit").in("user_id", konten);
  const einstellungNach = new Map((einstellungen || []).map((e) => [e.user_id as string, e]));
  const morgen = folgetag(jetzt.datum);
  const { data: schonGesendet } = await supabase
    .from("push_abendhinweis").select("profile_id").eq("fuer_datum", morgen).in("profile_id", konten);
  const erledigt = new Set((schonGesendet || []).map((z) => z.profile_id as string));
  const faellig = konten.filter((k) => !erledigt.has(k) && abendhinweisFaellig(einstellungNach.get(k), jetzt.minuten));
  if (faellig.length === 0) return leer;

  // 3. Die Aufträge von morgen und was für sie im Regal liegt
  const { data: auftraege, error: auftragsFehler } = await supabase
    .from("orders").select("*")
    .eq("order_date", morgen).in("status", ["offen", "in_arbeit"]).is("deleted_at", null);
  if (auftragsFehler) throw new Error(auftragsFehler.message);
  if (!auftraege || auftraege.length === 0) return { ...leer, faellig: faellig.length };

  const kundenIds = Array.from(new Set((auftraege as Order[]).map((a) => a.customer_id)));
  const auftragsIds = (auftraege as Order[]).map((a) => a.id);
  const [{ data: saetze }, { data: fahrzeuge }] = await Promise.all([
    supabase.from("tire_storage").select("*").in("customer_id", kundenIds).is("removed_at", null),
    supabase.from("auftrag_fahrzeuge").select("*").in("order_id", auftragsIds),
  ]);
  const eintraege = mitnehmenListe(
    morgen, auftraege as Order[], (saetze || []) as TireStorage[], (fahrzeuge || []) as AuftragFahrzeug[]
  );
  if (eintraege.length === 0) return { ...leer, faellig: faellig.length };

  // Empfänger je Eintrag
  const mitSaetzen = eintraege.map((e) => e.auftrag.id);
  const { data: zuordnungen } = await supabase
    .from("order_employees").select("order_id,employee_id").in("order_id", mitSaetzen);
  const mitarbeiterIds = Array.from(new Set((zuordnungen || []).map((z) => z.employee_id as string)));
  const { data: mitarbeiter } = mitarbeiterIds.length > 0
    ? await supabase.from("employees").select("id,profile_id").in("id", mitarbeiterIds).not("profile_id", "is", null)
    : { data: [] as { id: string; profile_id: string }[] };
  const kontoVon = new Map((mitarbeiter || []).map((m) => [m.id as string, m.profile_id as string]));
  const { data: admins } = await supabase
    .from("profiles").select("id").in("role", ["admin", "superadmin"]);
  const adminKonten = (admins || []).map((a) => a.id as string);

  const jeKonto = new Map<string, MitnehmenEintrag[]>();
  for (const eintrag of eintraege) {
    const erreichbar = (zuordnungen || [])
      .filter((z) => z.order_id === eintrag.auftrag.id)
      .map((z) => kontoVon.get(z.employee_id as string))
      .filter((k): k is string => Boolean(k));
    const an = erreichbar.length > 0 ? erreichbar : adminKonten;
    for (const konto of new Set(an)) {
      const liste = jeKonto.get(konto) ?? [];
      liste.push(eintrag);
      jeKonto.set(konto, liste);
    }
  }

  const empfaenger = faellig.filter((k) => jeKonto.has(k));
  if (empfaenger.length === 0) return { ...leer, faellig: faellig.length };

  // Erst eintragen, dann nur das Neue senden.
  const zeilen = empfaenger.map((k) => ({
    profile_id: k, fuer_datum: morgen,
    anzahl: (jeKonto.get(k) || []).reduce((n, e) => n + e.saetze.length, 0),
  }));
  const { data: neu, error: eintragFehler } = await supabase
    .from("push_abendhinweis")
    .upsert(zeilen, { onConflict: "profile_id,fuer_datum", ignoreDuplicates: true })
    .select("profile_id");
  if (eintragFehler) throw new Error(eintragFehler.message);
  if (!neu || neu.length === 0) return { ...leer, faellig: faellig.length };

  // Namen und Plätze erst jetzt – nur für das, was wirklich hinausgeht.
  const alleSaetze = eintraege.flatMap((e) => e.saetze);
  const [{ data: kunden }, { data: plaetze }] = await Promise.all([
    supabase.from("customers").select("id,name").in("id", Array.from(new Set(eintraege.map((e) => e.auftrag.customer_id)))),
    supabase.from("storage_slots").select("id,code").in("id", Array.from(new Set(alleSaetze.map((s) => s.storage_slot_id)))),
  ]);
  const nameVon = new Map((kunden || []).map((k) => [k.id as string, k.name as string]));
  const platzVon = new Map((plaetze || []).map((p) => [p.id as string, p.code as string]));

  const geraeteVon = new Map<string, Geraet[]>();
  (geraete || []).forEach((g) => {
    const liste = geraeteVon.get(g.profile_id) || [];
    liste.push({ endpoint: g.endpoint, p256dh: g.p256dh, auth: g.auth });
    geraeteVon.set(g.profile_id, liste);
  });

  let gesendet = 0;
  const verwaist: string[] = [];
  await Promise.all(
    neu.map(async ({ profile_id }) => {
      const { titel, text } = mitnehmenText(
        jeKonto.get(profile_id) || [],
        (id) => nameVon.get(id) ?? "Kunde",
        (id) => platzVon.get(id) ?? "?"
      );
      const inhalt = pushNutzlast({
        titel, text,
        url: `/?${MITNEHMEN_PARAMETER}=${morgen}`,
        // Eine Meldung je Tag: Gleiche Kennung ersetzt eine noch offene, statt eine zweite
        // daneben zu legen.
        kennung: `mitnehmen-${morgen}`,
      });
      await Promise.all(
        (geraeteVon.get(profile_id) || []).map(async (g) => {
          try {
            await webpush.sendNotification({ endpoint: g.endpoint, keys: { p256dh: g.p256dh, auth: g.auth } }, inhalt);
            gesendet++;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) verwaist.push(g.endpoint);
          }
        })
      );
    })
  );
  if (verwaist.length > 0) await supabase.from("push_geraete").delete().in("endpoint", verwaist);

  return { faellig: faellig.length, hinweise: neu.length, gesendet };
}
