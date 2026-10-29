import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { chatFotosAufraeumen } from "@/lib/chatVersand";
import { bestellFotosAufraeumen } from "@/lib/bestellVersand";
import { CHAT_FOTO_BUCKET } from "@/lib/chat";
import { FIN_BELEG_BUCKET } from "@/lib/finance/belege";
import { BESTELL_FOTO_BUCKET } from "@/lib/bestellung";

// Chat-Fotos nach „Alle Daten löschen“ sofort entfernen (Migration 86, v142). Nur der Superadmin.
//
// SQL darf keine Dateien in Supabase Storage löschen (Migration 65). Beim Leeren des Chats merkt der
// TRUNCATE-Trigger aus Migration 84 die Pfade in `private.chat_fotos_weg` vor; sonst räumt sie der
// Minutenlauf (app/api/push/senden) nach und nach ab. Hier geschieht dasselbe sofort und vollständig –
// mit dem Dienstschlüssel, denn die Fotos aus Einzelchats darf der Superadmin selbst nicht sehen.
//
// Zusätzlich, NUR wenn der Chat wirklich leer ist: alles, was sonst noch im Speicher liegt (etwa ein
// Foto, dessen Nachricht nie ankam). Bei leerem Chat gehört dort keine Datei mehr hin. Steht noch eine
// Nachricht in der Tabelle, bleibt der Speicher unangetastet – dieser Weg löscht nie lebende Fotos.

//
// Seit v148 (Migration 90) genauso die Belegdateien von Finance (`fin-belege`): Ist `fin_belege` leer,
// gehört dort keine Datei mehr hin. Seit v173 (Migration 104) ebenso die Fotos der Bestellliste (`bestell-fotos`).

// So viele Runden zu je 200 Pfaden (`chat_fotos_weg_liste`) höchstens – reicht für 10 000 Fotos.
const RUNDEN = 50;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profil?.role !== "superadmin") {
    return NextResponse.json({ error: "Nur der Superadmin." }, { status: 403 });
  }

  const admin = createAdminClient();
  let entfernt = 0;
  try {
    for (let i = 0; i < RUNDEN; i++) {
      const runde = await chatFotosAufraeumen(admin);
      entfernt += runde.entfernt;
      if (runde.entfernt === 0) break;
    }

    const { count, error: zaehlFehler } = await admin.from("chat_nachrichten").select("id", { count: "exact", head: true });
    if (!zaehlFehler && count === 0) entfernt += await bucketLeeren(admin, CHAT_FOTO_BUCKET);
    // Fehlt die Tabelle (Migration 90 nicht gelaufen), kommt ein Fehler – dann bleibt der Speicher, wie er ist.
    const belege = await admin.from("fin_belege").select("id", { count: "exact", head: true });
    if (!belege.error && belege.count === 0) entfernt += await bucketLeeren(admin, FIN_BELEG_BUCKET);
    // Seit Migration 105 merkt das Leeren die Bestellfotos vor – erst abarbeiten, dann (bei leerer Liste) den Rest.
    for (let i = 0; i < RUNDEN; i++) {
      const runde = await bestellFotosAufraeumen(admin);
      entfernt += runde.entfernt;
      if (runde.entfernt === 0) break;
    }
    const bestellungen = await admin.from("bestellwuensche").select("id", { count: "exact", head: true });
    if (!bestellungen.error && bestellungen.count === 0) entfernt += await bucketLeeren(admin, BESTELL_FOTO_BUCKET);
  } catch (e) {
    // Keine Pfade oder Inhalte in die Meldung – nur, dass es nicht ganz geklappt hat.
    return NextResponse.json({ error: e instanceof Error ? "Fotos und Belegdateien nicht vollständig gelöscht." : "Fehler", entfernt }, { status: 500 });
  }
  return NextResponse.json({ ok: true, entfernt });
}

// Alles in einem Bucket entfernen. Ablage überall `<Ordner>/<Datei>` (Chat: Konto-ID, Belege: Beleg-ID).
async function bucketLeeren(admin: ReturnType<typeof createAdminClient>, bucket: string): Promise<number> {
  const speicher = admin.storage.from(bucket);
  let entfernt = 0;
  const { data: ordner } = await speicher.list("", { limit: 1000 });
  for (const o of ordner || []) {
    for (;;) {
      const { data: dateien } = await speicher.list(o.name, { limit: 1000 });
      const pfade = (dateien || []).filter((d) => d.id).map((d) => `${o.name}/${d.name}`);
      if (pfade.length === 0) break;
      const { error } = await speicher.remove(pfade);
      if (error) throw new Error(error.message);
      entfernt += pfade.length;
      if (pfade.length < 1000) break;
    }
  }
  return entfernt;
}
