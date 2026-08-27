"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import type { Role } from "@/lib/types";

// Admin/Superadmin-Seite: einzige Möglichkeit, neue Nutzer ins System zu holen.
// Kein öffentliches Registrierungsformular – die Einladung kommt per
// E-Mail von Supabase mit einem einmaligen, zeitlich begrenzten Link.
export default function InvitePage() {
  const router = useRouter();
  const supabase = createClient();
  const [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("user");
  const [status, setStatus] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      setRole((profile?.role as Role) || "user");
    })();
  }, []);

  const isAdmin = role === "admin" || role === "superadmin";
  const isSuperAdmin = role === "superadmin";

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setSending(true);
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: inviteRole }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      setStatus({ type: "error", text: data.error || "Einladung fehlgeschlagen." });
      return;
    }
    setStatus({ type: "ok", text: `Einladung an ${email} wurde per E-Mail versendet.` });
    setEmail("");
    setInviteRole("user");
  }

  if (role === null) return <div style={{ padding: 24 }}>Lädt…</div>;
  if (!isAdmin) {
    return (
      <div style={{ padding: 24 }}>
        <p>Diese Seite ist nur für Admin und Superadmin. <a href="/">Zurück zur App</a></p>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-box" style={{ width: 420 }}>
        <h1 style={{ marginBottom: 4 }}>Nutzer einladen</h1>
        <p className="subtitle">
          Es gibt keine offene Registrierung. Trage hier die E-Mail-Adresse eines Kollegen ein –
          Supabase verschickt automatisch einen einmaligen Einladungslink.
        </p>
        {status && (
          <div className={status.type === "ok" ? "login-info" : "login-error"}>{status.text}</div>
        )}
        <form onSubmit={sendInvite}>
          <div className="field">
            <label>E-Mail-Adresse</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kollege@firma.de"
              required
            />
          </div>
          <div className="field">
            <label>Rolle</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
              <option value="user">Nutzer</option>
              <option value="techniker">Techniker</option>
              <option value="admin">Admin</option>
              {isSuperAdmin && <option value="superadmin">Superadmin</option>}
            </select>
          </div>
          <button className="btn-primary btn-block" type="submit" disabled={sending}>
            {sending ? "Sende Einladung…" : "Einladung senden"}
          </button>
        </form>
        <hr />
        {isSuperAdmin && <a href="/admin/users" className="small" style={{ display: "block", marginBottom: 8 }}>Nutzerverwaltung öffnen →</a>}
        <a href="/" className="small">← Zurück zu Viana PinPoints</a>
      </div>
    </div>
  );
}
