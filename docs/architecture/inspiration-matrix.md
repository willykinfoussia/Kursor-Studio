# Matrice d’inspiration — Kursor Harness

Étude des patterns observés dans les sources de référence. **Aucune copie de code, aucun fork, aucune dépendance** vers ces projets.

Légende des décisions :

- **Adopter** — reprendre le pattern, idiome Kursor.
- **Adapter** — garder l’intention, changer la forme (TS, desktop, provider-agnostic).
- **Rejeter** — ne pas faire, ou reporter hors V1.
- **Déjà là** — Kursor le possède ; ne pas réimplémenter.

Sources :

1. [ultraworkers/claw-code](https://github.com/ultraworkers/claw-code) — harness CLI Rust (`ConversationRuntime`, tools, permissions, compact, hooks, sessions).
2. [obra/superpowers](https://github.com/obra/superpowers) — méthodologie skills (brainstorm, plan, TDD, verify).
3. [affaan-m/ECC](https://github.com/affaan-m/ECC) — couche workflow portable (skills, memory vault, adapters, evals).
4. [anthropics/claude-code](https://github.com/anthropics/claude-code) — agent terminal de référence (query loop, permissions, hooks, subagents, compact, CLAUDE.md).

---

## Matrice

| Concept | Source | Pattern observé | Pourquoi utile | Décision Kursor | Différences Kursor |
| --- | --- | --- | --- | --- | --- |
| Boucle conversation + tools | Claw, Claude Code | `ConversationRuntime` / `queryLoop` : stream modèle → tool → permission → résultat → repeat jusqu’à stop | C’est le cœur d’un agent qui *agit*, pas d’un chatbot | **Adapter** | Rester en TypeScript sur Vercel AI SDK (`streamText`, `stopWhen`). Ne pas porter la boucle en Rust. Réutiliser `AgentRuntime` comme façade. |
| Séparation runtime / tools / API | Claw | Crates `runtime`, `tools`, `api` | Limite le couplage provider / outils | **Adapter** | Modules TS `harness/` + `ToolRegistry` existant. `AIService` reste la porte modèle. Capacités OS en Rust, pas un crate « tools » unique. |
| Streaming | Claw, Claude Code, Kursor | Tokens + tool events en live | UX IDE, cancel, fallback | **Déjà là** | Étendre les events (`permission-required`, `verification-*`) sans casser `text-delta`. |
| Model router / fallback | Kursor | `ModelRouter` + `FallbackManager` + timeout/retry | Provider-agnostic, résilience | **Déjà là** | Claw a des aliases opus/sonnet et fallback provider. Kursor route déjà une liste Gateway. Ne pas ancrer d’aliases Anthropic. |
| Tool registry | Claw, Claude Code, Kursor | Catalogue nommé + schéma + execute | Extensibilité | **Adapter** | Enrichir `AgentTool` avec `risk` / `mutate`. MCP s’enregistre dans le **même** `ToolRegistry` via `MCPToolAdapter`. |
| Read / Write / Edit / Glob / Grep | Claw, Claude Code | Inspection et mutation workspace-scoped | Un agent code sans grep est aveugle | **Adapter** | `list_files`/`read_file`/`write_file` existent. Ajouter `grep_search`, `glob_files`, `edit_file`. Paths relatifs projet, containment Rust existant. |
| Bash / shell tool | Claw, Claude Code | Exécution shell sous permission + parfois sandbox | Vérifier, installer, tester | **Adapter** | Outil `run_command` **capturé**, cwd projet, timeout, pas de TTY. **Interdit** de réutiliser le PTY humain `portable-pty`. |
| Allowlist process minimale | Kursor | `process_execute` : 3 commandes `--version` | Réduit la RCE | **Adapter** | Garder une deny-list dure en Rust. Remplacer l’allowlist trop étroite par ask + allowlist projet persistée. |
| WebSearch / WebFetch | Claw, Claude Code | Recherche et fetch HTTP | Docs, APIs, erreurs inconnues | **Adapter** (phase 8) | Plugin HTTP Tauri déjà scopé à la Gateway. Étendre par domaine + ask. Pas de browser agent V1. |
| NotebookEdit | Claw, Claude Code | Édition cellules notebook | Niche | **Rejeter** | Hors scope IDE Kursor V1. |
| TodoWrite | Claw, Claude Code | Liste de tâches dans le run | Plan visible, reprise | **Adapter** | Brancher sur la table SQLite `tasks` déjà migrée. UI Tasks aujourd’hui mockée. |
| Skill tool | Claw, Superpowers, ECC | Charger une procédure Markdown à la demande | Évite d’empiler toutes les procédures dans le system prompt | **Adapter** | Catalogue name+description en contexte ; corps via `load_skill`, budget tokens. Pas d’install marketplace. |
| ToolSearch | Claw | Découvrir des outils quand le pool est énorme | Utile à 50+ tools/MCP | **Rejeter V1** | Catalogue court et fixe d’abord. |
| Agent tool / subagents | Claude Code, Claw | Sous-loop contexte isolé, résumé au parent | Économie de contexte à l’exploration | **Adopter V1** | Tool `agent` : `explore` / `implement` / `review`. Pas de nested spawn. |
| Permission modes | Claude Code, Claw | default/ask, acceptEdits, plan, bypass, auto, dontAsk… | L’humain règle le niveau de confiance | **Adapter** | Modes existants + overlay `planMode` après brainstorm. Classifieur LLM auto-mode V1 (`LLM-PERM`) sur le chemin *ask*. |
| Deny / ask / allow rules | Claude Code, Claw | `Tool` ou `Tool(specifier)`, deny-first | Politique déterministe, pas le modèle | **Adapter** | Même ordre deny → ask → allow. Syntaxe simple `run_command(pnpm test)`. Deny large sans exception allow. |
| PermissionPrompter | Claw | Trait qui décide Allow/Deny | Testable sans UI | **Adopter** | Interface TS + dialog React. Tests avec prompter fake. |
| Session grants vs persistés | Claude Code | Edits : session ; bash/domain : persist local gitignored | UX : pas re-prompt spam, pas allow éternel silencieux | **Adopter** | Writes session-scoped en mode workspace. Commandes/domaines dans `.kursor/settings.local.json`. |
| Hook PreToolUse peut deny | Claude Code, Claw | Hook déterministe vs CLAUDE.md consultatif | Enforce secrets, policies | **Adapter** | HookBus in-process TS. 7 events V1. Pas de 27 types, pas de hooks shell/`hooks.json`. |
| Hook peut rewrite l’input | Claude Code | `updatedInput` | Correction de path, redaction | **Adapter** | Rewrite borné (path normalize). Jamais pour élargir les droits Rust. |
| PostToolUse annotate only | Claude Code | Pas d’undo | Clarté du contrat | **Adopter** | Index RAG + refresh Monaco après write. |
| CLAUDE.md / AGENTS.md / CLAW.md | Claude Code, Claw | Fichiers d’instruction projet injectés au system prompt | Mémoire d’équipe portable | **Adapter** | `KURSOR.md` puis `AGENTS.md` puis `.kursor/rules/`. Priorité documentée. Pas de CLAUDE.md obligatoire. |
| Nested directory rules | Claude Code | CLAUDE.md dans un sous-dossier au touch | Contexte local | **Rejeter V1** | Un loader racine suffit. Évite la surprise. |
| Auto memory MEMORY.md | Claude Code | Fichier user chargé chaque session | Préférences durables | **Adapter** | SQLite `agent_memory` existant, pas un Mega-markdown. Data ≠ instructions (leçon ECC). |
| Compaction + continuation preamble | Claw, Claude Code | Résumer l’ancien, garder le tail, réinjecter rules | Sessions longues | **Adopter** | Compactor TS. Réinjecter rules/skills/mémoire depuis disque. |
| Ne pas splitter tool-use / tool-result | Claw (`AGENTS.md` runtime) | Invariant de compact | Sinon le modèle voit un tool call orphelin | **Adopter** | Test eval dédié. |
| Truncation naïve 30 messages | Kursor | `MAX_HISTORY_MESSAGES = 30` | Simple | **Remplacer** | Compaction. 30 reste un fallback d’urgence. |
| Prompt cache prefix layering | Claude Code | System → project → transcript pour cache exact-match | Coût | **Reporter** | Utile plus tard ; Gateway/modèles varient. Garder l’ordre d’assemblage stable dès V1. |
| Workspace containment file_ops | Claw, Kursor | Toute FS op bornée à cwd/root | Sécurité | **Déjà là** | `resolve_within_root` Rust + tests traversal. Les outils TS doivent continuer à l’appeler, jamais `fs` Node. |
| Sandbox OS (seatbelt/bwrap) | Claude Code, Claw | Isolation réseau/FS du bash | Défense en profondeur | **Rejeter V1** | Desktop app + cwd + deny-list d’abord. Sandbox natif = phase future Windows/macOS. |
| MCP lifecycle | Claw, Claude Code, ECC | Tools externes JSON-RPC | Extensibilité énorme | **Adapter** | Source de capabilities. Client `rmcp` stdio en Rust. Même `PermissionManager`. Pas de marketplace V1. |
| Plugins / marketplace | Claw, Claude Code, Superpowers | Install skills/plugins | Écosystème | **Rejeter** | Kursor n’est pas un store. Skills projet + built-in. |
| Slash commands zoo | Claw | `/mcp` `/doctor` `/subagent` / … | CLI surface | **Rejeter** | IDE : UI et command palette, pas un REPL slash. |
| `claw doctor` | Claw | Healthcheck config/tools/auth | Onboarding | **Adapter plus tard** | Settings + ping agent existent (`agent_ping`). Un « diagnostics » UI optionnel, pas un CLI. |
| Session JSONL resume | Claw, Claude Code | `--resume`, heartbeat, fork | Reprise | **Adapter** | SQLite déjà : conversations + agent_runs. Ajouter checkpoint + statut `interrupted`. Pas de format JSONL comme store primaire (JSONL = traces). |
| Usage / cost tracker | Claw, Kursor | Tokens, latence, fallback | Observabilité | **Déjà là** | `UsageMetrics` + `model_usage`. Ajouter traces JSONL locales, pas de télémétrie cloud. |
| Mock parity harness | Claw | Mock Anthropic + scénarios déterministes | Evals sans réseau | **Adapter** | Mock `AIService` (déjà le style des tests). Scénarios Kursor, pas de service HTTP Anthropic. |
| Philosophy Discord / multi-claw | Claw `PHILOSOPHY.md` | Humains dirigent, essaim d’agents sur Discord | Demo autonome | **Rejeter** | Kursor = IDE desktop, un humain, un workspace. |
| Coordination OmX / clawhip / OmO | Claw | Couches workflow + notifications hors contexte | Évite de polluer le prompt avec le routing | **Rejeter** | Hors produit. L’observabilité Kursor reste in-process. |
| using-superpowers 1 % rule | Superpowers | Si 1 % de chance qu’un skill s’applique, l’invoquer | Discipline | **Adopter V1** | Bootstrap session + filet harness (`load_skill` / `check_skills` / slash). |
| Brainstorming before code | Superpowers | Questions, alternatives, spec approuvée | Évite le code prématuré | **Adopter V1** | Skill + HARD-GATE `designApproved`. |
| writing-plans ultra-détaillés | Superpowers | Tâches 2–5 min, snippets complets | Exécution junior-proof | **Adopter V1** | Skill vendored ; plans sous `docs/superpowers/plans/`. |
| executing-plans | Superpowers | Parent implémente après Build ; TDD obligatoire | Contrôle | **Adopter V1** | Seul mode d’exécution après `planApproved`. |
| subagent-driven-brainstorming / planning | Kursor | Explore isolé avant design / create_plan | Recherche | **Adopter V1** | Skills recherche ; `review` n’est plus orchestré par tâche. |
| subagent-driven-development | Superpowers | Un sous-agent par tâche + review 2 stages | Parallélisme | **Rejeter** | Exclu du catalogue Kursor (vendor Superpowers inchangé). |
| test-driven-development skill | Superpowers | RED-GREEN-REFACTOR obligatoire | Qualité | **Adopter V1** | Skill mandatory pendant l’implémentation. |
| systematic-debugging | Superpowers | 4 phases, evidence | Moins de guess | **Adapter** | Built-in skill V1 + workflow `debug` interne. |
| verification-before-completion | Superpowers | Interdit de déclarer done sans sortie réelle | Fiabilité | **Adopter** | Étape `verifying` du loop, pas seulement du texte de skill. |
| git worktrees isolés | Superpowers, ECC, Orca | Chaque agent sur une branche/worktree | Isolation parallèle | **Adapter V1** | Branche in-place (`git_branch` / `checkout -b`) après Build. Un seul checkout ; l’éditeur et le panneau Git suivent. Pas de `.worktrees/`. |
| finishing-a-development-branch | Superpowers | Merge local obligatoire | Fin de cycle git | **Adopter V1** | Merge = checkout base ; conflits listés + continue. |
| writing-skills | Superpowers | Skills testables comme du process-TDD | Qualité des procédures | **Adopter V1** | Skill meta vendored. |
| SKILL.md YAML portable | Superpowers, ECC | Frontmatter name/description/origin | Unité d’extension la plus portable | **Adopter** | Format identique en esprit, origin `kursor` / `project`. Pas de copies `.cursor/skills` pour d’autres IDEs. |
| Cross-harness adapters | ECC | Une source skills, N harnesses | ECC est un OS de workflows | **Rejeter** | Kursor *est* le harness. Pas d’adapters Claude/Codex/Cursor. |
| Memory vault ecc.memory.v1 | ECC | Markdown scopé project/team/user, unreviewed, data not instructions | Mémoire gouvernée | **Adapter** | SQLite + types existants. Adopter **unreviewed** + « data not instructions ». Pas de vault Markdown parallèle. |
| ecc.session.v1 adapters | ECC | Snapshot de session canonique multi-outils | Reprise cross-tool | **Rejeter** | Session Kursor native SQLite. |
| AgentShield / SARIF | ECC | Scan prompts, hooks, secrets, MCP | Sécu enterprise | **Rejeter V1** | Hooks secrets built-in + deny `.env`. Pas de plateforme compliance. |
| 68 agents / 286 skills | ECC | Catalogue massif | Couverture | **Rejeter** | 2 skills built-in V1. Qualité > volume. |
| Control plane ecc2 / TUI / HUD | ECC 2.0 | OS d’orchestration, queues, worktrees | Produit différent | **Rejeter** | HUD léger dans AgentPanel seulement. |
| Meta-harness / autocontext | ECC refs | Améliorer le harness via traces + verifiers | Auto-amélioration | **Reporter** | JSONL traces V1. Promotion de playbooks hors scope. |
| Subagents Explore / Plan / general | Claude Code | Types built-in, tools restreints, summary trailer | Contexte economics | **Adopter V1** | `explore` / `implement` / `review`. Plan = mode session après brainstorm. |
| assembleToolPool built-in + MCP | Claude Code | Fusion des outils | Extensibilité | **Adapter** | Pool = `ToolRegistry` + `CapabilityResolver`. MCP = source, même `PermissionManager`. |
| YOLO / auto classifier | Claude Code | ML qui auto-approve | Fluidité | **Adopter V1** | `LLM-PERM` sur le chemin *ask*. Deny explicite gagne. Échec API → ask humain. YOLO settings reste au-dessus. |
| bypassPermissions | Claude Code, Claw | Skip prompts | Devcontainers | **Adapter** | Mode `bypass` existant mais jamais défaut, settings visible, pas de flag caché. |
| Protected paths .git / .env | Claude Code | Même bypass a des gardes (partielles) | Moins de casse repo | **Adopter** | Deny `.env` / keys **même** en workspace. `.git` via outils git seulement. |
| Permissions enforced by runtime not model | Claude Code docs | CLAUDE.md ne peut pas grant | Sécu | **Adopter** | Déjà l’esprit du README Kursor (capability layer). Le harness ne fait pas confiance au prompt. |
| Comment on permission prompt | Claude Code | Tab → note à l’agent | Clarifier un deny | **Adapter** | Champ optionnel sur le dialog. Deny + reason → message outil. |
| Context window 5-layer compact | Analyses Claude Code | Clear tool outputs puis summarize | Budget | **Adapter** | D’abord résumer les gros stdout `run_command` ; ensuite compact transcript. |
| System prompt coding rules | Kursor | `systemPrompt.ts` 10 règles | Identité | **Déjà là** | Conserver « never claim file/command without tool ». Étendre avec permissions + verify. |
| RAG + embeddings | Kursor | Lance + FTS + ContextBuilder | Inspection sémantique | **Déjà là** | Le harness s’en sert comme couche contexte, pas comme substitut à grep. |
| Memory types fact/decision/… | Kursor | Schéma SQLite | Mémoire structurée | **Déjà là** | Ajouter outils d’écriture + flag unreviewed. |
| Human terminal PTY | Kursor | xterm + portable-pty | Terminal IDE réel | **Déjà là / séparer** | Jamais un AgentTool. L’agent a `run_command`. |
| Git status stub | Kursor | `branch: main`, always clean | Placeholder | **Remplacer** | Vrai `git_status` / `git_diff` read-only. |
| Rust AgentRuntime trait | Kursor | `send_message` / `cancel_task` morts | Future orchestrateur | **Laisser en stub** | Ne pas y déplacer le harness. Éventuel pont events plus tard. |
| MAX_TOOL_STEPS = 8 | Kursor | Cap AI SDK | Évite les boucles | **Adapter** | Monter à 24, rester un cap dur, event si atteint. |
| confirmDestructive | Kursor settings | Toggle UI | Intent utilisateur | **Déjà là** | Brancher sur `delete_file` et commandes dangereuses, pas un booléen orphelin. |
| SecretStore + env Gateway | Kursor | Clé hors source, HTTP scopé | Sécu desktop | **Déjà là** | Interdire injection de secrets dans `run_command` env / traces. |
| Eval drill Superpowers | Superpowers-evals | Tests de comportement de skills | Qualité process | **Reporter** | Evals d’outils/permissions d’abord. |

---

## Synthèse par source

### Claw Code — ce qu’on prend / ce qu’on laisse

**Prendre (intention)** : runtime = session + permissions + tools + compact + hooks ; containment workspace ; paires tool-call/result ; evals déterministes ; `PermissionPrompter` testable.

**Laisser** : réécriture Rust de la boucle ; REPL slash ; plugins marketplace ; philosophy Discord/essaim ; mock Anthropic ; crate unique `tools` qui parle à l’API provider. MCP stdio est désormais une source du harness (runtime process en Rust, catalogue TS).

**Pourquoi** : Kursor est déjà un desktop Tauri dont l’orchestration TS et le fallback Gateway marchent. Recopier Claw serait un second produit.

### Superpowers — ce qu’on prend / ce qu’on laisse

**Prendre** : règle 1 % ; Basic Workflow entier ; bibliothèque de skills ; verify-before-completion runtime ; SDD ; branche in-place après Build.

**Laisser** : adapters cross-harness ; marketplace ; copie `.worktrees/` ; retarget éditeur (inutile : un seul checkout).

**Pourquoi** : [agent-workflow-ideal.md](./agent-workflow-ideal.md) prime : 1 %, Basic Workflow, SDD, `git_branch` in-place, TDD pendant l’implémentation. Les micro-edits passent le skill check sans brainstorm.

### ECC — ce qu’on prend / ce qu’on laisse

**Prendre** : mémoire = data unreviewed ; SKILL.md comme unité portable ; traces + verifiers comme direction evals ; hooks pour l’enforce, rules pour le conseil.

**Laisser** : ambition « harness OS » ; adapters multi-IDE ; AgentShield enterprise ; centaines de skills/agents ; session canonique `ecc.session.v1`.

**Pourquoi** : Kursor n’adapte pas Claude Code, il **est** l’environnement d’exécution.

### Claude Code — ce qu’on prend / ce qu’on laisse

**Prendre** : deny-first ; modes plan/edits ; grants session vs persistés ; subagents `explore`/`implement`/`review` ; hooks PreToolUse ; compact LLM après extractif ; classifieur auto-mode (`LLM-PERM`) sur *ask*.

**Laisser** : surface CLI ; 27 hooks ; MCP-first ; marketplace ; bypass comme chemin normal ; notebook ; computer-use.

**Pourquoi** : viser le *contrat de sûreté et de contexte*, pas l’UX terminal ni l’écosystème Anthropic.

---

## Gaps Kursor vs sources (priorisés)

| Gap | Gravité | Phase |
| --- | --- | --- |
| Pas de PermissionManager | Bloquant dès `run_command` | 1 |
| Pas de grep/glob/edit réels | Agent aveugle / rewrite totaux | 2 |
| Pas de commande agent | Impossible de vérifier | 3 |
| Transcript sans tool pairs / compact | Sessions courtes et amnésiques | 1 + 4 |
| Git stub | Contexte VCS faux | 2 |
| Verify absent | Hallucinations de succès | 5 |
| Skills/hooks absents | Pas d’extension déterministe | 6 |
| Mémoire lecture seule | Pas d’apprentissage projet | 7 |
| Tasks mock | Observabilité fake | 5 |
| Pas d’evals scénario harness | Régressions invisibles | 9 |
| Subagents absents | OK en V1 | 10 |

---

## Règle d’or pour l’implémentation

Si un pattern n’existe que pour **imiter un autre produit**, il est rejeté.

S’il existe pour **empêcher une classe de bugs** (path escape, tool pair cassée, succès sans preuve, modèle qui s’auto-accorde des droits), il est adopté.

Kursor reste : desktop, local-first, Rust pour l’OS, TypeScript pour l’agent, model-agnostic, tool-agnostic.
