import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, SelectHTMLAttributes } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  size?: number;
}

export function IconButton({ icon: Icon, label, size = 15, className, ...props }: IconButtonProps) {
  return (
    <button className={["icon-btn", className].filter(Boolean).join(" ")} type="button" title={label} aria-label={label} {...props}>
      <Icon size={size} strokeWidth={1.7} />
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      <span className="toggle-knob" />
    </button>
  );
}

export function SelectControl(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="select-control" {...props} />;
}

export function ProgressBar({ value }: { value: number }) {
  return <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}
