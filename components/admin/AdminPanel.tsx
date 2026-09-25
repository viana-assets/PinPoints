import { useEffect, useMemo, useState } from "react";
import type { Betrieb, BetriebFelder, Employee, Firmenfahrzeug, Profile, Role } from "@/lib/types";
import type { Bereichsrechte } from "@/lib/api/permissions";
import type { Verb } from "@/lib/constants";
import type { FirmenfahrzeugFelder } from "@/lib/api/firmenfahrzeuge";
import { createClient } from "@/lib/supabaseClient";
import { ROLE_LABEL } from "@/lib/constants";
import { employeeColorFor } from "@/lib/calendar";
import { PermissionMatrix } from "./PermissionMatrix";
import { ProtokollPanel, tageZurueck } from "./ProtokollPanel";
import { fetchProtokoll, fetchProtokollPersonen } from "@/lib/api/audit";
import { fetchNamensverzeichnis, type Namensverzeichnis } from "@/lib/api/protokoll";
import type { AuditEintrag, ProtokollPerson } from "@/lib/types";
import { PROTOKOLL_TAGE_STANDARD, TERMIN_INTERVALLE } from "@/lib/constants";
import { fetchBetrieb, setzeTerminIntervall, speichereBetrieb, setzeNaechsteRechnungsnummer } from "@/lib/api/betrieb";
import { BetriebsdatenPanel } from "./BetriebsdatenPanel";
import { PapierkorbPanel } from "./PapierkorbPanel";
import { hoechsteRechnungsnummer } from "@/lib/api/rechnungen";
import { GeokodierLauf } from "./GeokodierLauf";
import { AdressenPruefen } from "./AdressenPruefen";
import { FirmenfahrzeugPanel } from "./FirmenfahrzeugPanel";

// Admin-Modul: Nutzerverwaltung – als eigener Tab statt separater Seite, damit man wie bei
// Termine einfach das Fenster wechselt statt zu navigieren. Bündelt zusätzlich die
// Modulverwaltung (PermissionMatrix) als Unter-Tab. Die Artikel-Übersicht war früher hier als
// dritter Unter-Tab eingebunden, ist aber seit Phase 4 eine eigene Kachel in der
// Hauptnavigation (siehe components/admin/artikel/ArticleAdminPanel.tsx, app/page.tsx).
// Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.
type AdminReiter = "nutzer" | "mitarbeiter" | "transporter" | "rechte" | "betrieb" | "wartung" | "protokoll" | "papierkorb";
const ADMIN_REITER: { key: AdminReiter; label: string; nurSuperadmin?: boolean }[] = [
  { key: "nutzer", label: "Nutzer" },
  { key: "mitarbeiter", label: "Mitarbeiter" },
  { key: "transporter", label: "Transporter" },
  { key: "rechte", label: "Rechte", nurSuperadmin: true },
  { key: "betrieb", label: "Betrieb" },
  { key: "wartung", label: "Wartung" },
  { key: "protokoll", label: "Protokoll" },
  { key: "papierkorb", label: "Papierkorb" },
];

// Farbe des Kreises je Rolle – dieselben Töne wie die Rollen-Pille daneben.
const ROLLEN_KLASSE: Record<Role, string> = { superadmin: "navy", admin: "blau", techniker: "orange", user: "gruen" };

function initialen(text: string): string {
  const teile = text.split(/[\s@._-]+/).filter(Boolean);
  return (teile.slice(0, 2).map((t) => t[0]).join("") || "?").toUpperCase();
}

export function AdminPanel({
  isAdmin, isSuperAdmin, employees, onAddEmployee, onDeleteEmployee, onUpdateEmployeeProfileId, modulePermissions, onUpdateModulePermissions,
  firmenfahrzeuge, onFirmenfahrzeugAnlegen, onFirmenfahrzeugAendern, onFirmenfahrzeugAusmustern,
  onKundeOeffnen, onKundenbestandGeaendert,
}: {
  // Nach dem Wiederherstellen aus dem Papierkorb (Migration 56): Kundenliste neu laden.
  onKundenbestandGeaendert: () => void;
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
  // Die Reiter seit 26.09.2026 (Entwurf U): Nutzer, Mitarbeiter und Transporter getrennt statt
  // untereinander auf einer Seite, die Rechte (nur Superadmin) als eigener Reiter.
  const [adminTab, setAdminTab] = useState<AdminReiter>("nutzer");
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

  // Die höchste vergebene Rechnungsnummer – für die Prüfung des Nummernkreises (Fahrplan D7).
  // Bei jedem Öffnen des Reiters neu gelesen: Zwischendurch kann jemand eine Rechnung
  // ausgestellt haben, und ein alter Wert hieße hier eine falsche Freigabe.
  const [hoechsteVergebene, setHoechsteVergebene] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (adminTab !== "betrieb") return;
    let abgebrochen = false;
    hoechsteRechnungsnummer(supabase)
      .then((n) => { if (!abgebrochen) setHoechsteVergebene(n); })
      // Ohne Leserecht auf die Rechnungen bleibt die Prüfung hier aus – die Datenbank prüft
      // trotzdem. „undefined" hält den Knopf dann gesperrt, statt ungeprüft freizugeben.
      .catch(() => { if (!abgebrochen) setHoechsteVergebene(undefined); });
    return () => { abgebrochen = true; };
  }, [adminTab, supabase]);

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

  const intervallText = (m: number) => (m < 60 ? `${m} Min.` : `${(m / 60).toLocaleString("de-DE")} Std.`);
  const endeUm = (m: number) => `${String(Math.floor((8 * 60 + m) / 60)).padStart(2, "0")}:${String((8 * 60 + m) % 60).padStart(2, "0")}`;
  const terminrasterInhalt = (
    <>
      <span className="small">
        In welchen Schritten die Terminlänge vorgeschlagen wird. Trägt jemand eine Anfangszeit ein,
        steht das Ende sofort da – um genau diese Spanne später. Dieselbe Zahl gilt im Kalender für
        Termine, bei denen niemand ein Ende gepflegt hat.
      </span>
      <span className="small">
        Gilt für alle: Hätte jeder seinen eigenen Wert, hinge die Dauer eines Termins davon ab, wer
        ihn angelegt hat. Bereits gespeicherte Endzeiten ändern sich nicht. Wirkt sofort.
      </span>
      {terminIntervall === null ? (
        <div className="small">Lädt …</div>
      ) : (
        <>
          <div className="pl-filter ad-raster" role="group" aria-label="Terminraster">
            {TERMIN_INTERVALLE.map((m) => (
              <button
                key={m} type="button"
                className={"pl-pille" + (terminIntervall === m ? " aktiv" : "")}
                aria-pressed={terminIntervall === m}
                onClick={() => { void intervallSpeichern(m); }}
              >
                {/* Deutsches Komma: `${m / 60}` liefert „1.5 Std." */}
                {intervallText(m)}
              </button>
            ))}
          </div>
          <div className={"small" + (intervallStand === "gespeichert" ? " ad-ok" : "")}>
            {intervallStand === "speichert" ? "Speichert …"
              : intervallStand === "gespeichert" ? "Gespeichert ✓"
              : `Ein Termin um 08:00 endet standardmäßig um ${endeUm(terminIntervall)}.`}
          </div>
        </>
      )}
    </>
  );

  const reiter = ADMIN_REITER.filter((r) => !r.nurSuperadmin || isSuperAdmin);
  const aktiverReiter = reiter.some((r) => r.key === adminTab) ? adminTab : "nutzer";

  return (
    <div className="tabpanel active">
      <div className="module-page ad-seite">
        <div className="lg-leiste ad-leiste">
          <div className="lg-kopf">
            <div className="lg-titel">
              <h2>Admin</h2>
              <span className="lg-unter">Angemeldet als {isSuperAdmin ? ROLE_LABEL.superadmin : ROLE_LABEL.admin}</span>
            </div>
          </div>
          <div className="ad-reiter" role="tablist" aria-label="Admin-Bereich">
            {reiter.map((r) => (
              <button
                key={r.key} type="button" role="tab" aria-selected={aktiverReiter === r.key}
                className={aktiverReiter === r.key ? "aktiv" : ""}
                onClick={() => setAdminTab(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {aktiverReiter === "betrieb" ? (
          /* Der Briefkopf steht ZUERST: Er ist die Voraussetzung dafür, dass überhaupt eine
             Rechnung ausgestellt werden kann, und wird beim Einrichten gesucht. Das
             Terminraster ist eine Einstellung, die man einmal setzt und vergisst. */
          betrieb ? (
            <BetriebsdatenPanel
              betrieb={betrieb}
              onSpeichern={betriebsdatenSpeichern}
              onNummernkreis={nummernkreisSetzen}
              hoechsteVergebene={hoechsteVergebene}
              terminrasterInfo={terminIntervall === null ? "Lädt …" : `${intervallText(terminIntervall)} · ein Termin um 08:00 endet um ${endeUm(terminIntervall)}`}
              terminraster={terminrasterInhalt}
            />
          ) : (
            <div className="db-karte"><div className="db-leer">Lädt …</div></div>
          )
        ) : aktiverReiter === "papierkorb" ? (
          <PapierkorbPanel supabase={supabase} isSuperAdmin={isSuperAdmin} onKundenbestandGeaendert={onKundenbestandGeaendert} />
        ) : aktiverReiter === "protokoll" ? (
          <ProtokollPanel
            eintraege={protokoll}
            personen={protokollPersonen}
            namen={protokollNamen}
            laedt={protokollLaedt}
            vonDatum={protokollVon}
            onVonDatum={setProtokollVon}
          />
        ) : aktiverReiter === "wartung" ? (
          /* Wartung sammelt Läufe, die über den ganzen Bestand gehen und deshalb nirgends in
             den Fachmodulen hingehören.

             Die Reihenfolge ist die Arbeitsreihenfolge: erst der Sammellauf, der alles
             verortet, was sich ohne Zutun verorten lässt – danach die Korrekturliste für den
             Rest. Andersherum arbeitete man Adressen von Hand durch, die der Sammellauf eine
             Minute später ohnehin gefunden hätte. `wartungStand` zwingt die Korrekturliste
             nach einer Übernahme zum Neuaufbau, sonst stünden dort erledigte Zeilen weiter. */
          <div className="ad-abschnitt">
            <div className="db-karte ad-wartung"><GeokodierLauf supabase={supabase} /></div>
            <div className="db-karte ad-wartung">
              <AdressenPruefen key={wartungStand} supabase={supabase} onFertig={() => undefined} onKundeOeffnen={onKundeOeffnen} />
              <button type="button" className="es-knopf ad-links" onClick={() => setWartungStand((n) => n + 1)}>
                Liste neu aufbauen
              </button>
            </div>
          </div>
        ) : aktiverReiter === "rechte" && isSuperAdmin ? (
          <PermissionMatrix modulePermissions={modulePermissions} onUpdateModulePermissions={onUpdateModulePermissions} />
        ) : aktiverReiter === "transporter" ? (
          /* Die eigenen Transporter (Migration 32). Stammdaten, die die Einsatzplanung braucht –
             wer fährt, und womit. */
          <FirmenfahrzeugPanel
            fahrzeuge={firmenfahrzeuge}
            onAnlegen={onFirmenfahrzeugAnlegen}
            onAendern={onFirmenfahrzeugAendern}
            onAusmustern={onFirmenfahrzeugAusmustern}
          />
        ) : aktiverReiter === "mitarbeiter" ? (
          <div className="ad-abschnitt">
            <div className="db-karte ad-aktion">
              <b className="ad-aktion-titel">Mitarbeiter anlegen</b>
              <span className="small">
                Für die Zuordnung von Aufträgen – muss kein eingeladener Account sein, auch Namen ohne
                eigenen Login können hier hinterlegt werden.
              </span>
              <div className="ad-aktion-zeile">
                <input
                  type="text"
                  placeholder="Name des Mitarbeiters"
                  aria-label="Name des Mitarbeiters"
                  value={newEmployeeName}
                  onChange={(e) => setNewEmployeeName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newEmployeeName.trim()) { onAddEmployee(newEmployeeName.trim()); setNewEmployeeName(""); } }}
                />
                <button
                  type="button"
                  className="am-mini ad-hoch"
                  disabled={!newEmployeeName.trim()}
                  onClick={() => { if (!newEmployeeName.trim()) return; onAddEmployee(newEmployeeName.trim()); setNewEmployeeName(""); }}
                >
                  + Mitarbeiter
                </button>
              </div>
            </div>
            <span className="small ad-hilfe">
              Die Farbe gilt überall – Kalender, Termine, Aufträge.
              {isSuperAdmin && " Mit einem Login-Account verknüpfte Mitarbeiter sehen als Techniker-Rolle nur ihre eigenen zugeordneten Aufträge."}
            </span>
            {employees.length === 0 ? (
              <div className="db-karte"><div className="db-leer">Noch keine Mitarbeiter angelegt.</div></div>
            ) : (
              employees.map((emp) => {
                const konto = profiles.find((p) => p.id === emp.profile_id);
                return (
                  <div key={emp.id} className="ad-karte">
                    <span className="ad-kreis" style={{ background: employeeColorFor(employees, emp.id) }}>{initialen(emp.name).slice(0, 1)}</span>
                    <span className="ad-karte-text">
                      <b>{emp.name}</b>
                      {isSuperAdmin ? (
                        <select
                          className="ad-verknuepfung"
                          aria-label={`Account von ${emp.name}`}
                          value={emp.profile_id || ""}
                          onChange={(e) => onUpdateEmployeeProfileId(emp.id, e.target.value || null)}
                        >
                          <option value="">kein Konto verknüpft</option>
                          {profiles.map((p) => (
                            <option key={p.id} value={p.id}>verknüpft mit {p.email || p.id} ({ROLE_LABEL[p.role]})</option>
                          ))}
                        </select>
                      ) : (
                        <span className="small">{emp.profile_id ? (konto?.email ? `verknüpft mit ${konto.email}` : "mit einem Konto verknüpft") : "kein Konto verknüpft"}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="db-link ad-gefahr-link"
                      onClick={() => { if (confirm(`Mitarbeiter "${emp.name}" wirklich löschen? Zuordnungen auf Aufträgen werden entfernt.`)) onDeleteEmployee(emp.id); }}
                    >
                      Löschen
                    </button>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="ad-abschnitt">
            {status && (
              <div className={status.type === "ok" ? "login-info" : "login-error"}>{status.text}</div>
            )}
            <form className="db-karte ad-aktion" onSubmit={sendInvite}>
              <b className="ad-aktion-titel">Nutzer einladen</b>
              <div className="ad-aktion-zeile">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-Mail-Adresse" aria-label="E-Mail-Adresse" required />
                <select className="ad-rollenwahl" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} aria-label="Rolle">
                  <option value="user">{ROLE_LABEL.user}</option>
                  <option value="techniker">{ROLE_LABEL.techniker}</option>
                  <option value="admin">{ROLE_LABEL.admin}</option>
                  {isSuperAdmin && <option value="superadmin">{ROLE_LABEL.superadmin}</option>}
                </select>
              </div>
              <button className="am-knopf" type="submit" disabled={sending}>
                {sending ? "Sende Einladung …" : "Einladung senden"}
              </button>
            </form>

            {isSuperAdmin ? (
              loadingList ? (
                <div className="db-karte"><div className="db-leer">Lädt …</div></div>
              ) : profiles.length === 0 ? (
                <div className="db-karte"><div className="db-leer">Keine Nutzer gefunden.</div></div>
              ) : (
                profiles.map((p) => {
                  const mitarbeiter = employees.find((e) => e.profile_id === p.id);
                  return (
                    <div key={p.id} className="ad-karte">
                      <span className={"ad-kreis " + ROLLEN_KLASSE[p.role]}>{initialen(p.email || "?")}</span>
                      <span className="ad-karte-text">
                        <b>{p.email || "–"}{p.id === ownUserId ? " (du)" : ""}</b>
                        <span className="small">{mitarbeiter ? `Mitarbeiter ${mitarbeiter.name}` : "kein Mitarbeiter verknüpft"}</span>
                      </span>
                      <select
                        className={"ad-rolle " + ROLLEN_KLASSE[p.role]}
                        value={p.role}
                        aria-label={`Rolle von ${p.email || "Nutzer"}`}
                        onChange={(e) => changeRole(p.id, e.target.value as Role)}
                      >
                        <option value="user">{ROLE_LABEL.user}</option>
                        <option value="techniker">{ROLE_LABEL.techniker}</option>
                        <option value="admin">{ROLE_LABEL.admin}</option>
                        <option value="superadmin">{ROLE_LABEL.superadmin}</option>
                      </select>
                    </div>
                  );
                })
              )
            ) : (
              <span className="small ad-hilfe">Die Liste aller Zugänge und das Ändern von Rollen sind dem Superadmin vorbehalten.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
