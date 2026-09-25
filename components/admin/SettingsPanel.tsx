import { useState } from "react";
import type { UserSettings } from "@/lib/types";
import { PwaInstallieren } from "@/components/PwaInstallieren";
import { PushEinstellung } from "@/components/PushEinstellung";
import { PwaFassung } from "@/components/PwaFassung";
import { APP_VERSION } from "@/lib/version";
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
export function SettingsPanel({ settings, onChange, isAdmin, isSuperAdmin, userEmail, datenStand, onAktualisieren, laedt, onLogout, onNeuigkeiten, neuigkeitenUngelesen = 0 }: {
  // „Was gibt es Neues" – nur für Admin und Superadmin gesetzt. Die Zahl sagt, wie viele
  // Fassungen seit dem letzten Öffnen dazugekommen sind.
  onNeuigkeiten?: () => void;
  neuigkeitenUngelesen?: number;
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
  const [abendZeit, setAbendZeit] = useState(settings.abendhinweis_uhrzeit || ABENDHINWEIS_UHRZEIT_STANDARD);
  const rolle = isSuperAdmin ? "Superadmin" : isAdmin ? "Admin" : "Nutzer";
  const abendAn = settings.abendhinweis_aktiv !== false;
  // Die Wiedervorlage speichert jetzt bei jedem Schritt (vorher Zahlenfeld + eigener Knopf):
  // Ein Wert von 1 bis 24 ist mit − und + in wenigen Tipps erreicht und nie „halb getippt".
  const zeitraum = (n: number) => onChange({ period_months: Math.min(24, Math.max(1, n)) });
  const ZEILEN: { wert: UserSettings["row_display"]; text: string }[] = [
    { wert: "datum", text: "Letzter Kontakt" }, { wert: "status", text: "Status" }, { wert: "tage", text: "Tage seit Kontakt" },
  ];

  // Neu gestaltet am 26.09.2026 (Entwurf „T · Einstellungen"): Konto oben, darunter Gruppen in
  // Karten statt einer langen Liste mit Trennlinien. Die Bausteine für Installation, Fassung und
  // Benachrichtigungen bleiben dieselben, sie stehen nur in Karten.
  return (
    <div className="tabpanel active">
      <div className="es-seite">
        <div className="lg-leiste">
          <div className="lg-kopf"><div className="lg-titel"><h2>Einstellungen</h2></div></div>
        </div>

        <div className="db-karte es-konto">
          <span className="kl-kreis termin" aria-hidden="true">{(userEmail || "?").slice(0, 2).toUpperCase()}</span>
          <span className="db-punkt-text">
            <b>{userEmail}</b>
            <span className="small">{rolle}</span>
          </span>
          <button type="button" className="es-knopf" onClick={onLogout}>Abmelden</button>
        </div>

        <span className="op-gruppe-titel">BENACHRICHTIGUNGEN</span>
        <div className="db-karte es-karte">
          <PushEinstellung />
        </div>
        <div className="db-karte es-karte">
          {/* Abendhinweis „Reifen mitnehmen" (Migration 55). Je Person, nicht je Gerät: Wer zwei
              Geräte angemeldet hat, will die Uhrzeit nicht zweimal einstellen. */}
          <button type="button" className="es-zeile" aria-pressed={abendAn} onClick={() => onChange({ abendhinweis_aktiv: !abendAn })}>
            <span className="db-punkt-text">
              <b>Abendhinweis „Reifen mitnehmen“</b>
              <span className="small">welche eingelagerten Reifen morgen mitmüssen</span>
            </span>
            <span className={"nk-spur" + (abendAn ? " an" : "")} aria-hidden="true"><span /></span>
          </button>
          <div className="es-zeile statisch">
            <span className="db-punkt-text"><b>Uhrzeit</b><span className="small">{abendAn ? "jeden Abend, nur wenn es etwas mitzunehmen gibt" : "Abendhinweis ist aus"}</span></span>
            <input
              type="time"
              className="es-zeit"
              disabled={!abendAn}
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
          </div>
          <span className="small es-fuss">Eine Meldung mit Kunde und Lagerplatz für alle Aufträge von morgen, bei denen der Kunde Reifen bei uns liegen hat – an die eingeteilten Mitarbeiter, sonst an die Admins.</span>
        </div>

        <span className="op-gruppe-titel">ANZEIGE</span>
        <div className="db-karte es-karte">
          <div className="es-block">
            <span className="db-punkt-text"><b>Zeile unter dem Kunden</b><span className="small">in der Kundenliste</span></span>
            <div className="lg-lagerwahl es-segment" role="group" aria-label="Zeilenanzeige">
              {ZEILEN.map((z) => (
                <button key={z.wert} type="button" className={settings.row_display === z.wert ? "aktiv" : ""} onClick={() => onChange({ row_display: z.wert })}>{z.text}</button>
              ))}
            </div>
          </div>
          <div className="es-zeile statisch">
            <span className="db-punkt-text"><b>Wiedervorlage nach</b><span className="small">danach wird ein kontaktierter Kunde wieder rot</span></span>
            <span className="es-stepper">
              <button type="button" aria-label="Weniger" disabled={settings.period_months <= 1} onClick={() => zeitraum(settings.period_months - 1)}>−</button>
              <b>{settings.period_months} Mon.</b>
              <button type="button" aria-label="Mehr" disabled={settings.period_months >= 24} onClick={() => zeitraum(settings.period_months + 1)}>+</button>
            </span>
          </div>
          <span className="small es-fuss">Den Kartenstil (Straße, Satellit) stellst du direkt auf der Karte um.</span>
        </div>

        <span className="op-gruppe-titel">APP</span>
        {/* Die Fassung des Programms (lib/version.ts). Die des Service Workers steht darunter in
            PwaFassung; laufen beide auseinander, ist nur eine der Dateien angekommen. */}
        <div className="db-karte es-karte">
          <div className="es-zeile statisch">
            <span className="db-punkt-text">
              <b>PinPoints {APP_VERSION}</b>
              <span className="small">Fassung dieses Programms</span>
            </span>
          </div>
          {onNeuigkeiten && (
            <button type="button" className="es-zeile" onClick={onNeuigkeiten}>
              <span className="db-punkt-text">
                <b>Was gibt es Neues</b>
                <span className="small">Was sich in jeder Fassung geändert hat</span>
              </span>
              {neuigkeitenUngelesen > 0 ? <span className="nw-neu">{neuigkeitenUngelesen} neu</span> : <span className="ad-pfeil" aria-hidden="true">›</span>}
            </button>
          )}
        </div>
        <div className="db-karte es-karte">
          {/* Der Weg zur Installation steht hier und nicht als Hinweisbalken auf der Karte: Er
              wird einmal pro Gerät gebraucht, nicht bei jedem Öffnen. */}
          <PwaInstallieren />
        </div>
        <div className="db-karte es-karte">
          <PwaFassung />
        </div>
        <div className="db-karte es-karte">
          <div className="es-zeile statisch">
            <span className="db-punkt-text">
              <b>Daten</b>
              <span className="small">zuletzt geladen: {datenStand ? standText(datenStand) : "noch nicht"}</span>
            </span>
            <button type="button" className="es-knopf" disabled={laedt} onClick={onAktualisieren}>{laedt ? "Lädt …" : "Jetzt laden"}</button>
          </div>
          <span className="small es-fuss">Die App lädt beim Öffnen und beim Zurückholen aus dem Hintergrund automatisch nach. Benachrichtigungen verschickt der Server aus der Datenbank – auch wenn dieses Gerät gerade einen älteren Stand zeigt.</span>
        </div>
      </div>
    </div>
  );
}
