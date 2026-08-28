// Ein Eintrag in #iconNav (Desktop-Seitenleiste / Mobil-Bottom-Bar) – ausgelagert aus
// app/page.tsx, siehe docs/roadmap.md Phase 2.
export function NavItem({ active, onClick, icon, label, className }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; className?: string;
}) {
  return (
    <div className={`icon-nav-item ${active ? "active" : ""} ${className || ""}`} onClick={onClick}>
      <span className="ic">{icon}</span><span>{label}</span>
    </div>
  );
}
