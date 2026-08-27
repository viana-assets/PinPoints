// Diese Seite zeigt nur einen kurzen Ladehinweis. Die eigentliche Arbeit -
// das Auslesen der Zugangs-Tokens aus dem URL-Fragment und Weiterleitung
// zu /auth/set-password - übernimmt der globale HashSessionHandler in
// app/layout.tsx, der auf jeder Seite mitläuft.
export default function AuthCallbackPage() {
  return (
    <div className="login-page">
      <div className="login-box">
        <p className="subtitle">Anmeldung wird verarbeitet…</p>
      </div>
    </div>
  );
}
