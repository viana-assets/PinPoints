import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";

// Nur Admins dürfen Einladungen versenden. Nutzt den Service-Role-Key
// (nur serverseitig!) um über Supabase Auth eine echte Einladungs-E-Mail
// mit einmaligem Link zu verschicken. Es gibt keine offene Registrierung.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Nur der Admin darf Einladungen verschicken." }, { status: 403 });
  }

  const { email } = await request.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "E-Mail-Adresse fehlt." }, { status: 400 });
  }

  const admin = createAdminClient();
  const redirectTo = `${new URL(request.url).origin}/auth/callback`;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, userId: data.user?.id });
}
