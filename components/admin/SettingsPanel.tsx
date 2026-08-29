import { useState } from "react";
import type { UserSettings } from "@/lib/types";

// Tab "Einstellungen": Anzeige-/Wiedervorlage-Präferenzen, Nutzerinfo, Logout.
// Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.
//
// Hier stand bis 29.08.2026 zusätzlich ein Knopf "Nutzerverwaltung", der in den Admin-Tab
// sprang. Entfernt: die Nutzerverwaltung ist ein vollwertiger Navigationspunkt (Admin) und
// dort als eigener Reiter erreichbar – ein zweiter Weg an anderer Stelle macht die
// Einstellungen unübersichtlich und lässt offen, welcher der "richtige" ist. `isAdmin` bleibt
// als Prop, weil die Zeile "Angemeldet als …" die Rolle mit ausweist.
export function SettingsPanel({ settings, onChange, isAdmin, isSuperAdmin, userEmail, onLogout }: {
  settings: UserSettings; onChange: (p: Partial<UserSettings>) => void; isAdmin: boolean; isSuperAdmin: boolean; userEmail: string; onLogout: () => void;
}) {
  const [period, setPeriod] = useState(settings.period_months);
  return (
    <div className="tabpanel active">
      <div className="field">
        <label>Zeilenanzeige in der Kundenliste</label>
        <select value={settings.row_display} onChange={(e) => onChange({ row_display: e.target.value as UserSettings["row_display"] })}>
          <option value="datum">Datum des letzten Kontakts</option>
          <option value="status">Status-Pille (Offen/Kontaktiert)</option>
          <option value="tage">Tage seit letztem Kontakt</option>
        </select>
      </div>
      <hr />
      <div className="field">
        <label>Wiedervorlage-Zeitraum (Monate) – danach wird eine kontaktierte Flagge wieder rot</label>
        <input type="number" min={1} max={24} value={period} onChange={(e) => setPeriod(parseInt(e.target.value, 10) || 3)} />
      </div>
      <button className="btn-primary btn-block" onClick={() => onChange({ period_months: period })}>Speichern</button>
      <hr />
      <div className="small">Angemeldet als {userEmail}{isSuperAdmin ? " (Superadmin)" : isAdmin ? " (Admin)" : ""}</div>
      <button className="btn-secondary btn-block" style={{ marginTop: 8 }} onClick={onLogout}>Abmelden</button>
    </div>
  );
}
