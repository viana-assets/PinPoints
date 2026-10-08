// Ein Eintrag in #iconNav (Desktop-Seitenleiste / Mobil-Bottom-Bar) – ausgelagert aus
// app/page.tsx, siehe docs/roadmap.md Phase 2.
// `zusatz`: ein kleines Abzeichen hinter der Beschriftung – seit v131 die laufende Stempeluhr
// neben „Zeiterfassung“.
export function NavItem({ active, onClick, icon, label, className, zusatz }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; className?: string; zusatz?: React.ReactNode;
}) {
  return (
    <div className={`icon-nav-item ${active ? "active" : ""} ${className || ""}`} onClick={onClick}>
      <span className="ic">{icon}</span><span>{label}</span>{zusatz}
    </div>
  );
}
