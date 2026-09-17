import type { SupabaseClient } from "@supabase/supabase-js";
import type { Verb } from "@/lib/constants";
import { fetchPaged, qWrite } from "./client";

// Datenzugriffsschicht für die Rechte (Migration 09/10/16/42): je Bereich, welche Rollen dort
// lesen, schreiben und löschen dürfen.
//
// Seit Migration 42 sind es drei Rollenlisten statt einer, und die Datenbank wertet sie selbst
// aus (`public.darf()`) – ein Haken in der Modulverwaltung ändert damit tatsächlich, was
// möglich ist, nicht nur, was sichtbar ist.
//
// Die Spalte heißt weiterhin `edit_roles` und meint „schreiben". Umbenennen wäre sauberer
// gewesen, hätte aber jede Zeile Bestandscode mitgerissen, die sie noch liest.

export type Bereichsrechte = Partial<Record<Verb, string[]>>;

const SPALTE: Record<Verb, "read_roles" | "edit_roles" | "delete_roles"> = {
  lesen: "read_roles", schreiben: "edit_roles", loeschen: "delete_roles",
};

export async function fetchModulePermissions(supabase: SupabaseClient): Promise<Record<string, Bereichsrechte>> {
  const rows = await fetchPaged<{ module_key: string; read_roles: string[] | null; edit_roles: string[] | null; delete_roles: string[] | null }>(
    "Die Rechte konnten nicht geladen werden",
    (von, bis) => supabase.from("module_permissions").select("*").range(von, bis)
  );
  const map: Record<string, Bereichsrechte> = {};
  rows.forEach((r) => {
    map[r.module_key] = {
      lesen: r.read_roles || [],
      schreiben: r.edit_roles || [],
      loeschen: r.delete_roles || [],
    };
  });
  return map;
}

// Speichert EIN Verb eines Bereichs. Bewusst nicht die ganze Zeile: Wer in der Matrix einen
// Haken setzt, meint diesen einen Haken – ein Aufruf, der alle drei Listen mitschickt, würde
// bei zwei gleichzeitig offenen Fenstern die Änderung des anderen überschreiben.
//
// `upsert` mit nur einer Spalte geht nicht: Existiert die Zeile noch nicht, müssen die beiden
// anderen Listen mit angelegt werden. Deshalb kommen sie als Ausgangswert mit herein.
export async function upsertModulePermissions(
  supabase: SupabaseClient,
  bereich: string,
  verb: Verb,
  rollen: string[],
  bestand: Bereichsrechte
): Promise<void> {
  const zeile: Record<string, unknown> = {
    module_key: bereich,
    read_roles: bestand.lesen ?? [],
    edit_roles: bestand.schreiben ?? [],
    delete_roles: bestand.loeschen ?? [],
  };
  zeile[SPALTE[verb]] = rollen;
  await qWrite(
    "Die Berechtigung konnte nicht gespeichert werden",
    supabase.from("module_permissions").upsert(zeile)
  );
}
