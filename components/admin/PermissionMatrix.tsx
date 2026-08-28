import { useState } from "react";
import type { Role } from "@/lib/types";
import { ROLE_LABEL, PERMISSION_CATALOG, PERMISSION_DEFAULTS, PERMISSION_ROLES, type PermItem } from "@/lib/constants";

// Modulverwaltung: eine Matrix, oben die Rollen als Spalten, links die Module (mit eingerückten
// Modulbestandteilen als eigene Zeilen darunter), pro Zelle eine Checkbox. "locked"-Zeilen (z. B.
// Dashboard) sind für alle Rollen fest sichtbar und nicht abwählbar. Superadmin ist implizit immer
// erlaubt und deshalb keine eigene Spalte. Jede Zeile speichert für sich (Checkbox-Klick = sofort
// speichern), damit man nicht versehentlich halb ausgefüllte Formulare verliert. Ausgelagert aus
// app/page.tsx, siehe docs/roadmap.md Phase 2.
export function PermissionMatrix({ modulePermissions, onUpdateModulePermissions }: {
  modulePermissions: Record<string, string[]>;
  onUpdateModulePermissions: (moduleKey: string, roles: string[]) => Promise<void>;
}) {
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function toggle(item: PermItem, role: Role) {
    if (item.locked) return;
    const current = modulePermissions[item.key] ?? PERMISSION_DEFAULTS[item.key] ?? [];
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
    setSavingKey(item.key);
    await onUpdateModulePermissions(item.key, next);
    setSavingKey(null);
  }

  return (
    <div>
      <div className="small" style={{ marginBottom: 8 }}>
        Wer sieht welches Modul, und wer darf welche Aktion innerhalb eines Moduls ausführen?
        Eingerückte Zeilen sind Teilbereiche des Moduls darüber. Superadmin darf hier immer alles,
        unabhängig von dieser Tabelle, und wird deshalb nicht extra aufgeführt.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="appt-table" style={{ minWidth: 480 }}>
          <thead>
            <tr>
              <th>Modul / Aktion</th>
              {PERMISSION_ROLES.map((role) => <th key={role} style={{ textAlign: "center" }}>{ROLE_LABEL[role]}</th>)}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_CATALOG.map((item) => {
              const current = modulePermissions[item.key] ?? PERMISSION_DEFAULTS[item.key] ?? [];
              return (
                <tr key={item.key}>
                  <td style={item.indent ? { paddingLeft: 22, color: "var(--muted, #667)", fontSize: 12.5 } : { fontWeight: 700 }}>
                    {item.label}
                  </td>
                  {PERMISSION_ROLES.map((role) => (
                    <td key={role} style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={item.locked ? true : current.includes(role)}
                        disabled={item.locked || savingKey === item.key}
                        onChange={() => toggle(item, role)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
