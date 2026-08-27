"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

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
          <div className="brand-badge">
            <svg viewBox="0 0 24 24" fill="none">
              <line x1="6" y1="21" x2="6" y2="3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M6 3 L19 7.5 L6 12 Z" fill="#fff" />
              <circle cx="6" cy="21" r="1.6" fill="#fff" />
            </svg>
          </div>
          <h1>Viana PinPoints</h1>
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
