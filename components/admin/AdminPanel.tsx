import { useEffect, useMemo, useState } from "react";
import type { Betrieb, BetriebFelder, Employee, Firmenfahrzeug, Profile, Role } from "@/lib/types";
import type { Bereichsrechte } from "@/lib/api/permissions";
import type { Verb } from "@/lib/constants";
import type { FirmenfahrzeugFelder } from "@/lib/api/firmenfahrzeuge";
import { createClient } from "@/lib/supabaseClient";
import { ROLE_LABEL } from "@/lib/constants";
import { IconAdmin, IconTrash } from "@/components/icons";
import { PermissionMatrix } from "./PermissionMatrix";
import { ProtokollPanel, tageZurueck } from "./ProtokollPanel";
import { fetchProtokoll, fetchProtokollPersonen } from "@/lib/api/audit";
import { fetchNamensverzeichnis, type Namensverzeichnis } from "@/lib/api/protokoll";
import type { AuditEintrag, ProtokollPerson } from "@/lib/types";
import { PROTOKOLL_TAGE_STANDARD, TERMIN_INTERVALLE } from "@/lib/constants";
import { fetchBetrieb, setzeTerminIntervall, speichereBetrieb, setzeNaechsteRechnungsnummer } from "@/lib/api/betrieb";
import { BetriebsdatenPanel } from "./BetriebsdatenPanel";
import { GeokodierLauf } from "./GeokodierLauf";
import { AdressenPruefen } from "./AdressenPruefen";
import { FirmenfahrzeugPanel } from "./FirmenfahrzeugPanel";

// Admin-Modul: Nutzerverwaltung – als eigener Tab statt separater Seite, damit man wie bei
// Termine einfach das Fenster wechselt statt zu navigieren. Bündelt zusätzlich die
// Modulverwaltung (PermissionMatrix) als Unter-Tab. Die Artikel-Übersicht war früher hier als
// dritter Unter-Tab eingebunden, ist aber seit Phase 4 eine eigene Kachel in der
// Hauptnavigation (siehe components/admin/artikel/ArticleAdminPanel.tsx, app/page.tsx).
// Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.
export function AdminPanel({
  isAdmin, isSuperAdmin, employees, onAddEmployee, onDeleteEmployee, onUpdateEmployeeProfileId, modulePermissions, onUpdateModulePermissions,
  firmenfahrzeuge, onFirmenfahrzeugAnlegen, onFirmenfahrzeugAendern, onFirmenfahrzeugAusmustern,
  onKundeOeffnen,
}: {
  isAdmin: boolean; isSuperAdmin: boolean; employees: Employee[];
  // Aus der Adressprüfung heraus das Kundenfenster öffnen (Wartung). Der Admin-Bereich ist
  // ein Reiter, kein Fenster – das Kundenfenster legt sich darüber und lässt die Liste stehen.
  onKundeOeffnen: (kundenId: string) => void;
  firmenfahrzeuge: Firmenfahrzeug[];
  onFirmenfahrzeugAnlegen: (felder: FirmenfahrzeugFelder) => Promise<string | null>;
  onFirmenfahrzeugAendern: (id: string, felder: FirmenfahrzeugFelder) => Promise<string | null>;
  onFirmenfahrzeugAusmustern: (id: string, aktiv: boolean) => Promise<void>;
  onAddEmployee: (name: string) => Promise<void>;
  onDeleteEmployee: (id: string) => Promise<void>;
  onUpdateEmployeeProfileId: (employeeId: string, profileId: string | null) => Promise<void>;
  modulePermissions: Record<string, Bereichsrechte>;
  onUpdateModulePermissions: (bereich: string, verb: Verb, rollen: string[], bestand: Bereichsrechte) => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [ownUserId, setOwnUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [status, setStatus] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("user");
  const [sending, setSending] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [adminTab, setAdminTab] = useState<"users" | "modules" | "wartung" | "protokoll" | "betrieb">("users");
  // Betriebseinstellungen (Migration 38/48): gelten für alle, nicht je Nutzer.
  // Die ganze Zeile und nicht nur das Intervall – seit Migration 48 steht der Briefkopf mit
  // darin, und ein zweiter Ladevorgang für dieselbe eine Zeile wäre eine Abfrage zu viel.
  const [betrieb, setBetrieb] = useState<Betrieb | null>(null);
  const terminIntervall = betrieb?.termin_intervall_min ?? null;
  const [intervallStand, setIntervallStand] = useState<"bereit" | "speichert" | "gespeichert">("bereit");
  // Das Protokoll (Migration 36). Es lädt erst, wenn der Reiter geöffnet wird – die Tabelle
  // ist die einzige im System, die nie kleiner wird, und niemand braucht sie beim bloßen
  // Öffnen des Adminbereichs.
  const [protokoll, setProtokoll] = useState<AuditEintrag[]>([]);
  const [protokollLaedt, setProtokollLaedt] = useState(false);
  const [protokollVon, setProtokollVon] = useState(() => tageZurueck(PROTOKOLL_TAGE_STANDARD));
  // Kennung → E-Mail. Getrennt geladen und NICHT bei jedem Datumswechsel neu: Die Liste der
  // Zugänge ändert sich fast nie, die Auswahl des Zeitraums dauernd.
  const [protokollPersonen, setProtokollPersonen] = useState<ProtokollPerson[]>([]);
  // Kennung → Klartext. Wie die Personenliste einmalig beim Öffnen des Reiters geladen und
  // NICHT bei jedem Datumswechsel: Die Namen ändern sich fast nie, der Zeitraum dauernd.
  const [protokollNamen, setProtokollNamen] = useState<Namensverzeichnis>(new Map());
  // Zähler, der die Korrekturliste neu aufbaut. Sie lädt ihre Kunden beim Einhängen einmal;
  // nach einem Sammellauf oder mehreren Übernahmen ist die Liste veraltet, und ein Zähler als
  // `key` ist der ehrlichste Weg, sie von vorn beginnen zu lassen.
  const [wartungStand, setWartungStand] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setOwnUserId(user?.id || null);
      // Nur der Superadmin darf laut RLS (public.profiles) alle Profile lesen (siehe Migration
      // 05) – deshalb bleibt auch das Verknüpfen eines Mitarbeiters mit einem Account (weiter
      // unten) auf Superadmin beschränkt, ein einfacher Admin sähe hier sonst nur sein eigenes
      // Profil zur Auswahl.
      if (isSuperAdmin) await refreshProfiles();
      else setLoadingList(false);
    })();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (adminTab !== "betrieb" || betrieb !== null) return;
    let abgebrochen = false;
    fetchBetrieb(supabase).then((b) => {
      if (!abgebrochen && b) setBetrieb(b);
    });
    return () => { abgebrochen = true; };
  }, [adminTab, betrieb, supabase]);

  async function intervallSpeichern(minuten: number) {
    setBetrieb((b) => (b ? { ...b, termin_intervall_min: minuten } : b));
    setIntervallStand("speichert");
    try {
      await setzeTerminIntervall(supabase, minuten);
      setIntervallStand("gespeichert");
      setTimeout(() => setIntervallStand("bereit"), 2500);
    } catch (e) {
      setIntervallStand("bereit");
      throw e;
    }
  }

  // Der Briefkopf. Nach dem Speichern wird der Stand im Fenster nachgezogen und NICHT neu
  // geladen: Was gespeichert wurde, ist bekannt – eine zweite Abfrage würde nur den Fall
  // verdecken, dass die Datenbank etwas anderes behalten hat als geschickt wurde.
  async function betriebsdatenSpeichern(felder: BetriebFelder) {
    await speichereBetrieb(supabase, felder);
    setBetrieb((b) => (b ? { ...b, ...felder } : b));
  }

  async function nummernkreisSetzen(nummer: number) {
    await setzeNaechsteRechnungsnummer(supabase, nummer);
    setBetrieb((b) => (b ? { ...b, rechnung_naechste_nummer: nummer } : b));
  }

  useEffect(() => {
    if (adminTab !== "protokoll" || protokollPersonen.length > 0) return;
    let abgebrochen = false;
    fetchProtokollPersonen(supabase).then((p) => { if (!abgebrochen) setProtokollPersonen(p); });
    return () => { abgebrochen = true; };
  }, [adminTab, protokollPersonen.length, supabase]);

  useEffect(() => {
    if (adminTab !== "protokoll" || protokollNamen.size > 0) return;
    let abgebrochen = false;
    fetchNamensverzeichnis(supabase).then((n) => { if (!abgebrochen) setProtokollNamen(n); });
    return () => { abgebrochen = true; };
  }, [adminTab, protokollNamen.size, supabase]);

  useEffect(() => {
    if (adminTab !== "protokoll") return;
    let abgebrochen = false;
    setProtokollLaedt(true);
    fetchProtokoll(supabase, { vonDatum: protokollVon })
      .then((zeilen) => { if (!abgebrochen) setProtokoll(zeilen); })
      .finally(() => { if (!abgebrochen) setProtokollLaedt(false); });
    return () => { abgebrochen = true; };
  }, [adminTab, protokollVon, supabase]);

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
    if (isSuperAdmin) await refreshProfiles();
  }

  if (!isAdmin) {
    return (
      <div className="tabpanel active">
        <div className="empty">Diese Seite ist nur für Admin und Superadmin.</div>
      </div>
    );
  }

  return (
    <div className="tabpanel active">
      <div className="module-page">
        <div className="module-header">
          <div className="mh-icon"><IconAdmin /></div>
          <div className="mh-text">
            <h2>Admin</h2>
            <p>Nutzerverwaltung, Modulverwaltung und Wartung.</p>
          </div>
        </div>

        <div className="filterbar" style={{ marginBottom: 4 }}>
          <button type="button" className={`chip ${adminTab === "users" ? "active" : ""}`} onClick={() => setAdminTab("users")}>Nutzerverwaltung</button>
          {isSuperAdmin && (
            <button type="button" className={`chip ${adminTab === "modules" ? "active" : ""}`} onClick={() => setAdminTab("modules")}>Modulverwaltung</button>
          )}
          <button type="button" className={`chip ${adminTab === "wartung" ? "active" : ""}`} onClick={() => setAdminTab("wartung")}>Wartung</button>
          <button type="button" className={`chip ${adminTab === "protokoll" ? "active" : ""}`} onClick={() => setAdminTab("protokoll")}>Protokoll</button>
          <button type="button" className={`chip ${adminTab === "betrieb" ? "active" : ""}`} onClick={() => setAdminTab("betrieb")}>Betrieb</button>
        </div>

        {adminTab === "betrieb" ? (
          <>
          {/* Der Briefkopf steht ZUERST: Er ist die Voraussetzung dafür, dass überhaupt eine
              Rechnung ausgestellt werden kann, und wird beim Einrichten gesucht. Das
              Terminraster darunter ist eine Einstellung, die man einmal setzt und vergisst. */}
          {betrieb && (
            <BetriebsdatenPanel
              betrieb={betrieb}
              onSpeichern={betriebsdatenSpeichern}
              onNummernkreis={nummernkreisSetzen}
            />
          )}
          <div className="admin-card">
            <h4 style={{ margin: 0 }}>Terminraster</h4>
            <p className="small" style={{ marginTop: 2 }}>
              In welchen Schritten die Terminlänge vorgeschlagen wird. Trägt jemand eine
              Anfangszeit ein, steht das Ende sofort da – um genau diese Spanne später. Dieselbe
              Zahl gilt im Kalender für Termine, bei denen niemand ein Ende gepflegt hat.
            </p>
            <p className="small" style={{ color: "var(--muted)" }}>
              Gilt für alle: Hätte jeder seinen eigenen Wert, hinge die Dauer eines Termins
              davon ab, wer ihn angelegt hat. Bereits gespeicherte Endzeiten ändern sich nicht.
            </p>
            {terminIntervall === null ? (
              <div className="small">Lädt …</div>
            ) : (
              <>
                <div className="filterbar" style={{ marginTop: 6 }}>
                  {TERMIN_INTERVALLE.map((m) => (
                    <button
                      key={m} type="button"
                      className={`chip ${terminIntervall === m ? "active" : ""}`}
                      onClick={() => { void intervallSpeichern(m); }}
                    >
                      {/* Deutsches Komma: `${m / 60}` liefert „1.5 Std." */}
                      {m < 60 ? `${m} Min.` : `${(m / 60).toLocaleString("de-DE")} Std.`}
                    </button>
                  ))}
                </div>
                <div className="small" style={{ marginTop: 6, color: intervallStand === "gespeichert" ? "var(--green)" : "var(--muted)" }}>
                  {intervallStand === "speichert" ? "Speichert …"
                    : intervallStand === "gespeichert" ? "Gespeichert ✓"
                    : `Ein Termin um 08:00 endet standardmäßig um ${String(Math.floor((8 * 60 + terminIntervall) / 60)).padStart(2, "0")}:${String((8 * 60 + terminIntervall) % 60).padStart(2, "0")}.`}
                </div>
              </>
            )}
          </div>
          </>
        ) : adminTab === "protokoll" ? (
          <ProtokollPanel
            eintraege={protokoll}
            personen={protokollPersonen}
            namen={protokollNamen}
            laedt={protokollLaedt}
            vonDatum={protokollVon}
            onVonDatum={setProtokollVon}
          />
        ) : adminTab === "wartung" ? (
          /* Wartung sammelt Läufe, die über den ganzen Bestand gehen und deshalb nirgends in
             den Fachmodulen hingehören.

             Die Reihenfolge ist die Arbeitsreihenfolge: erst der Sammellauf, der alles
             verortet, was sich ohne Zutun verorten lässt – danach die Korrekturliste für den
             Rest. Andersherum arbeitete man Adressen von Hand durch, die der Sammellauf eine
             Minute später ohnehin gefunden hätte. `wartungStand` zwingt die Korrekturliste
             nach einer Übernahme zum Neuaufbau, sonst stünden dort erledigte Zeilen weiter. */
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <GeokodierLauf supabase={supabase} />
            <AdressenPruefen key={wartungStand} supabase={supabase} onFertig={() => undefined} onKundeOeffnen={onKundeOeffnen} />
            <button type="button" className="btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => setWartungStand((n) => n + 1)}>
              Liste neu aufbauen
            </button>
          </div>
        ) : adminTab === "modules" && isSuperAdmin ? (
          <PermissionMatrix modulePermissions={modulePermissions} onUpdateModulePermissions={onUpdateModulePermissions} />
        ) : (
        <>
        {status && (
          <div className={status.type === "ok" ? "login-info" : "login-error"}>{status.text}</div>
        )}

        <h4 style={{ margin: "4px 0 0" }}>Neuen Nutzer einladen</h4>
        <form onSubmit={sendInvite} style={{ maxWidth: 420 }}>
          <div className="row">
            <div className="field" style={{ flex: 2 }}>
              <label>E-Mail-Adresse</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kollege@firma.de" required />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Rolle</label>
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
                <option value="user">Nutzer</option>
                <option value="techniker">Techniker</option>
                <option value="admin">Admin</option>
                {isSuperAdmin && <option value="superadmin">Superadmin</option>}
              </select>
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={sending}>
            {sending ? "Sende Einladung…" : "Einladung senden"}
          </button>
        </form>

        {isSuperAdmin && (
          <>
            <hr />
            <h4 style={{ margin: 0 }}>Alle Nutzer</h4>
            {loadingList ? (
              <div className="small">Lädt…</div>
            ) : profiles.length === 0 ? (
              <div className="empty">Keine Nutzer gefunden.</div>
            ) : (
              <table className="appt-table" style={{ maxWidth: 560 }}>
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
          </>
        )}

        <hr />
        {/* Die eigenen Transporter (Migration 32). Sie stehen bei den Mitarbeitern und nicht
            im Lager-Modul: Beides sind Stammdaten, die die Einsatzplanung braucht – wer fährt,
            und womit. */}
        <FirmenfahrzeugPanel
          fahrzeuge={firmenfahrzeuge}
          onAnlegen={onFirmenfahrzeugAnlegen}
          onAendern={onFirmenfahrzeugAendern}
          onAusmustern={onFirmenfahrzeugAusmustern}
        />

        <hr />
        <h4 style={{ margin: 0 }}>Mitarbeiter (Einsatzplanung)</h4>
        <div className="small" style={{ marginBottom: 4 }}>
          Für die Zuordnung von Aufträgen – muss kein eingeladener Account sein, auch Namen ohne
          eigenen Login können hier hinterlegt werden.
        </div>
        <div className="row" style={{ maxWidth: 420 }}>
          <input
            type="text"
            placeholder="Name des Mitarbeiters"
            value={newEmployeeName}
            onChange={(e) => setNewEmployeeName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newEmployeeName.trim()) { onAddEmployee(newEmployeeName.trim()); setNewEmployeeName(""); } }}
          />
          <button
            className="btn-primary"
            style={{ flex: "0 0 auto" }}
            onClick={() => { if (!newEmployeeName.trim()) return; onAddEmployee(newEmployeeName.trim()); setNewEmployeeName(""); }}
          >
            + Mitarbeiter
          </button>
        </div>
        {isSuperAdmin && (
          <div className="small" style={{ marginBottom: 4 }}>
            Mit einem Login-Account verknüpfte Mitarbeiter sehen als Techniker-Rolle nur noch
            ihre eigenen zugeordneten Aufträge (Phase 4, siehe <code>docs/roadmap.md</code>).
          </div>
        )}
        {employees.length === 0 ? (
          <div className="empty">Noch keine Mitarbeiter angelegt.</div>
        ) : (
          <table className="appt-table" style={{ maxWidth: 620 }}>
            <thead><tr><th>Name</th>{isSuperAdmin && <th>Verknüpfter Account</th>}<th></th></tr></thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td>{emp.name}</td>
                  {isSuperAdmin && (
                    <td>
                      <select
                        value={emp.profile_id || ""}
                        onChange={(e) => onUpdateEmployeeProfileId(emp.id, e.target.value || null)}
                        className="feld-kompakt"
                      >
                        <option value="">– kein Account –</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>{p.email || p.id} ({ROLE_LABEL[p.role]})</option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "1px 5px" }}
                      onClick={() => { if (confirm(`Mitarbeiter "${emp.name}" wirklich löschen? Zuordnungen auf Aufträgen werden entfernt.`)) onDeleteEmployee(emp.id); }}
                    >
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        </>
        )}
      </div>
    </div>
  );
}
