import { useState } from "react";
import type { UserSettings } from "@/lib/types";
import { PwaInstallieren } from "@/components/PwaInstallieren";
import { PushEinstellung } from "@/components/PushEinstellung";
import { PwaFassung } from "@/components/PwaFassung";
import { standText } from "@/components/OfflineHinweis";
import { ABENDHINWEIS_UHRZEIT_STANDARD } from "@/lib/constants";

// Tab "Einstellungen": Anzeige-/Wiedervorlage-Präferenzen, Nutzerinfo, Logout.
// Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.
//
// Hier stand bis 29.08.2026 zusätzlich ein Knopf "Nutzerverwaltung", der in den Admin-Tab
// sprang. Entfernt: die Nutzerverwaltung ist ein vollwertiger Navigationspunkt (Admin) und
// dort als eigener Reiter erreichbar – ein zweiter Weg an anderer Stelle macht die
// Einstellungen unübersichtlich und lässt offen, welcher der "richtige" ist. `isAdmin` bleibt
// als Prop, weil die Zeile "Angemeldet als …" die Rolle mit ausweist.
export function SettingsPanel({ settings, onChange, isAdmin, isSuperAdmin, userEmail, datenStand, onAktualisieren, laedt, onLogout }: {
  settings: UserSettings; onChange: (p: Partial<UserSettings>) => void; isAdmin: boolean; isSuperAdmin: boolean; userEmail: string;
  // Wann der Kundenbestand zuletzt wirklich vom Server kam. Steht hier dauerhaft und nicht nur
  // im Offline-Balken: Wer wissen will, wie frisch seine Daten sind, sucht das in den
  // Einstellungen – und nicht erst dann, wenn ohnehin gerade kein Netz da ist.
  datenStand?: number;
  // Alles neu vom Server holen. Der Knopf steht neben dem Stand, weil genau dort die Frage
  // entsteht: „das ist alt – wie komme ich an den aktuellen Stand?"
  onAktualisieren: () => void;
  laedt?: boolean;
  onLogout: () => void;
}) {
  const [period, setPeriod] = useState(settings.period_months);
  const [abendZeit, setAbendZeit] = useState(settings.abendhinweis_uhrzeit || ABENDHINWEIS_UHRZEIT_STANDARD);
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
      {/* Der Weg zur Installation steht hier und nicht als Hinweisbalken auf der Karte: Er
          wird einmal pro Gerät gebraucht, nicht bei jedem Öffnen. Wer ihn sucht, sucht ihn
          in den Einstellungen. */}
      <PwaInstallieren />
      <hr />
      <PwaFassung />
      <hr />
      <PushEinstellung />
      {/* Abendhinweis „Reifen mitnehmen" (Migration 55). Je Person, nicht je Gerät: Wer zwei
          Geräte angemeldet hat, will die Uhrzeit nicht zweimal einstellen. Steht direkt unter
          den Benachrichtigungen, weil er ohne angemeldetes Gerät nichts bewirkt. */}
      <div className="field" style={{ marginTop: 12 }}>
        <div className="checkbox-row" style={{ margin: 0 }}>
          <input
            id="abendhinweis-aktiv"
            type="checkbox"
            checked={settings.abendhinweis_aktiv !== false}
            onChange={(e) => onChange({ abendhinweis_aktiv: e.target.checked })}
          />
          <label htmlFor="abendhinweis-aktiv">Abends erinnern, welche eingelagerten Reifen morgen mitmüssen</label>
        </div>
        <div className="row" style={{ alignItems: "center", gap: 8, marginTop: 6 }}>
          <span className="small">um</span>
          <input
            type="time"
            style={{ maxWidth: 120 }}
            disabled={settings.abendhinweis_aktiv === false}
            value={abendZeit}
            onChange={(e) => setAbendZeit(e.target.value)}
            onBlur={() => {
              // Erst beim Verlassen speichern: Das Zeitfeld liefert beim Tippen Zwischenstände
              // („2" auf dem Weg zu „20:30"), und jeder davon wäre ein Schreibvorgang.
              if (/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(abendZeit) && abendZeit !== settings.abendhinweis_uhrzeit) {
                onChange({ abendhinweis_uhrzeit: abendZeit });
              }
            }}
          />
          <span className="small">Uhr</span>
        </div>
        <div className="small" style={{ marginTop: 4, color: "var(--muted)" }}>
          Eine Meldung mit Kunde und Lagerplatz für alle Aufträge von morgen, bei denen der Kunde
          Reifen bei uns liegen hat – an die eingeteilten Mitarbeiter, sonst an die Admins. Kommt
          nur, wenn es etwas mitzunehmen gibt.
        </div>
      </div>
      <hr />
      <div className="small">
        Daten zuletzt geladen: {datenStand ? standText(datenStand) : "noch nicht"}
      </div>
      <button className="btn-secondary btn-block" style={{ marginTop: 6 }} disabled={laedt} onClick={onAktualisieren}>
        {laedt ? "Wird geladen…" : "Jetzt aktualisieren"}
      </button>
      <div className="small" style={{ marginTop: 4, color: "var(--muted)" }}>
        Die App lädt beim Öffnen und beim Zurückholen aus dem Hintergrund automatisch nach.
        Benachrichtigungen hängen nicht davon ab – die verschickt der Server aus der Datenbank,
        auch wenn dieses Gerät gerade einen älteren Stand anzeigt.
      </div>
      <hr />
      <div className="small">Angemeldet als {userEmail}{isSuperAdmin ? " (Superadmin)" : isAdmin ? " (Admin)" : ""}</div>
      <button className="btn-secondary btn-block" style={{ marginTop: 8 }} onClick={onLogout}>Abmelden</button>
    </div>
  );
}
