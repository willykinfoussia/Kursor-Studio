import { skillRegistry } from "../skills/SkillRegistry";
import { graphService } from "../../graph/GraphService";
import { specScope } from "../../graph/classify";
import { graphTokens, uniqueSorted } from "../../graph/tokenize";
import type { KnowledgeCatalogItem } from "./prompt";

export async function collectKnowledgeCatalog(includeProject: boolean): Promise<KnowledgeCatalogItem[]> {
  const skills = await skillRegistry.listCatalog({ includeProject }).catch(() => []);
  const skillItems: KnowledgeCatalogItem[] = skills.map((skill) => ({
    kind: "skill",
    id: skill.id,
    origin: skill.origin,
    title: skill.name,
    description: skill.description,
    tokens: graphTokens(`${skill.id} ${skill.name} ${skill.description} ${skill.triggers.join(" ")}`),
  }));
  const graph = graphService.getGraph();
  const specItems: KnowledgeCatalogItem[] = (graph?.getNodes() ?? [])
    .filter((node) => node.category === "specifications")
    .map((node) => {
      const title = String(node.metadata.title ?? node.basename);
      return {
        kind: "spec" as const,
        id: node.path,
        path: node.path,
        scope: specScope(node.path) === "account" ? "account" as const : "project" as const,
        title,
        description: String(node.metadata.specType ?? node.category),
        tokens: uniqueSorted([...node.tokens, ...graphTokens(`${node.path} ${title}`)]),
      };
    });
  return [...skillItems, ...specItems];
}
