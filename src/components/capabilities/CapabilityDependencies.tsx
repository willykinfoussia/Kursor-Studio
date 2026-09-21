import type { CapabilityDependency } from "../../lib/capabilities/types";
import { openCapability } from "../../lib/workflow/navigation";

export function CapabilityDependencies({
  items,
}: {
  items?: CapabilityDependency[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <section>
      <h3>Dependencies</h3>
      <ul className="cap-tree">
        {items.map((item, index) => (
          <li key={item.capabilityId}>
            {index === items.length - 1 ? "└── " : "├── "}
            <button type="button" className="cap-link" onClick={() => openCapability(item.capabilityId)}>
              {item.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
