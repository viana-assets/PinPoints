// Offline schreiben – der Ausgangskorb wird übertragen (F1). Regeln in lib/offline/ausgang.ts.
//
// Der Reihe nach, in der Reihenfolge der Entstehung. Vor jeder Absicht wird der AKTUELLE Stand
// am Server gelesen und gegen die Basis verglichen (feldweise); erst dann wird geschrieben. Die
// Rechteprüfung der Datenbank gilt dabei unverändert – was sie ablehnt, landet mit ihrem Grund
// unter „nicht übernommen".
//
// Bricht unterwegs das Netz wieder weg, hört der Lauf auf und lässt den Rest stehen; der
// nächste Lauf (Netz wieder da, alle 30 Sekunden, App hervorgeholt) macht dort weiter.
//
// Doppelt senden schadet nicht: Eine neue Position trägt ihre Kennung schon vom Gerät mit, ein
// zweites Anlegen scheitert an der Eindeutigkeit und gilt als erledigt; eine Feldänderung, die
// schon angekommen ist, findet beim zweiten Mal ihren eigenen Wert vor und ist kein Konflikt.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ABGESCHLOSSENE_ZUSTAENDE, ORDER_STATUS_LABEL } from "@/lib/constants";
import type { OrderStatus } from "@/lib/types";
import { istNetzfehler, konfliktFelder, type Absicht } from "./ausgang";
import { ausgangAendern, ausgangAlle, ausgangEntfernen, ausgangLaden } from "./speicher";

type Ergebnis =
  | { ok: true }
  | { konflikt: { feld: string; meine: unknown; server: unknown }[] }
  | { abgelehnt: string };

class Netzweg extends Error {}

function pruefe<T>(antwort: { data: T | null; error: { message: string; code?: string } | null }): T | null {
  if (antwort.error) {
    if (istNetzfehler(antwort.error.message)) throw new Netzweg(antwort.error.message);
    throw new Error(antwort.error.message);
  }
  return antwort.data;
}

async function auftragOffen(supabase: SupabaseClient, auftragId: string): Promise<string | null> {
  const zeile = pruefe(await supabase.from("orders").select("status, deleted_at").eq("id", auftragId).maybeSingle()) as
    { status: OrderStatus; deleted_at: string | null } | null;
  if (!zeile || zeile.deleted_at) return "Den Auftrag gibt es nicht mehr.";
  if (ABGESCHLOSSENE_ZUSTAENDE.includes(zeile.status)) {
    return `Der Auftrag ist inzwischen ${ORDER_STATUS_LABEL[zeile.status].toLowerCase()} – ein abgeschlossener Auftrag wird nicht mehr geändert.`;
  }
  return null;
}

async function einzeln(supabase: SupabaseClient, a: Absicht): Promise<Ergebnis> {
  if (a.art === "auftrag") {
    const grund = await auftragOffen(supabase, a.auftragId);
    if (grund) return { abgelehnt: grund };
    const spalten = Object.keys(a.felder).join(", ");
    const server = pruefe(await supabase.from("orders").select(spalten).eq("id", a.auftragId).maybeSingle()) as Record<string, unknown> | null;
    if (!server) return { abgelehnt: "Den Auftrag gibt es nicht mehr." };
    const konflikt = konfliktFelder(a.felder, a.basis, server);
    if (konflikt.length > 0) return { konflikt };
    pruefe(await supabase.from("orders").update(a.felder).eq("id", a.auftragId));
    return { ok: true };
  }

  if (a.art === "position_neu") {
    const grund = await auftragOffen(supabase, a.auftragId);
    if (grund) return { abgelehnt: grund };
    const antwort = await supabase.from("order_articles").insert(a.zeile);
    // Schon angekommen (zweiter Versand nach einem abgerissenen ersten): erledigt.
    if (antwort.error?.code === "23505") return { ok: true };
    pruefe(antwort);
    return { ok: true };
  }

  if (a.art === "position") {
    const grund = await auftragOffen(supabase, a.auftragId);
    if (grund) return { abgelehnt: grund };
    const server = pruefe(await supabase.from("order_articles").select("quantity, endpreis_netto, note, deleted_at").eq("id", a.positionId).maybeSingle()) as Record<string, unknown> | null;
    if (!server) return { abgelehnt: "Diese Leistung gibt es am Auftrag nicht mehr." };
    if (server.deleted_at) {
      return a.felder.deleted_at ? { ok: true } : { abgelehnt: "Diese Leistung wurde inzwischen vom Auftrag entfernt." };
    }
    const konflikt = konfliktFelder(a.felder, a.basis, server).filter((k) => k.feld !== "deleted_at");
    if (konflikt.length > 0) return { konflikt };
    pruefe(await supabase.from("order_articles").update(a.felder).eq("id", a.positionId));
    return { ok: true };
  }

  // Radmessung
  const satz = pruefe(await supabase.from("tire_storage").select("erfassungsart").eq("id", a.satzId).maybeSingle()) as { erfassungsart: string } | null;
  if (!satz) return { abgelehnt: "Diesen Reifensatz gibt es nicht mehr." };
  if (satz.erfassungsart !== "einzeln") {
    if (!a.umstellen) return { abgelehnt: "Der Satz steht inzwischen wieder auf „ein Wert für den Satz“." };
    // Wie online: Das erste gemessene Rad stellt um, der Satzwert weicht (Migration 33).
    pruefe(await supabase.from("tire_storage")
      .update({ erfassungsart: "einzeln", profiltiefe_mm: null, updated_at: new Date().toISOString() })
      .eq("id", a.satzId));
  }
  const vorhanden = pruefe(await supabase.from("eingelagerte_raeder")
    .select("id, reifengroesse, dot_date, profiltiefe_mm, felge, sensor, bemerkung")
    .eq("tire_storage_id", a.satzId).eq("position", a.position).maybeSingle()) as Record<string, unknown> | null;
  if (vorhanden) {
    // Kannte das Gerät das Rad noch nicht, hat es inzwischen jemand anders gemessen: Jeder Wert,
    // der dort schon steht und anders ist, ist ein Konflikt.
    const konflikt = konfliktFelder(a.felder, a.basis ?? {}, vorhanden);
    if (konflikt.length > 0) return { konflikt };
    pruefe(await supabase.from("eingelagerte_raeder")
      .update({ ...a.felder, updated_at: new Date().toISOString() }).eq("id", vorhanden.id as string));
    return { ok: true };
  }
  pruefe(await supabase.from("eingelagerte_raeder").insert({ tire_storage_id: a.satzId, position: a.position, ...a.felder }));
  return { ok: true };
}

let laeuft: Promise<number> | null = null;

// Überträgt alles, was wartet. Gibt die Zahl der übernommenen Absichten zurück.
export function ausgangSenden(supabase: SupabaseClient): Promise<number> {
  if (laeuft) return laeuft;
  laeuft = (async () => {
    await ausgangLaden();
    let uebernommen = 0;
    for (const a of [...ausgangAlle()]) {
      if (a.zustand !== "wartet") continue;
      // Eine Änderung an einer offline angelegten Leistung, deren Anlage nicht durchging, hat
      // nichts, woran sie sich halten kann.
      if (a.art === "position") {
        const anlage = ausgangAlle().find((b) => b.art === "position_neu" && b.zeile.id === a.positionId && b.zustand !== "wartet");
        if (anlage) {
          await ausgangAendern(a.id, { zustand: "abgelehnt", grund: "Gehört zu einer Leistung, die selbst nicht übernommen wurde." });
          continue;
        }
      }
      try {
        const e = await einzeln(supabase, a);
        if ("ok" in e) { await ausgangEntfernen(a.id); uebernommen++; }
        else if ("konflikt" in e) await ausgangAendern(a.id, { zustand: "konflikt", konflikt: e.konflikt });
        else await ausgangAendern(a.id, { zustand: "abgelehnt", grund: e.abgelehnt });
      } catch (fehler) {
        // Netz wieder weg: aufhören, der Rest wartet weiter.
        if (fehler instanceof Netzweg || istNetzfehler(fehler)) break;
        await ausgangAendern(a.id, { zustand: "abgelehnt", grund: fehler instanceof Error ? fehler.message : "Die Datenbank hat die Änderung abgelehnt." });
      }
    }
    return uebernommen;
  })().finally(() => { laeuft = null; });
  return laeuft;
}

// Ein Konflikt ist entschieden.
//   „meine": die eigene Fassung soll gelten – die Basis wird auf den Serverstand gesetzt, damit
//            der nächste Vergleich ihn als bekannt ansieht, und die Absicht wartet wieder.
//   „server": die Fassung am Server bleibt – die Absicht wird verworfen (in Teilen: nur die
//            strittigen Felder fallen weg, unstrittige gehen weiter mit).
export async function konfliktEntscheiden(a: Absicht, wahl: "meine" | "server"): Promise<void> {
  const strittig = a.konflikt ?? [];
  if (wahl === "meine") {
    const basis: Record<string, unknown> = { ...("basis" in a && a.basis ? a.basis : {}) };
    for (const k of strittig) basis[k.feld] = k.server;
    await ausgangAendern(a.id, { zustand: "wartet", konflikt: undefined, basis } as Partial<Absicht>);
    return;
  }
  if ("felder" in a) {
    const felder: Record<string, unknown> = { ...a.felder };
    for (const k of strittig) delete felder[k.feld];
    // Bleibt nichts Unstrittiges übrig: weg damit.
    if (Object.keys(felder).length === 0) { await ausgangEntfernen(a.id); return; }
    await ausgangAendern(a.id, { zustand: "wartet", konflikt: undefined, felder } as Partial<Absicht>);
    return;
  }
  await ausgangEntfernen(a.id);
}
