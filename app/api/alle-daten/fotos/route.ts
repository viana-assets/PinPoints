import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { chatFotosAufraeumen } from "@/lib/chatVersand";
import { CHAT_FOTO_BUCKET } from "@/lib/chat";

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
    if (!zaehlFehler && count === 0) {
      const speicher = admin.storage.from(CHAT_FOTO_BUCKET);
      // Ablage: <Konto-ID>/<Datei> (lib/api/chat.ts). Oben stehen also nur Ordner.
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
    }
  } catch (e) {
    // Keine Pfade oder Inhalte in die Meldung – nur, dass es nicht ganz geklappt hat.
    return NextResponse.json({ error: e instanceof Error ? "Chat-Fotos nicht vollständig gelöscht." : "Fehler", entfernt }, { status: 500 });
  }
  return NextResponse.json({ ok: true, entfernt });
}
