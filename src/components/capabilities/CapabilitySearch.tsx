import { Search } from "lucide-react";

export function CapabilitySearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="cap-search">
      <Search size={13} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search capabilities..."
        aria-label="Search capabilities"
      />
    </label>
  );
}
