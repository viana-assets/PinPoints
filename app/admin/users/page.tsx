"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import type { Profile, Role } from "@/lib/types";
// Anzeigenamen der Rollen kommen zentral aus lib/constants.ts – hier standen sie bis zur
// Sanierung ein zweites Mal wörtlich (Konstanten-Regel, siehe docs/README.md, Befund D1).
import { ROLE_LABEL } from "@/lib/constants";

// Nutzerverwaltung: nur für den Superadmin sichtbar. Listet alle Profile
// (dank RLS-Policy "Superadmin liest alle Profile") und erlaubt, die Rolle
// jedes Nutzers zu ändern (Admin / Techniker / Nutzer / Superadmin).
export default function UsersAdminPage() {
  const router = useRouter();
  const supabase = createClient();
  const [ownUserId, setOwnUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [status, setStatus] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setOwnUserId(user.id);
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      const r = (profile?.role as Role) || "user";
      setRole(r);
      if (r === "superadmin") {
        await refreshProfiles();
      }
    })();
  }, []);

  async function refreshProfiles() {
    setLoadingList(true);
    const { data, error } = await supabase.from("profiles").select("*").order("email");
    if (!error && data) setProfiles(data as Profile[]);
    setLoadingList(false);
  }

  async function changeRole(profileId: string, newRole: Role) {
    setStatus(null);
    if (profileId === ownUserId && newRole !== "superadmin") {
      const ok = confirm("Du entziehst dir gerade selbst die Superadmin-Rolle. Fortfahren?");
      if (!ok) return;
    }
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", profileId);
    if (error) {
      setStatus({ type: "error", text: "Rolle konnte nicht geändert werden: " + error.message });
      return;
    }
    await refreshProfiles();
    setStatus({ type: "ok", text: "Rolle aktualisiert." });
  }

  if (role === null) return <div style={{ padding: 24 }}>Lädt…</div>;
  if (role !== "superadmin") {
    return (
      <div style={{ padding: 24 }}>
        <p>Diese Seite ist nur für den Superadmin. <a href="/">Zurück zur App</a></p>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-box" style={{ width: 560 }}>
        <h1 style={{ marginBottom: 4 }}>Nutzerverwaltung</h1>
        <p className="subtitle">
          Nur der Superadmin sieht diese Seite. Hier siehst du alle Accounts und kannst
          ihre Rolle ändern.
        </p>
        {status && (
          <div className={status.type === "ok" ? "login-info" : "login-error"}>{status.text}</div>
        )}

        {loadingList ? (
          <div className="small">Lädt…</div>
        ) : profiles.length === 0 ? (
          <div className="empty">Keine Nutzer gefunden.</div>
        ) : (
          <table className="appt-table">
            <thead><tr><th>E-Mail</th><th>Rolle</th></tr></thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td>{p.email || "–"}{p.id === ownUserId ? <span className="small"> (Du)</span> : ""}</td>
                  <td>
                    <select value={p.role} onChange={(e) => changeRole(p.id, e.target.value as Role)} className="feld-kompakt">
                      <option value="user">{ROLE_LABEL.user}</option>
                      <option value="techniker">{ROLE_LABEL.techniker}</option>
                      <option value="admin">{ROLE_LABEL.admin}</option>
                      <option value="superadmin">{ROLE_LABEL.superadmin}</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <hr />
        <a href="/admin/invite" className="small" style={{ display: "block", marginBottom: 8 }}>+ Neuen Nutzer einladen →</a>
        <a href="/" className="small">← Zurück zu Viana PinPoints</a>
      </div>
    </div>
  );
}
