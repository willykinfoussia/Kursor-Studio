import { skillRegistry } from "../skills/SkillRegistry";
import { graphService } from "../../graph/GraphService";
import { specScope } from "../../graph/classify";
import type { KnowledgeCatalogItem } from "./prompt";

export async function collectKnowledgeCatalog(includeProject: boolean): Promise<KnowledgeCatalogItem[]> {
  const skills = await skillRegistry.listCatalog({ includeProject }).catch(() => []);
  const skillItems: KnowledgeCatalogItem[] = skills.map((skill) => ({
    kind: "skill",
    id: skill.id,
    origin: skill.origin,
    description: skill.description,
  }));
  const graph = graphService.getGraph();
  const specItems: KnowledgeCatalogItem[] = (graph?.getNodes() ?? [])
    .filter((node) => node.category === "specifications")
    .map((node) => ({
      kind: "spec",
      id: node.path,
      path: node.path,
      scope: specScope(node.path) === "account" ? "account" : "project",
      title: String(node.metadata.title ?? node.basename),
      description: String(node.metadata.specType ?? node.category),
    }));
  return [...skillItems, ...specItems];
}
