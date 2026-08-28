// Nav-/UI-Icons als saubere Linien-SVGs (siehe docs/design-system.md) – ausgelagert aus
// app/page.tsx als erster Schritt von docs/roadmap.md Phase 2 (Aufteilen des Monolithen in
// eigene Dateien). Reine, zustandslose Komponenten ohne Abhängigkeit zu HomePage-State,
// deshalb risikolos verschiebbar.

import { useId } from "react";

export function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4 19h16" strokeLinecap="round" />
      <path d="M6 19v-8M12 19V6M18 19v-5" strokeLinecap="round" />
    </svg>
  );
}
export function IconKunden() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M4 10h16M10 4v16" />
    </svg>
  );
}
export function IconTermine() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="4" y="5" width="16" height="15" rx="4" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </svg>
  );
}
export function IconModule() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </svg>
  );
}
export function IconNeu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
export function IconInaktiv() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="8" />
      <path d="M8 8l8 8" />
    </svg>
  );
}
export function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.7 7.7 0 0 0 0-2l2-1.5-2-3.4-2.4 1a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.3 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.7 7.7 0 0 0 1.7 1L11 21h4l.3-2.6a7.7 7.7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5Z" />
    </svg>
  );
}
export function IconAdmin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3Z" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function IconMap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" strokeLinejoin="round" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

export function IconLager() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M3 9 12 3l9 6v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" strokeLinejoin="round" />
    </svg>
  );
}
export function IconAuftraege() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M7 3h10a1 1 0 0 1 1 1v16l-3-2-2 2-2-2-2 2-3-2V4a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}
export function IconBack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M14 5 7 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function IconMore() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="5" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="19" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}
export function IconEinsatzplanung() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="3" y="4.5" width="18" height="16" rx="2" strokeLinejoin="round" />
      <path d="M3 9.5h18M8 3v3M16 3v3" strokeLinecap="round" />
      <circle cx="8" cy="14" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="16" cy="14" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function IconArtikel() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M11 3H5a1 1 0 0 0-1 1v6l10 10 7-7L11 3Z" strokeLinejoin="round" />
      <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
// Navigations-Button (Auftrag/Termin): bewusst der farbige "Standort-Pin" statt eines
// dünnen Linien-Icons wie die übrigen Icons hier – ersetzt das vorher genutzte Kompass-Emoji
// (siehe docs/design-system.md), weil er in der kleinen runden Schaltfläche sofort als
// "Navigation/Karte" erkennbar bleibt, ohne sich je nach Betriebssystem/Schriftart anders
// darzustellen wie ein Emoji das tut. useId() macht die clipPath-ID pro Instanz eindeutig,
// falls mehrere Navigations-Buttons gleichzeitig auf der Seite stehen (z. B. Tabellenzeilen).
export function IconNavPin() {
  const clipId = useId();
  return (
    <svg viewBox="0 0 24 24">
      <clipPath id={clipId}>
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect x="4" y="1" width="8" height="11" fill="#EA4335" />
        <rect x="12" y="1" width="8" height="11" fill="#4285F4" />
        <rect x="4" y="12" width="8" height="11" fill="#FBBC05" />
        <rect x="12" y="12" width="8" height="11" fill="#34A853" />
      </g>
      <circle cx="12" cy="9" r="3.1" fill="#fff" />
    </svg>
  );
}
export function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
