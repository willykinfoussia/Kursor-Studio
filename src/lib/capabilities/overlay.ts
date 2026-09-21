import { useSettingsStore } from "../../stores/settingsStore";

export function readDisabledCapabilityIds() {
  const ids = useSettingsStore.getState().disabledCapabilityIds;
  return Array.isArray(ids) ? ids : [];
}

export function sanitizeDisabledCapabilityIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || unique.includes(id)) continue;
    unique.push(id);
  }
  return unique;
}

export function withDisabledCapability(ids: readonly string[], id: string, disabled: boolean) {
  const next = ids.filter((item) => item !== id);
  if (disabled) next.push(id);
  return next;
}
