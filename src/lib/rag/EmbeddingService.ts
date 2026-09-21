import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauri } from "../tauri/invoke";
import { AI_GATEWAY_KEY, secretStore } from "../agent/SecretStore";

export const EMBEDDING_MODEL = "openai/text-embedding-3-small";

const gatewayFetch: typeof globalThis.fetch = (input, init) => {
  if (isTauri()) return tauriFetch(input, init);
  return globalThis.fetch(input, init);
};

export class EmbeddingUnavailableError extends Error {
  constructor(message = "Embeddings are unavailable while offline.") {
    super(message);
    this.name = "EmbeddingUnavailableError";
  }
}

export class GatewayEmbeddingService {
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const apiKey = await secretStore.get(AI_GATEWAY_KEY);
    if (!apiKey) throw new EmbeddingUnavailableError("AI Gateway API key is missing.");
    const response = await gatewayFetch("https://ai-gateway.vercel.sh/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    });
    if (!response.ok) throw new EmbeddingUnavailableError(`Embedding request failed (${response.status}).`);
    const payload = await response.json() as { data?: { embedding: number[]; index: number }[] };
    const rows = [...(payload.data ?? [])].sort((a, b) => a.index - b.index);
    if (rows.length !== texts.length) throw new EmbeddingUnavailableError();
    return rows.map((row) => row.embedding);
  }
}

export const embeddingService = new GatewayEmbeddingService();
