import type { CapabilityPermission } from "../../lib/capabilities/types";

export function CapabilityPermissions({
  items,
}: {
  items?: CapabilityPermission[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <section>
      <h3>Permissions</h3>
      <ul className="cap-perms">
        {items.map((permission) => (
          <li key={permission.id}>
            <strong>{permission.group}</strong>
            <span>{permission.allowed ? "Allowed" : "Blocked"} · {permission.action}{permission.scopeLabel ? ` · ${permission.scopeLabel}` : ""}</span>
            {permission.explanation && <em>{permission.explanation}</em>}
          </li>
        ))}
      </ul>
    </section>
  );
}
