"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { IconMarke } from "@/components/icons";

// Erster Schritt nach dem Einladungslink: eigenes Passwort setzen.
export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    if (password !== confirm) {
      setError("Die beiden Passwörter stimmen nicht überein.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError("Passwort konnte nicht gesetzt werden: " + error.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1200);
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <div className="login-brand">
          <IconMarke />
          <h1>Willkommen!</h1>
        </div>
        <p className="subtitle">Bitte setze ein eigenes Passwort für deinen Zugang.</p>

        {done && <div className="login-info">Passwort gesetzt – du wirst weitergeleitet…</div>}
        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Neues Passwort</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="field">
            <label>Passwort wiederholen</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <button className="btn-primary btn-block" type="submit">Passwort speichern</button>
        </form>
      </div>
    </div>
  );
}
