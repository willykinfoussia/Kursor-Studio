import type { SuiteItem } from "../../lib/agent/verification";
import { VerificationCheckRow } from "./VerificationCheckRow";

export function VerificationSuite({
  items,
  selectedId,
  running,
  onSelect,
  onRun,
  onEdit,
  onDisable,
  onDelete,
}: {
  items: SuiteItem[];
  selectedId: string | null;
  running: boolean;
  onSelect: (id: string) => void;
  onRun: (item: SuiteItem) => void;
  onEdit: (item: SuiteItem) => void;
  onDisable: (item: SuiteItem) => void;
  onDelete: (item: SuiteItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="verify-empty">
        <h3>No verification configured</h3>
        <p>Kursor hasn&apos;t found a project verification suite yet.</p>
      </div>
    );
  }
  return (
    <section className="verify-suite" aria-label="Verification suite">
      <h2>Verification suite</h2>
      <ul className="verify-suite-list">
        {items.map((item) => (
          <VerificationCheckRow
            key={item.id}
            item={item}
            selected={selectedId === item.id}
            running={running}
            onSelect={() => onSelect(item.id)}
            onRun={() => onRun(item)}
            onEdit={() => onEdit(item)}
            onDisable={() => onDisable(item)}
            onDelete={() => onDelete(item)}
          />
        ))}
      </ul>
    </section>
  );
}
