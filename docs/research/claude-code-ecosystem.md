# Claude Code Ecosystem Research

> Comprehensive analysis of the Claude Code extensibility ecosystem: skills, MCP, hooks, plugins, custom agents, and community resources. Researched February 2026.

## Table of Contents

1. [Claude Code Skills System](#1-claude-code-skills-system)
2. [Model Context Protocol (MCP) Ecosystem](#2-model-context-protocol-mcp-ecosystem)
3. [Claude Code Hooks System](#3-claude-code-hooks-system)
4. [Claude Code Plugins](#4-claude-code-plugins)
5. [CLAUDE.md Best Practices](#5-claudemd-best-practices)
6. [Custom Agents and Agent Teams](#6-custom-agents-and-agent-teams)
7. [Community Resources](#7-community-resources)
8. [Delivery Format Analysis for LLREM](#8-delivery-format-analysis-for-llrem)

---

## 1. Claude Code Skills System

### Overview

Skills are the primary way to extend Claude Code's capabilities. A skill is a folder containing a `SKILL.md` file (with YAML frontmatter and markdown instructions) that Claude can load either automatically (model-invoked) or on demand (user-invoked via `/skill-name`). Skills follow the [Agent Skills](https://agentskills.io) open standard, which is cross-tool compatible.

Skills merged with the older custom slash commands system (`.claude/commands/`). Both mechanisms create `/name` commands, but skills offer additional features: supporting files, frontmatter-controlled invocation, and subagent execution.

### SKILL.md Structure

```yaml
---
name: my-skill                      # Lowercase letters, numbers, hyphens. Max 64 chars
description: What this skill does    # Max 1024 chars. PRIMARY triggering mechanism
argument-hint: "[issue-number]"      # Hint for autocomplete
disable-model-invocation: true       # Prevent Claude from auto-loading
user-invocable: false                # Hide from / menu
allowed-tools: Read, Grep, Glob     # Restrict tools during skill
model: sonnet                        # Override model
context: fork                        # Run in subagent
agent: Explore                       # Which subagent type when context: fork
hooks:                               # Lifecycle hooks scoped to this skill
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/check.sh"
---

Skill instructions in markdown...
```

### Key Concepts

**Progressive Disclosure**: Skill descriptions (~100 tokens) are always loaded so Claude can determine relevance. Full skill content (<5k tokens typically) loads only when invoked. Supporting files load on demand.

**Invocation Control**:
| Setting | User can invoke | Claude can invoke | Context loading |
|---|---|---|---|
| Default | Yes | Yes | Description always, full on invoke |
| `disable-model-invocation: true` | Yes | No | Not in context |
| `user-invocable: false` | No | Yes | Description always, full on invoke |

**Dynamic Context**: The `!`command`` syntax runs shell commands before the skill content is sent to Claude. The output replaces the placeholder.

**String Substitutions**: `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N`, `${CLAUDE_SESSION_ID}`

**Subagent Execution**: `context: fork` runs the skill in an isolated subagent with its own context window. The `agent` field selects which subagent type (Explore, Plan, general-purpose, or custom).

### Skill Locations (Priority Order)

1. Enterprise (managed settings) - All org users
2. Personal (`~/.claude/skills/<name>/SKILL.md`) - All your projects
3. Project (`.claude/skills/<name>/SKILL.md`) - Single project
4. Plugin (`<plugin>/skills/<name>/SKILL.md`) - Where plugin is enabled

### Skill Directory Structure

```
my-skill/
  SKILL.md           # Required - main instructions
  references/        # Detailed documentation (loaded on demand)
  scripts/           # Executable code
  assets/            # Templates, icons, etc.
  examples/          # Example outputs
```

### Skills API (Platform)

Agent Skills can be added to Messages API requests via the `/v1/skills` endpoint, providing programmatic control over custom skill versioning and management. Pre-built skills (e.g., pptx, xlsx, pdf, docx) can be referenced by `skill_id`.

### Official Skills Repository

The [anthropics/skills](https://github.com/anthropics/skills) repository contains 50+ skills across categories:
- **Document Processing**: Word, PDF, PowerPoint, Excel
- **Development Tools**: Playwright, AWS, Git
- **Data Analysis**: Various data processing skills
- **Business/Marketing**: Communications, branding
- **Creative Media**: Art, music, design
- **Project Management**: Planning, tracking
- **Security**: Security analysis

### Community Skills

- [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) - Curated skills list
- [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) - Another curated list
- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) - 300+ agent skills compatible across tools
- [karanb192/awesome-claude-skills](https://github.com/karanb192/awesome-claude-skills) - 50+ verified skills
- [alirezarezvani/claude-code-skill-factory](https://github.com/alirezarezvani/claude-code-skill-factory) - Toolkit for building skills
- [SkillsMP](https://skillsmp.com/) - Agent Skills Marketplace

### Relevance to LLREM

LLREM could be delivered as a Claude Code skill with:
- A main `SKILL.md` that teaches Claude to analyze transcripts
- Supporting scripts for pattern detection and config generation
- `context: fork` execution to keep analysis out of main context
- `disable-model-invocation: true` for user-controlled invocation via `/llrem`
- Both model-invoked (auto-suggest improvements) and user-invoked modes possible

---

## 2. Model Context Protocol (MCP) Ecosystem

### Specification and Architecture

MCP is an open protocol enabling seamless integration between LLM applications and external data sources/tools. Originally introduced by Anthropic in November 2024, it was donated to the Agentic AI Foundation (under the Linux Foundation) in December 2025.

**Architecture**: Client-server model inspired by Language Server Protocol (LSP):
- **MCP Clients**: AI agents (Claude Code, Cursor, etc.) connect to external systems
- **MCP Servers**: Expose tools and data from applications
- **Transport**: JSON-RPC 2.0 over stdio or HTTP (SSE/Streamable HTTP)
- **Latest Spec**: 2025-11-25 (adds OAuth 2.1 auth, async execution, enterprise features)

**Core Primitives**:
- **Tools**: Functions the server exposes (e.g., `create_file`, `search`)
- **Resources**: Data the server provides (files, database records)
- **Prompts**: Pre-defined prompt templates
- **Sampling**: Server-initiated LLM requests (less commonly used)

### MCP in Claude Code

**Configuration locations** (in priority order):
1. `.mcp.json` at project root (shared via version control)
2. `.claude/settings.local.json` (project-specific, gitignored)
3. `~/.claude/settings.local.json` (user-specific)
4. Plugin `.mcp.json` (bundled with plugin)

**Configuration format** (`.mcp.json`):
```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@package/server-name"],
      "env": {
        "API_KEY": "..."
      }
    }
  }
}
```

**MCP tool names** follow the pattern `mcp__<server>__<tool>`, e.g., `mcp__memory__create_entities`.

### MCP Server Registries

| Registry | Scale | Notes |
|---|---|---|
| [Glama.ai](https://glama.ai/mcp/servers) | 17,000+ servers | Most comprehensive registry |
| [Smithery.ai](https://smithery.ai) | Major registry | Also hosting platform |
| [MCP.so](https://mcp.so) | Large catalog | Community-driven |
| [Official MCP Registry](https://github.com/modelcontextprotocol) | Authoritative | Launched preview late 2025 |
| [PulseMCP](https://www.pulsemcp.com) | Curated | Quality-focused |
| [MCPServers.org](https://mcpservers.org) | Large | Community catalog |
| [MCPIndex.net](https://mcpindex.net) | Growing | Multi-language |

The ecosystem grew from ~100 servers at MCP's launch (Nov 2024) to 16,000+ by late 2025.

### MCP Servers Relevant to LLREM

**Browser Automation / UI Testing**:
- [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) - Official Playwright MCP by Microsoft. Uses accessibility tree for deterministic control. Enables AI-driven test generation and browser automation.
- [executeautomation/mcp-playwright](https://github.com/executeautomation/mcp-playwright) - Community Playwright MCP with extended features including API testing.

**Memory / Knowledge Graph**:
- [modelcontextprotocol/server-memory](https://github.com/modelcontextprotocol/servers) - Official knowledge graph memory server by Anthropic. Persistent local memory with entities, relations, observations.
- [ViralV00d00/claude-code-memory](https://github.com/ViralVoodoo/claude-code-memory) - Claude Code-specific memory tracking activities, decisions, patterns using Neo4j graph database.
- [doobidoo/mcp-memory-service](https://github.com/doobidoo/mcp-memory-service) - Automatic context memory preventing re-explanation across sessions.
- [mkreyman/mcp-memory-keeper](https://github.com/mkreyman/mcp-memory-keeper) - Persistent context management for AI coding assistants.

**Code Analysis / Repository**:
- [modelcontextprotocol/server-github](https://github.com/modelcontextprotocol/servers) - GitHub integration for PR, issues, repos.
- [modelcontextprotocol/server-filesystem](https://github.com/modelcontextprotocol/servers) - File system access.
- Sequential Thinking Server - Structured reasoning for complex problems.

**Other Relevant Categories**:
- Database access servers (PostgreSQL, SQLite, etc.)
- CI/CD integration servers
- Docker MCP Gateway
- Slack, Notion, Linear integrations (as seen in Claude Code's built-in MCP support)

### Building an MCP Server

**TypeScript SDK**: [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)

**Minimal structure**:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

server.tool("analyze_transcript", { path: z.string() }, async ({ path }) => {
  // Tool implementation
  return { content: [{ type: "text", text: "Analysis results..." }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Best Practices**:
- Use Zod for input validation
- Never use `console.log()` for stdio servers (corrupts JSON-RPC); use `console.error()`
- Package.json: `type: "module"`, target ES2022
- Consider authentication, persistence for production
- Node.js 22.18.0+ supports built-in type stripping for development

### Could LLREM Be an MCP Server?

Yes, and this is a strong option. LLREM as an MCP server would:
- Expose tools like `analyze_transcripts`, `get_suggestions`, `apply_fix`
- Work with any MCP client (Claude Code, Cursor, VS Code, etc.)
- Be discoverable via MCP registries
- Run locally with no data leaving the machine
- Integrate naturally with Claude Code's existing MCP infrastructure

---

## 3. Claude Code Hooks System

### Overview

Hooks are event-driven automation scripts that execute at specific points in Claude Code's lifecycle. They can validate, block, modify, or enrich operations. Three types of hooks exist:
1. **Command hooks** (`type: "command"`): Shell scripts receiving JSON via stdin
2. **Prompt hooks** (`type: "prompt"`): Single-turn LLM evaluation
3. **Agent hooks** (`type: "agent"`): Multi-turn subagent with tool access

### Hook Events (Complete List)

| Event | When | Can Block? | Matcher |
|---|---|---|---|
| `SessionStart` | Session begins/resumes | No | startup, resume, clear, compact |
| `UserPromptSubmit` | User submits prompt | Yes | No matcher (always fires) |
| `PreToolUse` | Before tool executes | Yes | Tool name (Bash, Edit, Write, mcp__*) |
| `PermissionRequest` | Permission dialog shown | Yes | Tool name |
| `PostToolUse` | After tool succeeds | No (feedback only) | Tool name |
| `PostToolUseFailure` | After tool fails | No (feedback only) | Tool name |
| `Notification` | Claude sends notification | No | permission_prompt, idle_prompt, auth_success, elicitation_dialog |
| `SubagentStart` | Subagent spawned | No (context injection) | Agent type name |
| `SubagentStop` | Subagent finishes | Yes | Agent type name |
| `Stop` | Main agent finishes responding | Yes | No matcher |
| `TeammateIdle` | Agent team teammate about to idle | Yes (exit 2 only) | No matcher |
| `TaskCompleted` | Task marked completed | Yes (exit 2 only) | No matcher |
| `PreCompact` | Before context compaction | No | manual, auto |
| `SessionEnd` | Session terminates | No | clear, logout, prompt_input_exit, other |

### JSON Input Format

All hooks receive common fields via stdin:
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/working/directory",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" }
}
```

Event-specific additional fields:
- **PreToolUse**: `tool_name`, `tool_input`, `tool_use_id`
- **PostToolUse**: `tool_name`, `tool_input`, `tool_response`, `tool_use_id`
- **PostToolUseFailure**: `tool_name`, `tool_input`, `error`, `is_interrupt`
- **Stop/SubagentStop**: `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`
- **SessionStart**: `source`, `model`, optionally `agent_type`
- **SessionEnd**: `reason`
- **UserPromptSubmit**: `prompt`
- **Notification**: `message`, `title`, `notification_type`
- **SubagentStart**: `agent_id`, `agent_type`
- **TeammateIdle**: `teammate_name`, `team_name`
- **TaskCompleted**: `task_id`, `task_subject`, `task_description`, `teammate_name`, `team_name`
- **PreCompact**: `trigger`, `custom_instructions`

### Exit Codes and Output

- **Exit 0**: Success. Stdout parsed for JSON (decision control). For most events, stdout shown in verbose mode only. Exceptions: `UserPromptSubmit` and `SessionStart` add stdout as context for Claude.
- **Exit 2**: Blocking error. Stderr fed to Claude as error message. For `PreToolUse`, blocks tool; for `UserPromptSubmit`, blocks prompt; for `Stop`/`SubagentStop`, prevents stopping.
- **Other exit codes**: Non-blocking error. Stderr shown in verbose mode.

### Decision Control

**PreToolUse** (richest control):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask",
    "permissionDecisionReason": "Explanation",
    "updatedInput": { "command": "modified command" },
    "additionalContext": "Extra context for Claude"
  }
}
```

**PostToolUse, Stop, SubagentStop, UserPromptSubmit**:
```json
{
  "decision": "block",
  "reason": "Why this should be blocked"
}
```

**Universal fields** (all events):
```json
{
  "continue": false,
  "stopReason": "Message to user",
  "suppressOutput": true,
  "systemMessage": "Warning shown to user"
}
```

### Configuration Locations

| Location | Scope | Shareable |
|---|---|---|
| `~/.claude/settings.json` | All projects | No |
| `.claude/settings.json` | Single project | Yes (commit to repo) |
| `.claude/settings.local.json` | Single project | No (gitignored) |
| Managed policy | Organization-wide | Admin-controlled |
| Plugin `hooks/hooks.json` | When plugin enabled | Yes |
| Skill/Agent frontmatter | While component active | Yes |

### Environment Variables

- `$CLAUDE_PROJECT_DIR` - Project root path
- `$CLAUDE_CODE_REMOTE` - "true" in remote web environments
- `$CLAUDE_ENV_FILE` - SessionStart only, for persisting environment variables
- `$CLAUDE_PLUGIN_ROOT` - Plugin's root directory (for plugin hooks)

### Advanced Features

**Async hooks**: Set `"async": true` to run in background. Cannot block, but can deliver `systemMessage` or `additionalContext` on next turn.

**Input modification**: PreToolUse can modify tool input via `updatedInput` before execution.

**MCP tool matching**: Hooks can match MCP tools using patterns like `mcp__memory__.*` or `mcp__.*__write.*`.

**Prompt-based hooks**: Use an LLM for evaluation. LLM responds with `{"ok": true/false, "reason": "..."}`.

**Agent-based hooks**: Spawn a multi-turn subagent with tool access (Read, Grep, Glob) to verify conditions.

### Relevance to LLREM

Hooks are the most powerful integration point for LLREM:

1. **`SessionEnd` hook**: Trigger post-session transcript analysis automatically
2. **`Stop` hook**: Analyze the session before Claude stops, suggest improvements
3. **`PostToolUse` hook on Write/Edit**: Real-time pattern detection as code changes
4. **`PostToolUseFailure` hook**: Capture failure patterns for analysis
5. **`SessionStart` hook**: Load previous analysis results as context
6. **`PreCompact` hook**: Capture pre-compaction state for analysis
7. **`TaskCompleted` hook**: Verify quality gates before marking tasks done
8. **`SubagentStop` hook**: Analyze subagent performance patterns

The `transcript_path` field in every hook event provides direct access to the conversation JSONL file, which is the primary input for LLREM's analysis.

---

## 4. Claude Code Plugins

### Overview

Plugins are the packaging and distribution mechanism for Claude Code extensions. A plugin bundles commands, skills, agents, hooks, and MCP server configs into a shareable unit. Anthropic launched plugin support on October 9, 2025, with an official marketplace of 36 plugins.

### Plugin Structure

```
my-plugin/
  .claude-plugin/
    plugin.json        # Plugin manifest (ONLY file in .claude-plugin/)
  commands/            # Slash commands (.md files)
  agents/              # Custom agents (.md files)
  skills/              # Agent Skills (folders with SKILL.md)
  hooks/
    hooks.json         # Event handlers
  .mcp.json            # MCP server configurations
  .lsp.json            # LSP server configurations
  README.md            # Documentation
```

**Critical**: Commands, agents, skills, hooks go at the plugin root level, NOT inside `.claude-plugin/`.

### Plugin Manifest (plugin.json)

```json
{
  "name": "my-plugin",
  "description": "What this plugin does",
  "version": "1.0.0",
  "author": {
    "name": "Author Name"
  },
  "homepage": "https://...",
  "repository": "https://...",
  "license": "MIT"
}
```

Components are discovered automatically from their directories; they don't need to be registered in plugin.json.

### Plugin Namespacing

Plugin skills/commands use the namespace `plugin-name:skill-name` (e.g., `/my-plugin:hello`). This prevents conflicts between plugins.

### Plugin Hooks (hooks/hooks.json)

```json
{
  "description": "What these hooks do",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/format.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

### Plugin Marketplaces

- **Official Marketplace**: [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) - 36 curated plugins
- **Community Marketplaces**: Multiple community-driven registries exist
  - [claudemarketplaces.com](https://claudemarketplaces.com/)
  - [claudecodemarketplace.com](https://claudecodemarketplace.com/)
  - [claude-plugins.dev](https://claude-plugins.dev)
- **Custom Organization Marketplaces**: Supported for internal distribution

Install via: `/plugin install {plugin-name}@marketplace-repo`

### Plugin Categories (Official Marketplace)

The official 36 plugins span:
- **Language Server Protocol (LSP)**: TypeScript, Python, Rust - real-time code intelligence
- **Development Workflow**: Testing, CI/CD, deployment
- **Code Quality**: Linting, formatting, security scanning
- **External Services**: GitHub Actions, monitoring

### Testing and Development

```bash
# Load plugin locally for testing
claude --plugin-dir ./my-plugin

# Load multiple plugins
claude --plugin-dir ./plugin-one --plugin-dir ./plugin-two
```

### Relevance to LLREM

A plugin is the ideal distribution format for LLREM because it can bundle:
- **Skills**: `/llrem:analyze`, `/llrem:suggest`, `/llrem:apply`
- **Agents**: Specialized analysis agents (pattern-detector, config-optimizer)
- **Hooks**: SessionEnd analysis, PostToolUseFailure capture
- **MCP config**: If LLREM exposes an MCP server
- All in one installable package with namespace isolation

---

## 5. CLAUDE.md Best Practices

### File Hierarchy

Claude Code loads memory from multiple sources in priority order:

1. **Enterprise CLAUDE.md** (managed settings)
2. **User CLAUDE.md** (`~/.claude/CLAUDE.md`) - All projects
3. **Project CLAUDE.md** (`./CLAUDE.md`) - Current project, checked into VCS
4. **Project local** (`.claude/CLAUDE.md`) - Gitignored
5. **Rules directory** (`.claude/rules/*.md`) - Modular, conditional rules
6. **Imported files** (`@path/to/file` syntax in any CLAUDE.md)

### Rules Directory (.claude/rules/)

Added in Claude Code v2.0.64 (December 2025). Modular alternative to monolithic CLAUDE.md:

```
.claude/rules/
  testing.md          # Always loaded
  security.md         # Conditional (see below)
  api-conventions.md  # Conditional
```

**Conditional rules** with file pattern matching:
```yaml
---
paths:
  - src/auth/**/*
  - src/payments/**/*
---
# Security-Critical Code Rules
All code in these paths must...
```

Supports brace expansion: `src/**/*.{ts,tsx}` and symlinks for cross-project sharing.

### Community Best Practices

**Essential Content**:
- Build/test/lint commands (`npm run test`, `npm run build`)
- Code style guidelines and architectural patterns
- Key file paths and project structure
- Testing instructions and conventions
- Error handling policies

**Organization Patterns**:
- Keep CLAUDE.md concise (~200 lines max for root file)
- Move detailed topic-specific guidance to separate files via `@imports`
- Use `.claude/rules/` for conditional, file-scoped instructions
- Treat CLAUDE.md as living documentation refined from real experience

**Anti-patterns**:
- Overly long CLAUDE.md files (Claude ignores/loses important rules in noise)
- Including instructions Claude already follows by default
- Instructions that could be enforced by hooks instead
- Duplicating linter/formatter rules

**Team Adoption**:
- Codify team standards in shared CLAUDE.md at project root
- Use custom commands in `.claude/commands/` for repetitive tasks
- Update CLAUDE.md when PR reviews reveal undocumented conventions

### Tools for Generating CLAUDE.md

- The `skill-creator` skill in the official anthropics/skills repo
- Various community generators and templates
- `/init` command in Claude Code for bootstrapping

### Relevance to LLREM

LLREM's core output is improvements to CLAUDE.md and related config files:
- Detect patterns in transcripts that indicate missing CLAUDE.md guidance
- Generate diff-ready patches for CLAUDE.md, rules files, and settings
- Suggest new rules in `.claude/rules/` with appropriate path conditions
- Recommend converting verbose CLAUDE.md instructions to hooks where appropriate

---

## 6. Custom Agents and Agent Teams

### Custom Subagents

Subagents are specialized AI assistants running in isolated context windows with custom system prompts, tool access, and permissions.

**Configuration format** (`.claude/agents/my-agent.md`):
```yaml
---
name: my-agent
description: When Claude should delegate to this agent
tools: Read, Grep, Glob, Bash
disallowedTools: Write, Edit
model: sonnet               # sonnet | opus | haiku | inherit
permissionMode: default     # default | acceptEdits | dontAsk | plan | delegate | bypassPermissions
maxTurns: 50
skills:                     # Skills to preload
  - api-conventions
mcpServers:                 # MCP servers available
  - github
hooks:                      # Lifecycle hooks
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./validate.sh"
memory: user                # user | project | local - persistent cross-session learning
---

System prompt for the agent goes here in markdown...
```

**Locations** (priority order):
1. `--agents` CLI flag (session-only JSON)
2. `.claude/agents/` (project)
3. `~/.claude/agents/` (user)
4. Plugin `agents/` directory

**Built-in Subagents**:
- **Explore**: Haiku, read-only, fast codebase exploration
- **Plan**: Inherits model, read-only, research for planning
- **general-purpose**: Inherits model, all tools, complex tasks
- **Bash**: Terminal commands in separate context
- **Claude Code Guide**: Haiku, answers questions about Claude Code

**Persistent Memory**: When `memory` is set, the agent gets a dedicated directory (`~/.claude/agent-memory/<name>/` or `.claude/agent-memory/<name>/`). The first 200 lines of `MEMORY.md` in that directory are included in the system prompt automatically.

### Agent Teams (Experimental, Feb 2026)

Multi-agent orchestration where multiple Claude Code instances collaborate:

- One **team lead** coordinates work and assigns tasks
- Multiple **teammates** work independently in their own context windows
- **Shared task list** with dependency tracking
- **Inbox-based messaging** for inter-agent communication
- Enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` in settings

**Key differences from subagents**:
- Agent teams = real collaboration (shared findings, challenges, coordination)
- Subagents = focused workers reporting to single parent
- Teams use ~Nx the tokens of a single session (one per teammate)

**Use cases**: Research with multiple investigators, parallel module development, competing debugging hypotheses, cross-layer coordination.

### Community Agent Resources

- [iannuttall/claude-agents](https://github.com/iannuttall/claude-agents) - Custom subagents collection
- [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) - 100+ specialized subagents
- [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) - Complete config collection

### Relevance to LLREM

LLREM could create/recommend custom agents:
- A **transcript-analyzer** agent specialized in reading and analyzing conversation JSONL
- A **config-optimizer** agent that reviews and suggests improvements to CLAUDE.md and settings
- A **pattern-detector** agent for identifying recurring struggle patterns
- Agent teams for parallel analysis of multiple transcript directories
- Agent memory for building up knowledge about project-specific patterns across sessions

---

## 7. Community Resources

### Official Channels

- **Claude Code Docs**: [code.claude.com/docs](https://code.claude.com/docs)
- **Anthropic Developer Discord**: [discord.com/invite/prcdpx7qMm](https://discord.com/invite/prcdpx7qMm) (58,000+ members)
- **GitHub**: [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code)
- **Blog**: [claude.com/blog](https://claude.com/blog) - Official announcements and guides

### Curated Resource Collections

| Repository | Focus | Scale |
|---|---|---|
| [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | Skills, hooks, commands, plugins | Comprehensive |
| [jqueryscript/awesome-claude-code](https://github.com/jqueryscript/awesome-claude-code) | Tools, IDE integrations, frameworks | Large |
| [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) | Skills specifically | 50+ |
| [ComposioHQ/awesome-claude-plugins](https://github.com/ComposioHQ/awesome-claude-plugins) | Plugins | Growing |
| [awesomeclaude.ai](https://awesomeclaude.ai/) | Visual directory | Web-based |

### Documentation and Learning

- [ClaudeLog](https://claudelog.com/) - Unofficial docs, guides, tutorials
- [Builder.io CLAUDE.md Guide](https://www.builder.io/blog/claude-md-guide) - Complete CLAUDE.md guide
- [HumanLayer CLAUDE.md Guide](https://www.humanlayer.dev/blog/writing-a-good-claude-md) - Writing good CLAUDE.md
- [DeepWiki](https://deepwiki.com/) - Auto-generated docs for repos
- [DataCamp Hooks Tutorial](https://www.datacamp.com/tutorial/claude-code-hooks) - Practical hooks guide
- [Addy Osmani's AI Coding Workflow](https://addyosmani.com/blog/ai-coding-workflow/) - Workflow patterns going into 2026

### Notable Community Projects

- [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) - Hooks mastery guide
- [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) - Real-time multi-agent monitoring through hooks
- [ruvnet/claude-flow](https://github.com/ruvnet/claude-flow) - Agent orchestration platform
- [steipete/claude-code-mcp](https://github.com/steipete/claude-code-mcp) - Claude Code as MCP server
- [karanb192/claude-code-hooks](https://github.com/karanb192/claude-code-hooks) - Hook collection

### Industry Coverage

- [Anthropic's Code with Claude 2025 event](https://www.anthropic.com/events/code-with-claude-2025) - Official event
- TechCrunch, VentureBeat regular coverage of Claude Code updates
- Active subreddits (r/ClaudeAI, r/ArtificialIntelligence) discussion

---

## 8. Delivery Format Analysis for LLREM

### Option Comparison

| Format | Pros | Cons | Complexity | Distribution |
|---|---|---|---|---|
| **Standalone CLI** | Full control, independent updates, works without Claude Code, rich UI via Ink | Separate install, no native integration | Medium | npm |
| **Claude Code Skill** | Zero-install for Claude Code users, auto-invocation, natural UX | Limited to Claude Code, no standalone mode, skill size limits | Low | GitHub/Plugin |
| **MCP Server** | Works with any MCP client, standard protocol, tool composability | Requires MCP setup, more complex architecture | Medium-High | npm + MCP registries |
| **Plugin** | Bundles skills+hooks+agents+MCP, namespaced, marketplace distribution | Claude Code only, packaging overhead | Medium | Marketplace |
| **Hook** | Automatic execution, real-time analysis, minimal user friction | Limited to hook events, no standalone UI | Low | Config files |
| **Custom Agent** | Isolated context, persistent memory, specialized behavior | Only works as subagent, no standalone | Low | .claude/agents/ |

### Recommended: Hybrid Approach

LLREM should adopt a **layered architecture** that serves multiple delivery formats from a shared core:

#### Layer 1: Core Library (npm package)
- Transcript parsing, pattern detection, suggestion generation
- Pure TypeScript, no CLI or UI dependencies
- Exported as `@llrem/core` or similar

#### Layer 2: Standalone CLI (Primary Distribution)
- Oclif-based CLI with Ink UI
- `npx llrem analyze`, `npx llrem suggest`, `npx llrem apply`
- Works independently of Claude Code
- Rich interactive terminal interface

#### Layer 3: Claude Code Plugin (Deep Integration)
```
llrem-plugin/
  .claude-plugin/
    plugin.json
  skills/
    analyze/SKILL.md        # /llrem:analyze - run transcript analysis
    suggest/SKILL.md        # /llrem:suggest - get improvement suggestions
    apply/SKILL.md          # /llrem:apply - apply a specific fix
  agents/
    transcript-analyzer.md  # Specialized analysis agent
  hooks/
    hooks.json              # SessionEnd auto-analysis, PostToolUseFailure capture
  .mcp.json                 # Optional: LLREM as MCP server for tool access
```

**Plugin Hooks** (automatic integration):
```json
{
  "hooks": {
    "SessionEnd": [{
      "hooks": [{
        "type": "command",
        "command": "npx llrem analyze --session $SESSION_ID --output ~/.claude/llrem-results/latest.json",
        "async": true
      }]
    }],
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "npx llrem context --format claude"
      }]
    }],
    "PostToolUseFailure": [{
      "hooks": [{
        "type": "command",
        "command": "npx llrem capture-failure",
        "async": true
      }]
    }]
  }
}
```

**Plugin Skills**:
- `/llrem:analyze` - Analyze recent sessions, show issues
- `/llrem:suggest` - Generate suggestions with diffs
- `/llrem:apply` - Apply a specific fix with backup
- `/llrem:status` - Show current optimization status

**Plugin Agent** (`agents/transcript-analyzer.md`):
```yaml
---
name: llrem-analyzer
description: Analyzes Claude Code transcripts to identify improvement opportunities
tools: Read, Grep, Glob, Bash
model: haiku
memory: user
---
Specialized agent for analyzing conversation transcripts...
```

#### Layer 4: MCP Server (Optional, for Advanced Users)
- Expose LLREM analysis as MCP tools
- Enables other AI tools to use LLREM's analysis capabilities
- Tools: `analyze_session`, `get_suggestions`, `apply_fix`, `get_patterns`

### Integration Points Summary

| Claude Code Feature | LLREM Integration |
|---|---|
| **SessionEnd hook** | Auto-trigger analysis after every session |
| **SessionStart hook** | Load previous analysis results as context |
| **PostToolUseFailure hook** | Capture failure patterns in real-time |
| **Stop hook (prompt)** | LLM-based check if session addressed known issues |
| **Skills** | User-invoked analysis and suggestion application |
| **Custom Agent** | Deep transcript analysis with persistent memory |
| **MCP Server** | Tool access for other AI assistants |
| **Plugin** | Bundle everything for one-click install |
| **CLAUDE.md generation** | Primary output - improved project instructions |
| **Rules directory** | Generate conditional rules for specific code paths |
| **.mcp.json updates** | Suggest new MCP servers based on detected needs |
| **settings.json updates** | Suggest hooks, permissions, tool configs |

### Distribution Strategy

1. **Phase 1 (MVP)**: Standalone CLI (`npx llrem`) + basic SessionEnd hook config
2. **Phase 2 (Integration)**: Claude Code plugin with skills, hooks, and analysis agent
3. **Phase 3 (Ecosystem)**: MCP server for cross-tool compatibility, marketplace listing

---

## Key Takeaways for LLREM

1. **The plugin system is the right packaging format** for deep Claude Code integration, bundling skills + hooks + agents + MCP configs in one installable unit.

2. **Hooks are the most powerful integration point**, especially `SessionEnd` (post-session analysis), `SessionStart` (load previous results), and `PostToolUseFailure` (real-time pattern capture). The `transcript_path` field provides direct access to conversation data.

3. **The skills system enables natural UX** - both auto-invocation (Claude detects when to suggest improvements) and user-invocation (`/llrem:analyze`).

4. **MCP gives cross-tool reach** beyond Claude Code to any MCP-compatible agent, but should be a secondary distribution channel.

5. **The ecosystem is massive and growing** - 17,000+ MCP servers, 50+ official skills, 36 official plugins, active community. LLREM should position itself within this ecosystem rather than building in isolation.

6. **Agent memory enables learning** - Custom agents with `memory: user` can build up knowledge about recurring patterns across sessions, which is core to LLREM's value proposition.

7. **The CLAUDE.md and rules system is LLREM's primary output target** - generating and improving project instructions is the highest-impact concrete deliverable.

8. **Agent teams could power parallel analysis** - Analyzing multiple sessions or multiple pattern categories simultaneously using the experimental agent teams feature.

---

## Sources

### Official Documentation
- [Claude Code Skills](https://code.claude.com/docs/en/skills)
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Claude Code Plugins](https://code.claude.com/docs/en/plugins)
- [Claude Code Subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams)
- [Claude Code Memory](https://code.claude.com/docs/en/memory)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices)
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25)

### Anthropic Resources
- [anthropics/skills Repository](https://github.com/anthropics/skills)
- [anthropics/claude-code Repository](https://github.com/anthropics/claude-code)
- [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official)
- [Skills Explained Blog Post](https://claude.com/blog/skills-explained)
- [Claude Code Plugins Blog Post](https://claude.com/blog/claude-code-plugins)
- [Hooks Configuration Guide](https://claude.com/blog/how-to-configure-hooks)
- [Agent Skills API Docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Building Agents with Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)

### MCP Ecosystem
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Glama.ai MCP Registry](https://glama.ai/mcp/servers)
- [Smithery AI](https://workos.com/blog/smithery-ai)
- [Playwright MCP (Microsoft)](https://github.com/microsoft/playwright-mcp)
- [MCP Memory Server](https://github.com/modelcontextprotocol/servers)
- [Build MCP Server Guide](https://modelcontextprotocol.io/docs/develop/build-server)
- [MCP 2025 Year in Review](https://www.pento.ai/blog/a-year-of-mcp-2025-review)

### Community Resources
- [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
- [awesome-claude-skills (travisvn)](https://github.com/travisvn/awesome-claude-skills)
- [awesome-claude-plugins](https://github.com/ComposioHQ/awesome-claude-plugins)
- [awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents)
- [claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery)
- [claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability)
- [claude-code-skill-factory](https://github.com/alirezarezvani/claude-code-skill-factory)
- [everything-claude-code](https://github.com/affaan-m/everything-claude-code)

### Guides and Articles
- [Complete Guide to CLAUDE.md (Builder.io)](https://www.builder.io/blog/claude-md-guide)
- [Writing a Good CLAUDE.md (HumanLayer)](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
- [Claude Agent Skills Deep Dive](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/)
- [Inside Claude Code Skills (Mikhail Shilkov)](https://mikhail.io/2025/10/claude-code-skills/)
- [ClaudeLog Docs and Tutorials](https://claudelog.com/)
- [Addy Osmani's AI Coding Workflow 2026](https://addyosmani.com/blog/ai-coding-workflow/)
- [Claude Code Best Practices (eesel.ai)](https://www.eesel.ai/blog/claude-code-best-practices)
- [Claude Skills and CLAUDE.md Guide 2026 (gend.co)](https://www.gend.co/blog/claude-skills-claude-md-guide)
