"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { IconMarke } from "@/components/icons";

// Login-only-Seite: es gibt hier bewusst KEIN Registrierungsformular.
// Zugang bekommt man nur über einen Einladungslink, den der Admin
// über /admin/invite verschickt (Supabase Auth Invite-E-Mail).
export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Login fehlgeschlagen: E-Mail oder Passwort falsch.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <div className="login-brand">
          <IconMarke />
          <h1>
            Vi<span className="brand-accent">ana</span> PinPoints
          </h1>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleLogin}>
          <div className="field">
            <label>E-Mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@firma.de"
              required
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label>Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
          <button className="btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? "Anmelden…" : "Anmelden"}
          </button>
        </form>
      </div>
    </div>
  );
}
