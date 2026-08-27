"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

// Admin-Seite: einzige Möglichkeit, neue Nutzer ins System zu holen.
// Kein öffentliches Registrierungsformular – die Einladung kommt per
// E-Mail von Supabase mit einem einmaligen, zeitlich begrenzten Link.
export default function InvitePage() {
  const router = useRouter();
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      setIsAdmin(profile?.role === "admin");
    })();
  }, []);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setSending(true);
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      setStatus({ type: "error", text: data.error || "Einladung fehlgeschlagen." });
      return;
    }
    setStatus({ type: "ok", text: `Einladung an ${email} wurde per E-Mail versendet.` });
    setEmail("");
  }

  if (isAdmin === null) return <div style={{ padding: 24 }}>Lädt…</div>;
  if (isAdmin === false) {
    return (
      <div style={{ padding: 24 }}>
        <p>Diese Seite ist nur für den Admin. <a href="/">Zurück zur App</a></p>
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
          <button className="btn-primary btn-block" type="submit" disabled={sending}>
            {sending ? "Sende Einladung…" : "Einladung senden"}
          </button>
        </form>
        <hr />
        <a href="/" className="small">← Zurück zu Viana PinPoints</a>
      </div>
    </div>
  );
}
