export interface LocalTools {
  codegraph: string;
  graphify: string;
}

let cached: LocalTools | null = null;
let inflight: Promise<LocalTools> | null = null;

export function resetLocalToolsForTests(): void {
  cached = null;
  inflight = null;
}

export function ensureLocalTools(load: () => Promise<LocalTools>): Promise<LocalTools> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = load()
      .then((result) => {
        cached = result;
        return result;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
