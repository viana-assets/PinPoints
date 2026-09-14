import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEintrag, ProtokollPerson } from "@/lib/types";
import { q } from "./client";

// Lesezugriff auf das Änderungsprotokoll. Die Tabelle stammt aus Migration 18, der
// Auftrags-/Kundenbezug und das Leserecht für Admins aus Migration 36.
//
// Es gibt hier bewusst KEINE Schreibfunktion: Einträge entstehen ausschließlich durch
// Datenbank-Trigger, und die Datenbank lässt auch gar nichts anderes zu. Ein Protokoll, das
// die Anwendung schreiben kann, kann sie auch umschreiben.
//
// Wer nicht lesen darf, bekommt laut RLS eine leere Liste – keinen Fehler. Die Anzeige
// unterscheidet das nicht, und das ist richtig so: „nichts zu sehen" ist für den Nutzer
// dasselbe, egal ob es nichts gibt oder er es nicht sehen darf.

// Wie viele Einträge höchstens auf einmal geholt werden. Das Protokoll ist die einzige
// Tabelle im System, die nie kleiner wird.
export const PROTOKOLL_SEITE = 200;

export async function fetchProtokoll(
  supabase: SupabaseClient,
  filter: { vonDatum?: string; tabelle?: string; benutzerId?: string } = {}
): Promise<AuditEintrag[]> {
  let abfrage = supabase
    .from("audit_log")
    .select("*")
    .order("geaendert_am", { ascending: false })
    .limit(PROTOKOLL_SEITE);

  if (filter.vonDatum) abfrage = abfrage.gte("geaendert_am", filter.vonDatum);
  if (filter.tabelle) abfrage = abfrage.eq("tabelle", filter.tabelle);
  if (filter.benutzerId) abfrage = abfrage.eq("geaendert_von", filter.benutzerId);

  return (await q<AuditEintrag[]>("Das Protokoll konnte nicht geladen werden", abfrage)) || [];
}

// Das Protokoll EINES Auftrags. Möglich als eine einzige indizierte Abfrage, weil Migration 36
// `auftrag_id` als berechnete Spalte führt – auch rückwirkend für alle Zeilen, die vor dieser
// Migration entstanden sind. Mit drin sind damit die Leistungen, die Mitarbeiterzuordnung und
// die Einlagerung zu diesem Auftrag: „Wer hat die Leistung entfernt?" ist eine Frage an den
// Auftrag, nicht an eine Tabelle, von der der Nutzer nichts weiß.
export async function fetchAuftragProtokoll(
  supabase: SupabaseClient,
  auftragId: string
): Promise<AuditEintrag[]> {
  return (await q<AuditEintrag[]>(
    "Das Protokoll zu diesem Auftrag konnte nicht geladen werden",
    supabase.from("audit_log").select("*").eq("auftrag_id", auftragId)
      .order("geaendert_am", { ascending: false }).limit(100)
  )) || [];
}

// Kennung → E-Mail. Eigene Funktion in der Datenbank, weil `profiles` laut Migration 05 nur
// der Superadmin lesen darf; ein Admin sähe im Protokoll sonst überall nur Kennungen.
export async function fetchProtokollPersonen(supabase: SupabaseClient): Promise<ProtokollPerson[]> {
  const { data, error } = await supabase.rpc("protokoll_personen");
  // Kein harter Fehler: Ohne Namen ist das Protokoll ärmer, aber nicht unbrauchbar – die
  // gekürzte Kennung steht dann in jeder Zeile. Ein Fehlerband dafür wäre unverhältnismäßig.
  if (error) return [];
  return (data as ProtokollPerson[]) || [];
}
