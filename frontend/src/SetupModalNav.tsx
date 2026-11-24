export const SETUP_SECTIONS = [
  { id: "plex", label: "Plex" },
  { id: "sonos", label: "Sonos" },
  { id: "amps", label: "Amps" },
  { id: "plexamp", label: "Players" },
  { id: "webhooks", label: "Webhooks" },
] as const;

export type SetupSectionId = (typeof SETUP_SECTIONS)[number]["id"];

type Props = {
  activeSection: SetupSectionId;
  onSectionChange: (section: SetupSectionId) => void;
  disabled?: boolean;
};

export function SetupModalNav({ activeSection, onSectionChange, disabled = false }: Props) {
  return (
    <nav className="setupModalNav" aria-label="Setup sections">
      {SETUP_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className={`setupModalNavItem${activeSection === section.id ? " isActive" : ""}`}
          aria-current={activeSection === section.id ? "page" : undefined}
          disabled={disabled}
          onClick={() => onSectionChange(section.id)}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}
