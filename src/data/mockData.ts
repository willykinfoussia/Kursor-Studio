import type { AgentDefinition, AgentMessage, AgentTask, ToolCall } from "../types/agent";

export const initialMessages: AgentMessage[] = [
  { id: "start", role: "assistant", content: "Quel est le projet que vous voulez créer ?", timestamp: Date.now() },
];

export const initialTasks: AgentTask[] = [
  { id: "analysis", title: "Analyse du projet", status: "completed", progress: 100 },
  { id: "architecture", title: "Définition de l’architecture", status: "completed", progress: 100 },
  { id: "components", title: "Création des composants", status: "running", progress: 60 },
  { id: "configuration", title: "Configuration de l’application", status: "pending", progress: 0 },
  { id: "tests", title: "Vérification finale", status: "pending", progress: 0 },
];

export const initialTools: ToolCall[] = [
  { id: "t1", tool: "read_file", input: { path: "src/App.tsx" }, status: "completed", output: "124 lines" },
  { id: "t2", tool: "write_file", input: { path: "src/components/TodoList.tsx" }, status: "completed", output: "created" },
  { id: "t3", tool: "run_command", input: { command: "pnpm build" }, status: "running" },
  { id: "t4", tool: "test", input: { suite: "app" }, status: "pending" },
];

export const agents: AgentDefinition[] = [
  { id: "coding", name: "Coding Agent", description: "Writes and modifies project code.", enabled: true, tools: ["Filesystem", "Terminal", "Git"], accent: "violet" },
  { id: "research", name: "Research Agent", description: "Finds documentation and evaluates technical options.", enabled: true, tools: ["Browser", "Search", "Files"], accent: "cyan" },
  { id: "design", name: "Design Agent", description: "Creates UI systems and production-ready assets.", enabled: false, tools: ["Assets", "Browser", "Filesystem"], accent: "pink" },
  { id: "testing", name: "Testing Agent", description: "Runs checks, finds regressions and proposes fixes.", enabled: true, tools: ["Terminal", "Browser", "Reports"], accent: "green" },
];

export const appTasks = [
  { title: "Create Todo application", agent: "Coding Agent", progress: 80, status: "running" },
  { title: "Configure API", agent: "Backend Agent", progress: 45, status: "running" },
  { title: "Initialize project", agent: "Coding Agent", progress: 100, status: "completed" },
  { title: "Install dependencies", agent: "Coding Agent", progress: 100, status: "completed" },
  { title: "Setup React", agent: "Coding Agent", progress: 100, status: "completed" },
] as const;
