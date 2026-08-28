// Kalender-Hilfsfunktionen für die Einsatzplanung (Montag als Wochenstart,
// ISO-Kalenderwochen, Mitarbeiterfarbe). Reine Funktionen ohne React/Supabase-Abhängigkeit,
// ausgelagert aus app/page.tsx – siehe docs/roadmap.md Phase 2.
import type { Employee } from "./types";
import { EMP_COLORS } from "./constants";

export function employeeColorFor(employees: Employee[], employeeId: string): string {
  const idx = employees.findIndex((e) => e.id === employeeId);
  return EMP_COLORS[(idx < 0 ? 0 : idx) % EMP_COLORS.length];
}

export function startOfWeekMonday(d: Date): Date {
  const nd = new Date(d);
  const day = (nd.getDay() + 6) % 7; // Montag = 0 … Sonntag = 6
  nd.setDate(nd.getDate() - day);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

export function addDays(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
