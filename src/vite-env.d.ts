/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare module "*worker.js";

declare module "mermaid" {
  interface MermaidApi {
    initialize: (config: Record<string, unknown>) => void;
    render: (id: string, text: string) => Promise<{ svg: string }>;
  }
  const mermaid: MermaidApi;
  export default mermaid;
}
