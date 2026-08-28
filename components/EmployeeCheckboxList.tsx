import type { Employee } from "@/lib/types";

// Mehrfachauswahl von Mitarbeitern als Chips (Kompaktversion des Rollen-Chip-Musters aus der
// alten Modul-Berechtigungen-UI) – wird an mehreren Stellen für Auftrags-Mitarbeiter gebraucht,
// weil ein Auftrag mehreren Mitarbeitern zugeordnet werden kann. Ausgelagert aus app/page.tsx,
// siehe docs/roadmap.md Phase 2.
export function EmployeeCheckboxList({ employees, value, onChange }: {
  employees: Employee[]; value: string[]; onChange: (ids: string[]) => void;
}) {
  if (employees.length === 0) return <div className="small">Noch keine Mitarbeiter angelegt.</div>;
  return (
    <div className="filterbar">
      {employees.map((emp) => (
        <button
          key={emp.id}
          type="button"
          className={`chip ${value.includes(emp.id) ? "active" : ""}`}
          onClick={() => onChange(value.includes(emp.id) ? value.filter((id) => id !== emp.id) : [...value, emp.id])}
        >
          {emp.name}
        </button>
      ))}
    </div>
  );
}
