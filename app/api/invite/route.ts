import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";

const ASSIGNABLE_ROLES = ["user", "techniker", "admin", "superadmin"] as const;

// Admin und Superadmin dürfen Einladungen versenden. Nutzt den Service-Role-Key
// (nur serverseitig!) um über Supabase Auth eine echte Einladungs-E-Mail
// mit einmaligem Link zu verschicken. Es gibt keine offene Registrierung.
// Die Rolle "superadmin" darf nur ein Superadmin an eine Einladung vergeben.
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

  const callerRole = profile?.role;
  if (callerRole !== "admin" && callerRole !== "superadmin") {
    return NextResponse.json({ error: "Nur Admin oder Superadmin dürfen Einladungen verschicken." }, { status: 403 });
  }

  const { email, role } = await request.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "E-Mail-Adresse fehlt." }, { status: 400 });
  }

  const requestedRole = (role && ASSIGNABLE_ROLES.includes(role) ? role : "user") as typeof ASSIGNABLE_ROLES[number];
  if (requestedRole === "superadmin" && callerRole !== "superadmin") {
    return NextResponse.json({ error: "Nur ein Superadmin darf die Rolle Superadmin vergeben." }, { status: 403 });
  }

  const admin = createAdminClient();
  const redirectTo = `${new URL(request.url).origin}/auth/callback`;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Der handle_new_user-Trigger legt das Profil mit Standardrolle "user" an
  // (oder "superadmin" für ADMIN_EMAIL); falls eine andere Rolle gewünscht
  // wurde, hier direkt nachziehen (Service-Role-Client umgeht RLS).
  if (data.user?.id && requestedRole !== "user") {
    await admin.from("profiles").update({ role: requestedRole }).eq("id", data.user.id);
  }

  return NextResponse.json({ ok: true, userId: data.user?.id });
}
