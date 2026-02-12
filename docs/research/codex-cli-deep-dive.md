# OpenAI Codex CLI Deep Dive: Internals for Transcript Analysis

> Exhaustive technical research into OpenAI Codex CLI's internal data structures, session formats, configuration system, and extension points. This document is designed to enable first-class Codex CLI support in LLREM alongside Claude Code.

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Session Storage and Rollout JSONL Format](#2-session-storage-and-rollout-jsonl-format)
3. [AGENTS.md Instruction System](#3-agentsmd-instruction-system)
4. [config.toml Complete Schema](#4-configtoml-complete-schema)
5. [Tool Use and Logging](#5-tool-use-and-logging)
6. [Session Resumption](#6-session-resumption)
7. [History File](#7-history-file)
8. [Hooks and Extensibility](#8-hooks-and-extensibility)
9. [Sandbox and Approval Model](#9-sandbox-and-approval-model)
10. [MCP Support](#10-mcp-support)
11. [Parser Compatibility with Claude Code](#11-parser-compatibility-with-claude-code)
12. [Community Tools and Real Examples](#12-community-tools-and-real-examples)
13. [Cross-Agent Configuration Strategy](#13-cross-agent-configuration-strategy)
14. [LLREM Implementation Recommendations](#14-llrem-implementation-recommendations)
15. [Sources](#15-sources)

---

## 1. Architecture Overview

### 1.1 Codebase and Language

Codex CLI was originally written in TypeScript/Node.js using React (ink) for the TUI, meow for argument parsing, and the `openai` Node.js SDK. In June 2025, OpenAI announced a full rewrite in Rust under the `codex-rs/` directory, organized as a Cargo workspace with 52+ crates. As of early 2026, the Rust version is the primary codebase and ships as the default binary.

**Key architectural layers (Rust):**

| Layer | Crate | Purpose |
|-------|-------|---------|
| Core library | `codex-core` | Session, ThreadManager, ModelClient, tool execution, rollout persistence |
| Protocol | `codex-rs/protocol` | Wire protocol types: `Op` (submission queue), `EventMsg` (event queue), `RolloutItem` |
| TUI | `codex-rs/tui` | Interactive terminal UI (Ratatui-based) |
| Exec | `codex-rs/exec` | Non-interactive `codex exec` mode |
| App Server | `codex-rs/app-server` | JSON-RPC server for IDE integration |
| MCP Server | `codex-mcp-server` | Runs Codex as an MCP server |

**Key files for LLREM parser development:**
- `codex-rs/core/src/protocol.rs` - Defines `Op`, `EventMsg`, and `RolloutItem` enums
- `codex-rs/core/src/rollout_recorder.rs` - JSONL persistence logic
- `codex-rs/core/src/session.rs` - Session state management
- `codex-rs/core/src/config.rs` - Configuration loading and layering

### 1.2 Directory Structure

```
~/.codex/                              # CODEX_HOME (configurable via $CODEX_HOME)
├── config.toml                        # User-level configuration
├── AGENTS.md                          # Global instructions
├── AGENTS.override.md                 # Override instructions (higher priority)
├── auth.json                          # Cached API credentials (when not using keychain)
├── history.jsonl                      # Unified command/session history
├── sessions/                          # Per-session rollout files
│   └── YYYY/MM/DD/
│       └── rollout-<timestamp>-<id>.jsonl
├── archived_sessions/                 # Archived/old sessions
├── codex-tui.log                      # TUI debug log
└── instructions/                      # Additional instruction files

<project-root>/
├── AGENTS.md                          # Project-level instructions
├── AGENTS.override.md                 # Project-level override
├── .codex/
│   └── config.toml                    # Project-scoped config overrides
└── .agents/
    └── skills/                        # Project-level agent skills
```

### 1.3 API Integration

Codex CLI uses the OpenAI **Responses API** (`/responses` endpoint), not the Chat Completions API. This is significant because:

- Tool calls use `function_call` / `function_call_output` response item types (not `tool_use` / `tool_result` like Anthropic)
- The primary tool is `shell` (or `container.exec`) for command execution
- File editing uses `apply_patch` via the shell tool with a specific patch format
- Response items include: `message`, `function_call`, `function_call_output`, `reasoning`

---

## 2. Session Storage and Rollout JSONL Format

### 2.1 Storage Location

Sessions are stored as JSONL "rollout" files at:
```
$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<timestamp>-<id>.jsonl
```

The date-based directory structure (`YYYY/MM/DD/`) differs from Claude Code's flat project-based structure (`~/.claude/projects/<project-dir>/<session-uuid>.jsonl`).

### 2.2 RolloutItem Enum (Five Types)

Every line in a rollout JSONL file is a `RolloutItem`, defined as a Rust enum with five variants (from `codex-rs/protocol/src/protocol.rs`):

| Variant | Purpose | When Written |
|---------|---------|--------------|
| `SessionMeta` | Session metadata header | First line of every rollout file |
| `UserMessage` | User's input text | When user submits a prompt |
| `ResponseItem` | Model/agent responses | For each response item from the API |
| `EventMsg` | Agent event messages | Streaming deltas, token counts, approvals, completion signals |
| `CompactedItem` | Compacted history | When context compaction occurs |

### 2.3 Record Format Details

**Note on format evolution:** Earlier versions of Codex wrote bare `SessionMeta` and `ResponseItem` JSON objects directly. The current format wraps every line in a `RolloutLine` envelope with `type` and `payload` fields. The rollout recorder handles backward compatibility with the legacy bare format.

#### SessionMeta (Line 1 - Header)

```json
{
  "type": "session_meta",
  "session_id": "sess_abc123def456",
  "source": "cli",
  "timestamp": "2025-10-15T14:30:00.000Z",
  "model_provider": "openai",
  "model": "gpt-5-codex",
  "cwd": "/Users/user/project",
  "conversation_id": "conv_xyz789"
}
```

Key differences from Claude Code:
- `source` field (`"cli"`, `"ide"`, `"exec"`) - no equivalent in Claude Code
- `model_provider` - Codex supports multiple providers; Claude Code is Anthropic-only
- `conversation_id` - Used for the Responses API's `previous_response_id` chaining
- No `gitBranch` in the header (Claude Code tracks this per-message)

#### UserMessage

```json
{
  "type": "user_message",
  "content": "Fix the failing test in auth.test.ts",
  "timestamp": "2025-10-15T14:30:05.000Z"
}
```

Much simpler than Claude Code's user messages, which carry `parentUuid`, `isSidechain`, `userType`, `cwd`, `sessionId`, `version`, `gitBranch`, and the full API message payload.

#### ResponseItem

Response items mirror the OpenAI Responses API item types:

**Agent Message (text response):**
```json
{
  "type": "response_item",
  "item": {
    "id": "item_1",
    "type": "agent_message",
    "text": "I'll look at the failing test and fix it.",
    "status": "completed"
  },
  "timestamp": "2025-10-15T14:30:10.000Z"
}
```

**Function Call (tool invocation):**
```json
{
  "type": "response_item",
  "item": {
    "id": "item_2",
    "type": "function_call",
    "name": "shell",
    "arguments": "{\"cmd\":[\"cat\",\"auth.test.ts\"]}",
    "call_id": "call_abc123",
    "status": "completed"
  },
  "timestamp": "2025-10-15T14:30:12.000Z"
}
```

**Function Call Output (tool result):**
```json
{
  "type": "response_item",
  "item": {
    "id": "item_3",
    "type": "function_call_output",
    "call_id": "call_abc123",
    "output": "{\"output\": \"/* file contents... */\", \"metadata\": {\"exit_code\": 0, \"duration_ms\": 150}}"
  },
  "timestamp": "2025-10-15T14:30:13.000Z"
}
```

**Reasoning (model thinking):**
```json
{
  "type": "response_item",
  "item": {
    "id": "item_4",
    "type": "reasoning",
    "summary": "The test expects a different return value after the recent refactor..."
  },
  "timestamp": "2025-10-15T14:30:11.000Z"
}
```

**Command Execution (higher-level representation):**
```json
{
  "type": "response_item",
  "item": {
    "id": "item_5",
    "type": "command_execution",
    "command": "bash -lc cat auth.test.ts",
    "status": "completed"
  },
  "timestamp": "2025-10-15T14:30:12.000Z"
}
```

#### EventMsg

EventMsg records represent streaming events and operational signals:

**Token Count (added in commit 0269096, September 2025):**
```json
{
  "type": "event_msg",
  "payload": {
    "type": "token_count",
    "total_token_usage": {
      "input_tokens": 15000,
      "output_tokens": 3500,
      "cached_input_tokens": 8000,
      "reasoning_tokens": 500,
      "total_tokens": 19000
    },
    "last_token_usage": {
      "input_tokens": 2000,
      "output_tokens": 500,
      "cached_input_tokens": 1500,
      "reasoning_tokens": 100,
      "total_tokens": 2600
    },
    "model_context_window": 128000
  },
  "timestamp": "2025-10-15T14:30:15.000Z"
}
```

**Important:** `total_token_usage` is **cumulative** within the session. To get per-turn usage, subtract the previous `total_token_usage` from the current one. The `last_token_usage` field, when present, provides per-turn deltas directly.

**Turn Started:**
```json
{
  "type": "event_msg",
  "payload": {
    "type": "turn_started"
  },
  "timestamp": "2025-10-15T14:30:05.000Z"
}
```

**Turn Complete:**
```json
{
  "type": "event_msg",
  "payload": {
    "type": "turn_complete",
    "response_id": "resp_abc123"
  },
  "timestamp": "2025-10-15T14:30:20.000Z"
}
```

**Context Compacted:**
```json
{
  "type": "event_msg",
  "payload": {
    "type": "context_compacted"
  },
  "timestamp": "2025-10-15T15:45:00.000Z"
}
```

**Other EventMsg types include:**
- `approval_requested` - When sandbox/permission approval is needed
- `agent_message_delta` - Streaming text deltas
- `list_skills_response` - Response to skills listing
- `error` - Error events

### 2.4 Comparison: Codex CLI vs Claude Code JSONL

| Feature | Codex CLI Rollout | Claude Code JSONL |
|---------|------------------|-------------------|
| **File location** | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | `~/.claude/projects/<project-dir>/<session-uuid>.jsonl` |
| **Envelope format** | `RolloutLine { type, payload }` | Flat JSON with `type` field |
| **Session metadata** | `session_meta` (first line) | Implicit from first message's `sessionId` |
| **User messages** | `user_message` (text only) | `type: "user"` with full envelope (uuid, cwd, branch, etc.) |
| **Assistant responses** | `response_item` with sub-types | `type: "assistant"` with full API response |
| **Tool calls** | `function_call` / `function_call_output` | Embedded in assistant `content[]` as `tool_use` |
| **Tool results** | Separate `function_call_output` item | User message with `tool_result` content |
| **Token tracking** | `event_msg` with cumulative `token_count` | Per-message `usage` in assistant response |
| **Cost tracking** | Not built-in (requires external pricing) | `cost_usd` per response (in SQLite) |
| **Context compaction** | `event_msg { type: "context_compacted" }` | `isCompactSummary: true` flag |
| **Conversation tree** | Linear (no branching) | Tree via `parentUuid` + `isSidechain` |
| **System messages** | Not a separate type | `type: "system"` with hook output |
| **Summary records** | Not present | `type: "summary"` |
| **Git branch** | Not tracked per-message | `gitBranch` on every message |
| **Working directory** | In `session_meta` only | Per-message `cwd` |

### 2.5 Non-Interactive (exec) JSON Output

When running `codex exec --json`, Codex streams JSONL events to stdout with a different schema than rollout files:

```json
{"type": "thread.started", "thread_id": "thread_abc", "timestamp": "..."}
{"type": "turn.started", "turn_id": "turn_1", "timestamp": "..."}
{"type": "item.started", "item": {"id": "item_1", "type": "command_execution", "command": "bash -lc ls", "status": "in_progress"}}
{"type": "item.completed", "item": {"id": "item_1", "type": "command_execution", "command": "bash -lc ls", "status": "completed"}}
{"type": "item.completed", "item": {"id": "item_3", "type": "agent_message", "text": "Repo contains docs, sdk, and examples directories."}}
{"type": "turn.completed", "turn_id": "turn_1", "timestamp": "..."}
```

**Item types in exec output:**
- `agent_message` - Text responses
- `command_execution` - Shell command execution
- `file_edit` - File modifications
- `reasoning` - Model reasoning/thinking
- `web_search` - Web search queries
- `mcp_tool_call` - MCP tool invocations
- `plan_update` - Plan step updates

---

## 3. AGENTS.md Instruction System

### 3.1 File Discovery and Precedence

Codex builds an instruction chain **once per session** (at startup). The discovery algorithm is:

**Step 1: Global scope** (`$CODEX_HOME`, defaults to `~/.codex/`)
1. Check for `AGENTS.override.md` -- if non-empty, use it and skip step 2
2. Check for `AGENTS.md` -- use the first non-empty file found
3. Only one file is used at this level

**Step 2: Project scope** (from project root to current working directory)
1. Find the project root (typically the Git root via `.git`)
2. Walk each directory from root to cwd
3. In each directory, check in order:
   - `AGENTS.override.md`
   - `AGENTS.md`
   - Any filenames in `project_doc_fallback_filenames` config
4. Include at most **one file per directory**
5. Stop at the current working directory

**If no project root is found**, Codex only checks the current directory.

### 3.2 Injection Format

Each discovered file becomes its own **user-role message** injected near the top of the conversation history, before the user's prompt:

```
# AGENTS.md instructions for <directory>

<file contents>
```

The `<directory>` is relative to the repo root. Messages are injected in **root-to-leaf order**: global instructions first, then repo root, then each deeper directory.

### 3.3 Fallback Filenames

The `project_doc_fallback_filenames` config key defines additional filenames to check when AGENTS.md is not present. The built-in defaults include:

```toml
project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md"]
```

**Critical for LLREM:** `CLAUDE.md` is NOT in the default fallback list (contrary to what our baseline research suggested). However, users can add it:

```toml
project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md", "CLAUDE.md"]
```

### 3.4 Size Limits

| Setting | Default | Description |
|---------|---------|-------------|
| `project_doc_max_bytes` | 32768 (32 KiB) | Maximum combined bytes from all AGENTS.md files |

When the combined size reaches `project_doc_max_bytes`, Codex stops adding files. Empty files are skipped. Files that exceed the limit are silently truncated without warning in the TUI (this is a known issue: [#7138](https://github.com/openai/codex/issues/7138)).

To increase the limit:
```toml
project_doc_max_bytes = 65536  # 64 KiB
```

### 3.5 Override Mechanism

`AGENTS.override.md` is the highest-priority mechanism:
- Use `~/.codex/AGENTS.override.md` for temporary global overrides without deleting the base file
- Use `<project>/AGENTS.override.md` for project-level overrides
- Remove the override file to restore shared guidance

### 3.6 Child Agents Feature Flag

When the `child_agents_md` feature flag is enabled (via `[features]` in config.toml), Codex appends additional guidance about AGENTS.md scope and precedence to the user instructions message, and emits that message even when no AGENTS.md is present.

### 3.7 AGENTS.md as an Open Standard

AGENTS.md has evolved beyond just Codex CLI. It is now an open standard stewarded by the **Agentic AI Foundation** under the Linux Foundation, supported by Google, OpenAI, Factory, Sourcegraph, Cursor, Amp, RooCode, Zed, Warp, Kilo Code, and 60,000+ open-source projects.

The format is plain Markdown with no required structure -- agents parse the text content directly. This means AGENTS.md files can serve as cross-agent instruction files that work with Codex CLI, Cursor, Amp, and other supporting tools simultaneously.

### 3.8 Comparison with Claude Code's CLAUDE.md

| Feature | Codex CLI AGENTS.md | Claude Code CLAUDE.md |
|---------|--------------------|-----------------------|
| **Format** | Plain Markdown | Plain Markdown |
| **Global location** | `~/.codex/AGENTS.md` | `~/.claude/CLAUDE.md` |
| **Project location** | `<project>/AGENTS.md` | `<project>/CLAUDE.md` |
| **Hierarchical** | Yes (walks root to cwd) | Yes (user > project > local) |
| **Override** | `AGENTS.override.md` | No direct equivalent |
| **Fallback** | Configurable `fallback_filenames` | Not configurable |
| **Size limit** | 32 KiB combined (configurable) | No documented hard limit |
| **Injection** | User-role messages, root-to-leaf | System context |
| **Cross-agent** | Yes (open standard) | Codex can read CLAUDE.md via fallback config |

---

## 4. config.toml Complete Schema

### 4.1 Configuration Hierarchy

Codex loads configuration in this order (later overrides earlier):

1. Built-in defaults
2. `~/.codex/config.toml` (user-level)
3. `<project>/.codex/config.toml` (project-scoped, only for trusted projects)
4. CLI flags and environment variables

JSON Schema is available at: `https://developers.openai.com/codex/config-schema.json`

Add this to the top of your config.toml for IDE autocompletion:
```toml
#:schema https://developers.openai.com/codex/config-schema.json
```

### 4.2 Complete Configuration Reference

```toml
#:schema https://developers.openai.com/codex/config-schema.json

# ─── Core Model ───────────────────────────────────────────────
model = "gpt-5-codex"                          # Primary model for Codex

# ─── Approval & Sandbox ──────────────────────────────────────
# When Codex pauses for approval before executing commands.
# Values: "untrusted" | "on-failure" | "on-request" (default) | "never"
approval_policy = "on-request"

# Filesystem/network sandbox policy.
# Values: "read-only" (default) | "workspace-write" | "danger-full-access"
sandbox_mode = "read-only"

# ─── Model Provider ──────────────────────────────────────────
model_provider = "openai"                      # Provider ID
model_provider_url = ""                        # Custom API base URL

# ─── Web Search ──────────────────────────────────────────────
# Values: "disabled" | "cached" | "live"
web_search = "disabled"

# ─── Project Documentation ───────────────────────────────────
project_doc_max_bytes = 32768                  # Max bytes from AGENTS.md files (32 KiB)
project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md"]

# ─── Developer Instructions ──────────────────────────────────
# Additional inline instructions injected into the session
instructions = ""

# ─── Credential Storage ──────────────────────────────────────
# "file" (auth.json) or "keychain" (OS keychain)
credential_storage = "file"

# ─── Check for Updates ───────────────────────────────────────
check_for_updates = true

# ─── Shell ────────────────────────────────────────────────────
shell_snapshot = false                         # Capture shell environment snapshots

# ─── Sandbox Details (workspace-write mode) ───────────────────
[sandbox]
writable_roots = []                            # Additional writable directories
network_access = false                         # Allow outbound network
# tmp_exclude = false                          # Exclude tmp directories

# ─── History ──────────────────────────────────────────────────
[history]
persistence = true                             # Save session transcripts to history.jsonl
max_bytes = 10485760                           # 10 MB cap; oldest entries dropped
# save_tool_output_token_limit = 10000         # Token budget for tool output storage

# ─── History Compaction ───────────────────────────────────────
# Token threshold that triggers automatic history compaction
# model_auto_compact_token_limit = <unset, uses model defaults>
# history_compacted_prompt = ""                # Inline override for compaction prompt

# ─── TUI Settings ────────────────────────────────────────────
[tui]
animations = true                              # Welcome screen, shimmer, spinner
show_tooltips = true                           # Onboarding tooltips
alternate_screen = false                       # Use alternate terminal screen
# notifications = true                         # Enable TUI notifications
# Or filter: notifications = ["agent-turn-complete", "approval-requested"]

# ─── External Notification ───────────────────────────────────
# notify = "/path/to/notifier"                 # External program for notifications
# Receives JSON: {notification_type, last-assistant-message, input-messages, thread-id}

# ─── Logging ──────────────────────────────────────────────────
# log_dir = ""                                 # Custom log file directory

# ─── Features (toggle optional/experimental capabilities) ────
[features]
# shell_tool = true                            # Default shell tool (stable, on by default)
# pty_exec = false                             # Unified PTY-backed exec tool (beta)
# bwrap_sandbox = false                        # Bubblewrap Linux sandbox (experimental)
# shell_snapshot = false                       # Shell env snapshots
# child_agents_md = false                      # Enhanced AGENTS.md awareness
# feedback = true                              # /feedback command

# ─── Skills ──────────────────────────────────────────────────
# Per-skill enablement overrides
# [skills.<skill-name>]
# enabled = true | false

# ─── OpenTelemetry ───────────────────────────────────────────
[otel]
# Exporter: "none" (default) | "otlp-http" | "otlp-grpc"
exporter = "none"

# [otel.exporter_config]
# endpoint = "https://otel.example.com/v1/logs"
# protocol = "binary"
# headers = { "x-otlp-api-key" = "..." }

# Trace exporter: "none" | "otlp-http" | "otlp-grpc"
# trace_exporter = "none"

# ─── MCP Servers ─────────────────────────────────────────────
# [mcp_servers.<server-name>]
# type = "stdio"                               # "stdio" or "streamable-http"
# command = "npx"                              # Command to start server
# args = ["-y", "@my/mcp-server"]              # Command arguments
# env = { API_KEY = "..." }                    # Environment variables
# enabled = true                               # Enable/disable without deleting
# startup_timeout_sec = 10                     # Server start timeout
# tool_timeout_sec = 60                        # Tool execution timeout
# bearer_token_env_var = ""                    # Env var for bearer token
# http_headers = {}                            # Static HTTP headers

# ─── Feedback ────────────────────────────────────────────────
[feedback]
enabled = true                                 # Enable /feedback command

# ─── Notice ──────────────────────────────────────────────────
[notice]
# In-product notices configuration
```

### 4.3 Optimization Opportunities for LLREM

LLREM can suggest optimizations for several config.toml settings:

| Setting | Optimization | Detection Signal |
|---------|-------------|-----------------|
| `model` | Recommend model upgrades/changes | Pattern analysis of task complexity |
| `approval_policy` | Suggest `"on-failure"` for trusted projects | Frequent approval interruptions |
| `sandbox_mode` | Suggest `"workspace-write"` with specific `writable_roots` | Permission errors in transcripts |
| `project_doc_max_bytes` | Increase if AGENTS.md is truncated | Large AGENTS.md files detected |
| `project_doc_fallback_filenames` | Add `"CLAUDE.md"` for cross-agent support | Detect CLAUDE.md in project |
| `web_search` | Enable if model lacks project context | Web search failures or hallucinations |
| `history.max_bytes` | Increase for power users | History rotation detected |
| `tool_output_token_limit` | Increase for projects with large files | Truncated tool outputs in transcript |
| MCP servers | Suggest useful MCP servers | Task patterns requiring external tools |

---

## 5. Tool Use and Logging

### 5.1 Built-in Tools

Codex CLI has a single primary built-in tool:

| Tool Name | Type | Description |
|-----------|------|-------------|
| `shell` | `function_call` | Runs shell commands; also aliased as `container.exec` in hosted environments |

All file operations are performed through the `shell` tool using the `apply_patch` mechanism:

```json
{
  "type": "function_call",
  "name": "shell",
  "arguments": "{\"cmd\":[\"apply_patch\",\"*** Begin Patch\\n--- a/file.ts\\n+++ b/file.ts\\n@@ -10,3 +10,4 @@\\n old line\\n+new line\\n\"]}"
}
```

The `apply_patch` command is intercepted by Codex and processed natively (not actually run in a shell). This is fundamentally different from Claude Code, which has distinct tools: `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `TodoRead`, `TodoWrite`, `WebFetch`, `WebSearch`, `mcp__*`.

### 5.2 Tool Call Logging in Rollout Files

Tool calls are logged as `response_item` records with `function_call` type:

```json
{"type": "response_item", "item": {"id": "item_2", "type": "function_call", "name": "shell", "arguments": "{\"cmd\":[\"cat\",\"src/index.ts\"]}", "call_id": "call_abc", "status": "completed"}, "timestamp": "..."}
```

Tool results are logged as `response_item` records with `function_call_output` type:

```json
{"type": "response_item", "item": {"id": "item_3", "type": "function_call_output", "call_id": "call_abc", "output": "{\"output\": \"console.log('hello');\", \"metadata\": {\"exit_code\": 0, \"duration_ms\": 45}}"}, "timestamp": "..."}
```

### 5.3 Tool Output Format

The `output` field in `function_call_output` is a JSON string containing:

```json
{
  "output": "<stdout content>",
  "metadata": {
    "exit_code": 0,
    "duration_ms": 150,
    // Additional metadata varies by tool type
  }
}
```

### 5.4 Comparison: Tool Logging (Codex vs Claude Code)

| Aspect | Codex CLI | Claude Code |
|--------|-----------|-------------|
| **Tool call format** | `function_call` response item | `tool_use` in assistant `content[]` |
| **Tool result format** | Separate `function_call_output` item | User message with `tool_result` content type |
| **Tool name** | `shell` (single tool) | `Bash`, `Read`, `Write`, `Edit`, etc. |
| **File operations** | Via `shell` + `apply_patch` | Separate `Read`, `Write`, `Edit` tools |
| **Stdout/stderr** | In `output` JSON string | Separate `stdout`/`stderr` fields in `toolUseResult` |
| **Exit code** | In `metadata.exit_code` | Not explicitly tracked (inferred from `is_error`) |
| **Tool duration** | In `metadata.duration_ms` | Not in tool result (tracked at message level as `duration_ms`) |
| **Error flag** | `exit_code != 0` | `is_error: true` in tool_result |
| **MCP tools** | `mcp_tool_call` item type | `mcp__<server>__<tool>` name prefix |

### 5.5 Token Tracking in Tool Outputs

Codex has a `tool_output_token_limit` setting (default: 10,000 tokens for gpt-5.2-codex) that controls how much tool output is preserved in the conversation history. Tool outputs exceeding this limit are truncated. This is important for transcript analysis because large file reads may appear incomplete in the rollout file.

---

## 6. Session Resumption

### 6.1 How --resume Works

Codex supports resuming sessions through multiple mechanisms:

```bash
# Resume the most recent session from the current directory
codex --resume last

# Resume a specific session by ID
codex --resume <session-id>

# Interactive picker
codex --resume

# Non-interactive resume
codex exec --resume <session-id> "continue working on..."
```

### 6.2 State Reconstruction Process

When resuming a session:

1. **Locate the rollout file** by session ID, by selecting the most recent, or through an interactive picker
2. **Load the JSONL file** from the sessions directory
3. **Reconstruct conversation state** by replaying rollout items via `reconstruct_history_from_rollout()`
4. **Rebuild the ConversationHistory** including all messages, tool calls, and context
5. **Append new content** to the existing rollout file (no new file is created)

### 6.3 Impact on Transcript Analysis

Session resumption creates important considerations for LLREM:

1. **Rollout files can grow across multiple invocations** - A single `.jsonl` file may represent multiple interactive sessions separated by time gaps
2. **Context compaction events** mark where earlier history was summarized - The full pre-compaction history is still in the file, but was not in the model's context when later turns occurred
3. **`CompactedItem` records** represent the compacted history state - These contain the summarized context that replaced the full history
4. **Forking** - Codex also supports forking sessions (`codex --fork <session-id>`), creating new rollout files that start with the original session's state

### 6.4 Ephemeral Mode

Running `codex exec --ephemeral` or `codex --ephemeral` prevents rollout files from being persisted to disk. This means some sessions may not be available for analysis.

---

## 7. History File

### 7.1 Location and Purpose

The unified history file lives at `$CODEX_HOME/history.jsonl` (default: `~/.codex/history.jsonl`).

This is distinct from the per-session rollout files in `sessions/`. The history file provides a cross-session index of commands and activity.

### 7.2 Configuration

```toml
[history]
persistence = true       # Set to "none" to disable
max_bytes = 10485760     # 10 MB cap (default)
```

### 7.3 Rotation and Compaction

When `history.jsonl` exceeds `max_bytes`:
- Codex **drops the oldest entries** and compacts the file
- Only the **newest records** are kept
- This is a destructive operation - old data is lost
- No backup/archive is created automatically

This is simpler than Claude Code's approach where each session gets its own permanent JSONL file and is never truncated.

### 7.4 Relationship to Rollout Files

| File | Purpose | Retention |
|------|---------|-----------|
| `history.jsonl` | Cross-session command history index | Capped at `max_bytes`, oldest dropped |
| `sessions/YYYY/MM/DD/rollout-*.jsonl` | Full per-session transcript | Persistent until manually archived/deleted |
| `archived_sessions/` | Manually archived sessions | Permanent |

For LLREM transcript analysis, the **rollout files** are the primary data source. The history file is supplementary and may be useful for session discovery/indexing.

---

## 8. Hooks and Extensibility

### 8.1 Current State

As of early 2026, Codex CLI does **not** have a fully developed hooks system comparable to Claude Code's. The extensibility landscape:

**What exists:**

| Extension Point | Status | Description |
|----------------|--------|-------------|
| `notify` config | Stable | External program invoked for notifications |
| `tui.notifications` | Stable | Built-in TUI notifications with event filtering |
| MCP servers | Stable | External tool servers for extending capabilities |
| Skills | Stable | `.agents/skills/` directories for custom agent capabilities |
| OpenTelemetry | Stable | Structured telemetry export for monitoring |
| `codex exec --json` | Stable | JSONL event stream for scripting/automation |

**What is proposed (RFC/Discussion stage):**

| Extension Point | Status | Reference |
|----------------|--------|-----------|
| Lifecycle hooks (beforePlan, afterCode, onError) | RFC | [#2582](https://github.com/openai/codex/issues/2582) |
| codex.yaml plugin configuration | RFC | [#2582](https://github.com/openai/codex/issues/2582) |
| Pre/post tool execution hooks | PR | [#9796](https://github.com/openai/codex/pull/9796) |
| File write hooks | PR | [#9796](https://github.com/openai/codex/pull/9796) |
| Event hooks (prompt gating, stop, compact) | PR | [#9796](https://github.com/openai/codex/pull/9796) |

### 8.2 Notify Configuration

The `notify` setting runs an external program when Codex emits supported events:

```toml
notify = "/path/to/notifier"
```

The notifier receives a single JSON argument:
```json
{
  "notification_type": "agent-turn-complete",
  "last-assistant-message": "I've fixed the failing test.",
  "input-messages": [...],
  "thread-id": "thread_abc"
}
```

Supported notification types:
- `agent-turn-complete` - Agent finished a turn
- `approval-requested` - Sandbox/permission approval needed

### 8.3 Comparison with Claude Code Hooks

| Feature | Claude Code | Codex CLI |
|---------|------------|-----------|
| **Hook system** | Mature, 7 event types | Basic `notify` only; full hooks in PR |
| **UserPromptSubmit** | Yes | Not yet |
| **PreToolUse** | Yes | In PR #9796 |
| **PostToolUse** | Yes | In PR #9796 |
| **Stop** | Yes | `notify` with `agent-turn-complete` |
| **SubagentStop** | Yes | Not yet |
| **PreCompact** | Yes | Not yet |
| **Notification** | Yes | `notify` config |
| **Hook receives stdin JSON** | Yes | `notify` receives JSON arg |
| **Hook can modify behavior** | Yes (stdout as system message) | Not yet |
| **Config location** | `settings.json` hooks section | `config.toml` notify key |

### 8.4 LLREM Integration Points

Since Codex CLI lacks Claude Code's hook system, LLREM integration options are:

1. **Post-session analysis** - Parse rollout files after sessions complete (primary approach)
2. **OpenTelemetry export** - Configure OTEL to send structured events to LLREM
3. **notify script** - Use as a lightweight hook for session-end triggers
4. **MCP server** - Run LLREM as an MCP server that Codex can call for analysis
5. **codex exec --json pipe** - Process streaming events in real-time

---

## 9. Sandbox and Approval Model

### 9.1 Approval Policies

| Policy | Behavior |
|--------|----------|
| `untrusted` | Most conservative; asks before all writes and commands |
| `on-failure` | Approvals required only when commands fail |
| `on-request` | Default; asks for certain operations |
| `never` | No approvals; combined with `--yolo` for zero restrictions |

The `--yolo` flag (`--dangerously-bypass-approvals-and-sandbox`) disables both approvals and sandboxing entirely.

### 9.2 Sandbox Modes

| Mode | Filesystem | Network | Use Case |
|------|-----------|---------|----------|
| `read-only` | Read-only access | No network | Safest; for exploration/analysis |
| `workspace-write` | Write to project + `writable_roots` | Configurable | Standard development |
| `danger-full-access` | Full filesystem access | Full network | Unrestricted (use with caution) |

### 9.3 Permission Events in Logs

Permission/approval events are logged in the rollout files as `event_msg` records:

```json
{
  "type": "event_msg",
  "payload": {
    "type": "approval_requested",
    "tool": "shell",
    "command": "npm install lodash",
    "reason": "network_access"
  },
  "timestamp": "..."
}
```

Additionally, OpenTelemetry events include per-event fields for:
- `sandbox_mode` - Current sandbox configuration
- `approval_settings` - Active approval policy
- Tool approval decisions (approved/denied)
- Tool results

### 9.4 Session-Scoped Approvals

Codex supports "Allow and remember" for MCP/App tool approvals. Once a tool is approved during a session, subsequent calls to the same tool are auto-approved for the remainder of that session.

### 9.5 Interactive Permission Management

The `/permissions` command in the TUI allows switching to read-only mode mid-session for chat/planning without making changes.

### 9.6 Comparison with Claude Code Permissions

| Feature | Claude Code | Codex CLI |
|---------|------------|-----------|
| **Permission model** | Per-tool allow/deny lists | Global policy + sandbox |
| **Storage** | `settings.local.json` permissions | `config.toml` approval/sandbox |
| **Granularity** | Individual tool + pattern matching | Policy-based (all-or-nothing per mode) |
| **Persistence** | Persistent allow rules | Session-scoped "remember" |
| **Permission mode** | `acceptEdits` / other modes | `read-only` / `workspace-write` / `full-access` |
| **Logged** | System messages in JSONL | `event_msg` in rollout |

---

## 10. MCP Support

### 10.1 MCP in Codex CLI

Codex CLI has full MCP support for both consuming MCP servers and running as an MCP server itself.

**Supported transports:**
- STDIO servers (local process)
- Streamable HTTP servers (remote, with optional OAuth)

### 10.2 Configuration

MCP servers are configured in `config.toml`:

```toml
[mcp_servers.playwright]
type = "stdio"
command = "npx"
args = ["-y", "@anthropic-ai/mcp-server-playwright"]
startup_timeout_sec = 15
tool_timeout_sec = 120
enabled = true

[mcp_servers.github]
type = "streamable-http"
command = "https://mcp.github.com/v1"
bearer_token_env_var = "GITHUB_TOKEN"
```

Or managed via CLI:
```bash
codex mcp add playwright -- npx -y @anthropic-ai/mcp-server-playwright
codex mcp add github --type streamable-http --url https://mcp.github.com/v1
codex mcp list
codex mcp remove playwright
```

### 10.3 MCP Tool Call Logging

MCP tool calls appear in rollout files as `function_call` items with the MCP-namespaced tool name:

```json
{
  "type": "response_item",
  "item": {
    "type": "function_call",
    "name": "mcp_playwright_navigate",
    "arguments": "{\"url\": \"http://localhost:3000\"}",
    "call_id": "call_mcp_1"
  }
}
```

In `codex exec --json` output, MCP tool calls appear as `mcp_tool_call` item type.

### 10.4 Codex as MCP Server

Codex itself can run as an MCP server, allowing other MCP clients (including agents built with the OpenAI Agents SDK) to connect to it:

```bash
codex mcp serve
```

### 10.5 MCP Configuration Comparison

| Feature | Claude Code | Codex CLI |
|---------|------------|-----------|
| **Config location** | `.claude.json` / `settings.json` | `config.toml` `[mcp_servers]` |
| **Config format** | JSON | TOML |
| **STDIO support** | Yes | Yes |
| **Streamable HTTP** | No | Yes |
| **OAuth support** | No | Yes (streamable HTTP only) |
| **CLI management** | Manual JSON editing | `codex mcp add/remove/list` |
| **Tool naming** | `mcp__<server>__<tool>` | `mcp_<server>_<tool>` |
| **Timeout config** | Not configurable | `startup_timeout_sec`, `tool_timeout_sec` |
| **Act as MCP server** | No | Yes (`codex mcp serve`) |

---

## 11. Parser Compatibility with Claude Code

### 11.1 Shared Parser Code Potential

Given the structural analysis above, here is the assessment of parser code reuse between Claude Code and Codex CLI:

**High Reuse Potential:**
- JSONL file reading and line-by-line parsing infrastructure
- Timestamp parsing (both use ISO 8601)
- Session boundary detection
- Token usage aggregation logic
- Error detection patterns (stderr, non-zero exit codes)
- Context compaction event tracking

**Medium Reuse Potential:**
- Tool call extraction (different schemas but similar concepts)
- Message role normalization (user/assistant mapping)
- Session metrics calculation

**Low Reuse Potential (Agent-Specific):**
- Record type parsing (completely different schemas)
- Tool name normalization (`shell` vs `Bash`/`Read`/`Write`/`Edit`)
- Conversation tree handling (Codex is linear; Claude Code has branching)
- Git branch tracking (Claude Code per-message; Codex in session meta only)
- Cost calculation (Claude Code has per-message cost; Codex requires external pricing)
- Working directory tracking (Claude Code per-message; Codex in session meta)

### 11.2 Normalized Data Model Mapping

```typescript
// Mapping Codex CLI rollout items to LLREM's NormalizedSession

// SessionMeta -> NormalizedSession metadata
interface CodexSessionMapping {
  sessionId: sessionMeta.session_id;
  projectPath: sessionMeta.cwd;
  agentType: 'codex-cli';
  // gitBranch: NOT AVAILABLE per-message; only detectable from env context
  startTime: sessionMeta.timestamp;
  // endTime: last item timestamp
}

// UserMessage -> NormalizedMessage
interface CodexUserMessageMapping {
  role: 'user';
  content: userMessage.content;
  timestamp: userMessage.timestamp;
  // No parentId, isSidechain, toolCalls, etc.
}

// ResponseItem (function_call) -> NormalizedMessage.toolCalls
interface CodexToolCallMapping {
  id: item.call_id;
  name: item.name;         // "shell" -> normalize to "Bash" for cross-agent
  input: JSON.parse(item.arguments);
}

// ResponseItem (function_call_output) -> NormalizedMessage.toolResults
interface CodexToolResultMapping {
  toolCallId: item.call_id;
  success: output.metadata.exit_code === 0;
  stdout: output.output;
  stderr: '';  // Not separately tracked
  isError: output.metadata.exit_code !== 0;
}

// EventMsg (token_count) -> MessageMetrics
interface CodexTokenMapping {
  inputTokens: total_token_usage.input_tokens;  // Cumulative!
  outputTokens: total_token_usage.output_tokens;
  cacheReadTokens: total_token_usage.cached_input_tokens;
  // cacheCreationTokens: NOT AVAILABLE
  // costUsd: NOT AVAILABLE (must calculate from pricing)
  // model: from session_meta only
}
```

### 11.3 Key Normalization Challenges

1. **Cumulative vs. Per-Message Tokens:** Codex reports cumulative token totals. LLREM must compute deltas between consecutive `token_count` events to get per-turn usage.

2. **Single Tool vs. Multi-Tool:** Codex uses `shell` for everything. LLREM should parse the `cmd` arguments to determine the actual operation (`cat` -> Read, `apply_patch` -> Edit, `ls` -> Glob equivalent, etc.).

3. **Linear vs. Tree Conversations:** Codex conversations are linear. LLREM should treat all Codex messages as `isSidechain: false` and `parentId` as the previous message's ID.

4. **Cost Calculation:** Codex doesn't include per-message cost. LLREM must use the ccusage approach: look up model pricing and compute `cost = (input_tokens * input_price) + (output_tokens * output_price) + ...`.

5. **No Session Summary:** Codex rollout files don't have summary records. LLREM would need to generate summaries from the conversation content.

### 11.4 Proposed Parser Architecture

```typescript
// src/parsers/codex-cli/rollout-parser.ts

interface CodexRolloutLine {
  type: 'session_meta' | 'user_message' | 'response_item' | 'event_msg' | 'compacted_item';
  payload: SessionMeta | UserMessage | ResponseItem | EventMsg | CompactedItem;
  timestamp?: string;
}

interface SessionMeta {
  session_id: string;
  source: 'cli' | 'ide' | 'exec';
  timestamp: string;
  model_provider: string;
  model: string;
  cwd: string;
  conversation_id?: string;
}

interface UserMessage {
  content: string;
  timestamp: string;
}

interface ResponseItem {
  item: {
    id: string;
    type: 'agent_message' | 'function_call' | 'function_call_output' | 'reasoning' | 'command_execution' | 'file_edit' | 'web_search' | 'mcp_tool_call' | 'plan_update';
    // Fields vary by type
    text?: string;           // agent_message
    name?: string;           // function_call
    arguments?: string;      // function_call (JSON string)
    call_id?: string;        // function_call, function_call_output
    output?: string;         // function_call_output (JSON string)
    command?: string;        // command_execution
    summary?: string;        // reasoning
    status?: string;         // completed, in_progress, failed
  };
  timestamp: string;
}

interface EventMsg {
  type: 'token_count' | 'turn_started' | 'turn_complete' | 'context_compacted' | 'approval_requested' | 'error';
  // Payload varies by type
  total_token_usage?: TokenUsage;
  last_token_usage?: TokenUsage;
  model_context_window?: number;
  response_id?: string;
}

interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
}
```

---

## 12. Community Tools and Real Examples

### 12.1 ccusage (@ccusage/codex)

**Repository:** [github.com/ryoppippi/ccusage](https://github.com/ryoppippi/ccusage)
**Package:** `@ccusage/codex` on npm

The most mature Codex CLI transcript analysis tool. Originally built for Claude Code token tracking, extended to support Codex CLI.

**How it parses Codex JSONL:**
- Reads JSONL files from `${CODEX_HOME:-~/.codex}/sessions/`
- Processes `event_msg` records where `payload.type === "token_count"`
- Calculates per-turn deltas by subtracting previous cumulative totals
- Handles absence of `last_token_usage` by computing from `total_token_usage` differences
- Uses LiteLLM-based cost calculation system for pricing

**Key limitation:** Only processes `token_count` events. Does not analyze conversation content, tool calls, or error patterns.

**Important:** Sessions before September 6, 2025 (commit 0269096) contain no `token_count` events and cannot be analyzed for token usage.

### 12.2 codex-hud

**Repository:** [github.com/fwyc0573/codex-hud](https://github.com/fwyc0573/codex-hud)

Real-time statusline HUD for Codex CLI that monitors sessions, context usage, git status, and tool activity.

**Parsing approach:**
- Reads rollout files from `${CODEX_HOME:-~/.codex}/sessions/YYYY/MM/DD/rollout-*.jsonl`
- Parses `event_msg` entries for `token_count`, `turn_started`, and `context_compacted`
- Extracts `total_token_usage`, `last_token_usage`, `model_context_window`, `cached_input_tokens`
- Has a `rollout.ts` collector module for structured JSONL parsing

### 12.3 codex-history-list

**Repository:** [github.com/shinshin86/codex-history-list](https://github.com/shinshin86/codex-history-list)

A small CLI that lists Codex session histories with time, cwd, first user question, and file path.

**Parsing approach:**
- Fast recursive scan of `~/.codex/sessions` for `.jsonl` files
- Extracts `cwd` from `<environment_context>` messages
- Extracts first user request text
- Robust line-by-line JSONL parsing tolerant of mixed record shapes
- Multi-byte aware column alignment for display

### 12.4 cxresume

**Repository:** [github.com/lingtaolf/cxresume](https://github.com/lingtaolf/cxresume)

Split-pane CLI to browse and search Codex session logs, preview conversations, and resume with compressed context and auto-injection.

### 12.5 Blog Posts and Articles

1. **"Codex CLI: Access Past Conversations from JSONL Log Files"** - [betelgeuse.work/codex-resume/](https://betelgeuse.work/codex-resume/)
   - Detailed walkthrough of JSONL file structure and conversation recovery
   - Shows how to extract user messages and responses from mixed logs

2. **"OpenAI Codex CLI, how does it work?"** - [philschmid.de/openai-codex-cli](https://www.philschmid.de/openai-codex-cli)
   - Deep technical analysis of the original TypeScript architecture
   - Documents the agent loop, tool handling, and apply_patch mechanism

3. **"Building a TUI to index and search my coding agent sessions"** - [stanislas.blog](https://stanislas.blog/2026/01/tui-index-search-coding-agent-sessions/)
   - Cross-agent session indexing including Codex CLI

4. **"ccusage for Codex CLI: How Token Usage Tracking Became Possible"** - [ryoppippi.com/blog/2025-09-20-ccusage-for-codex](https://ryoppippi.com/blog/2025-09-20-ccusage-for-codex)
   - Detailed explanation of how token_count events work and the delta calculation approach

### 12.6 Relevant GitHub Issues and PRs

| Issue/PR | Title | LLREM Relevance |
|----------|-------|----------------|
| [#2288](https://github.com/openai/codex/issues/2288) | CLI flag to save trajectory/output as JSON | JSONL output format discussion |
| [#2765](https://github.com/openai/codex/issues/2765) | Session transcripts for reproducibility | Session format requirements |
| [#3380](https://github.com/openai/codex/pull/3380) | Introduce rollout items | Defines the RolloutItem enum |
| [#3123](https://github.com/openai/codex/pull/3123) | Replay EventMsgs from Response Items on resume | Session reconstruction logic |
| [#4963](https://github.com/openai/codex/issues/4963) | "Log rotate" history.jsonl | History rotation behavior |
| [#7138](https://github.com/openai/codex/issues/7138) | AGENTS.md silently truncated | Size limit behavior |
| [#8573](https://github.com/openai/codex/issues/8573) | RFC: Deterministic Session Checkpoint v1 (DSC) | Future compaction without summarization |
| [#9796](https://github.com/openai/codex/pull/9796) | Comprehensive hooks system | Future hooks capability |
| [#10407](https://github.com/openai/codex/issues/10407) | Offline session export + cache visibility | Export format requests |
| [#2582](https://github.com/openai/codex/issues/2582) | RFC: Make Codex CLI state-of-the-art | Extensibility roadmap |

---

## 13. Cross-Agent Configuration Strategy

### 13.1 The AGENTS.md + CLAUDE.md Problem

The user wants LLREM to generate configuration that works for **both** Claude Code and Codex CLI. The key challenge:

- Claude Code reads `CLAUDE.md`
- Codex CLI reads `AGENTS.md` with fallback to configured filenames
- AGENTS.md is becoming a cross-agent standard adopted by 60+ tools

### 13.2 Recommended Strategy: Dual-File with Shared Content

**Option A: Symlink approach** (simplest)
```bash
# In project root:
# Primary file with instructions
vim AGENTS.md
# Symlink for Claude Code
ln -s AGENTS.md CLAUDE.md
```

Both tools read the same content. LLREM generates changes to one file.

**Option B: AGENTS.md primary + Codex fallback config**
```toml
# ~/.codex/config.toml
project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md", "CLAUDE.md"]
```

Then LLREM generates content for `CLAUDE.md` and Codex picks it up as a fallback. However, this requires user-side config changes.

**Option C: Generate both files** (most compatible)
```
<project>/
├── AGENTS.md     # Codex CLI + standard-compliant tools
└── CLAUDE.md     # Claude Code (can reference AGENTS.md or duplicate)
```

LLREM generates both files with shared core content. Agent-specific instructions go in the appropriate file.

### 13.3 LLREM's Approach

LLREM should:

1. **Detect which agents the user uses** by checking for:
   - `~/.codex/` directory (Codex CLI)
   - `~/.claude/` directory (Claude Code)
   - Both instruction files in the project

2. **Generate appropriate instruction files:**
   - If both agents detected, generate shared content in `AGENTS.md` and symlink/duplicate to `CLAUDE.md`
   - If only Claude Code, generate `CLAUDE.md`
   - If only Codex CLI, generate `AGENTS.md`

3. **Generate appropriate config diffs:**
   - Claude Code: `settings.json` / `settings.local.json` diffs
   - Codex CLI: `config.toml` diffs
   - If user has Codex but not CLAUDE.md fallback configured, suggest adding it

### 13.4 Content Format Considerations

Since both `AGENTS.md` and `CLAUDE.md` are plain Markdown, the content format is fully compatible. LLREM can use the same content generation pipeline for both, with agent-specific sections clearly marked:

```markdown
# Project Instructions

## Build & Test
- Run `pnpm test` before committing
- Use `pnpm lint` for code style

## Code Style
- Use TypeScript strict mode
- Prefer functional composition

<!-- Claude Code specific -->
## Claude Code Notes
- Use the Edit tool for targeted changes
- Prefer Grep over Bash grep

<!-- Codex CLI specific -->
## Codex Notes
- Use apply_patch for file edits
- Shell commands run in sandbox
```

---

## 14. LLREM Implementation Recommendations

### 14.1 Parser Implementation Priority

For first-class Codex CLI support, implement in this order:

1. **Rollout file discovery** - Scan `$CODEX_HOME/sessions/` recursively for `.jsonl` files
2. **SessionMeta parser** - Extract session metadata from first line
3. **UserMessage/ResponseItem parser** - Extract conversation flow
4. **Token usage calculator** - Compute per-turn deltas from cumulative `token_count` events
5. **Tool call normalizer** - Map `shell` commands to semantic operations (read/write/edit/run)
6. **Error detector** - Identify non-zero exit codes, error patterns
7. **Context compaction tracker** - Detect `context_compacted` events
8. **Cost calculator** - Integrate pricing data (use LiteLLM or similar)

### 14.2 Auto-Detection Update

Update the existing auto-detection logic:

```typescript
function detectAgent(path: string): AgentType {
  // Codex CLI detection (updated with date-based path structure)
  if (path.includes('.codex/sessions/') && path.endsWith('.jsonl')) return 'codex-cli';

  // Also detect from rollout filename pattern
  if (path.match(/rollout-\d{4}-\d{2}-\d{2}T.*\.jsonl$/)) return 'codex-cli';

  // Existing detections...
  if (path.includes('.claude/projects/') && path.endsWith('.jsonl')) return 'claude-code';
  // ...
}
```

### 14.3 Pattern Detection Specific to Codex CLI

| Pattern | Detection Method | Suggested Fix |
|---------|-----------------|---------------|
| Excessive tool approvals | Count `approval_requested` events | Adjust `approval_policy` or `sandbox_mode` |
| Context exhaustion | Frequent `context_compacted` events | Split tasks, use AGENTS.md to reduce instructions |
| Large tool output truncation | `tool_output_token_limit` warnings | Increase limit in config.toml |
| Shell command failures | Non-zero `exit_code` in function_call_output | Better AGENTS.md instructions |
| Missing MCP tools | User describes manual steps that MCP could automate | Suggest MCP server installation |
| Sandbox restrictions | Network/filesystem permission errors | Suggest `writable_roots` or `network_access` config |
| Model capability gaps | Reasoning loops without progress | Suggest model upgrade |
| AGENTS.md truncation | File size > 32 KiB | Suggest splitting across directories |

### 14.4 Config Generation

LLREM should generate `config.toml` diffs in TOML format:

```toml
# LLREM Suggestion: Reduce approval friction for trusted project
# Before: approval_policy = "on-request"
approval_policy = "on-failure"

# LLREM Suggestion: Allow writes to test output directory
[sandbox]
writable_roots = ["/tmp/test-output"]
network_access = true

# LLREM Suggestion: Add Playwright MCP for UI verification
[mcp_servers.playwright]
type = "stdio"
command = "npx"
args = ["-y", "@anthropic-ai/mcp-server-playwright"]
startup_timeout_sec = 15
tool_timeout_sec = 120
```

### 14.5 Token Usage and Cost Analysis

Since Codex CLI does not natively track costs, LLREM must implement external pricing:

```typescript
interface CodexPricingModel {
  model: string;
  input_per_million: number;
  output_per_million: number;
  cached_input_per_million: number;
  reasoning_per_million: number;
}

function calculateCodexCost(tokenUsage: TokenUsage, pricing: CodexPricingModel): number {
  return (
    (tokenUsage.input_tokens * pricing.input_per_million / 1_000_000) +
    (tokenUsage.output_tokens * pricing.output_per_million / 1_000_000) +
    (tokenUsage.cached_input_tokens * pricing.cached_input_per_million / 1_000_000) +
    (tokenUsage.reasoning_tokens * pricing.reasoning_per_million / 1_000_000)
  );
}
```

---

## 15. Sources

### Official OpenAI Documentation
- [Codex CLI Features](https://developers.openai.com/codex/cli/features/)
- [Command Line Options Reference](https://developers.openai.com/codex/cli/reference/)
- [Configuration Reference](https://developers.openai.com/codex/config-reference/)
- [Sample Configuration](https://developers.openai.com/codex/config-sample/)
- [Config Basics](https://developers.openai.com/codex/config-basic/)
- [Advanced Configuration](https://developers.openai.com/codex/config-advanced/)
- [Custom Instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md/)
- [Model Context Protocol](https://developers.openai.com/codex/mcp/)
- [Security](https://developers.openai.com/codex/security/)
- [Non-interactive Mode](https://developers.openai.com/codex/noninteractive/)
- [Agent Skills](https://developers.openai.com/codex/skills/)
- [Codex Changelog](https://developers.openai.com/codex/changelog/)
- [Codex App Server](https://developers.openai.com/codex/app-server/)
- [Slash Commands](https://developers.openai.com/codex/cli/slash-commands/)
- [Codex Models](https://developers.openai.com/codex/models/)
- [Codex SDK](https://developers.openai.com/codex/sdk/)

### GitHub Repository
- [openai/codex - Main Repository](https://github.com/openai/codex)
- [codex-rs/ - Rust Implementation](https://github.com/openai/codex/tree/main/codex-rs)
- [codex-rs/core - Core Library](https://github.com/openai/codex/tree/main/codex-rs/core)
- [docs/agents_md.md - AGENTS.md Documentation](https://github.com/openai/codex/blob/main/docs/agents_md.md)
- [docs/config.md - Config Documentation](https://github.com/openai/codex/blob/main/docs/config.md)
- [docs/exec.md - Exec Mode Documentation](https://github.com/openai/codex/blob/main/docs/exec.md)
- [PR #3380 - Introduce Rollout Items](https://github.com/openai/codex/pull/3380)
- [PR #3123 - Replay EventMsgs on Resume](https://github.com/openai/codex/pull/3123)
- [PR #9796 - Comprehensive Hooks System](https://github.com/openai/codex/pull/9796)
- [Issue #2582 - RFC: State-of-the-Art Extensibility](https://github.com/openai/codex/issues/2582)
- [Issue #2288 - JSON Trajectory Output](https://github.com/openai/codex/issues/2288)
- [Issue #7138 - AGENTS.md Silent Truncation](https://github.com/openai/codex/issues/7138)
- [Discussion #1174 - Codex CLI Going Native (Rust)](https://github.com/openai/codex/discussions/1174)

### DeepWiki Analysis
- [Conversation History and Persistence](https://deepwiki.com/openai/codex/3.3-session-management-and-persistence)
- [Session Resumption](https://deepwiki.com/openai/codex/4.4-app-server-and-json-rpc-protocol)
- [Architecture Overview](https://deepwiki.com/openai/codex/1.3-configuration-options)
- [MCP Server Configuration](https://deepwiki.com/openai/codex/7.1-mcp-server-configuration)
- [MCP CLI Commands](https://deepwiki.com/openai/codex/6.3-mcp-cli-commands)

### Community Tools
- [ccusage - Token Usage Analysis](https://github.com/ryoppippi/ccusage) / [npm: @ccusage/codex](https://www.npmjs.com/package/@ccusage/codex)
- [codex-hud - Real-time Session HUD](https://github.com/fwyc0573/codex-hud)
- [codex-history-list - Session History Browser](https://github.com/shinshin86/codex-history-list)
- [cxresume - Session Browser and Resume Tool](https://github.com/lingtaolf/cxresume)

### Blog Posts and Articles
- [Codex CLI: Access Past Conversations from JSONL Log Files](https://betelgeuse.work/codex-resume/)
- [OpenAI Codex CLI, How Does It Work?](https://www.philschmid.de/openai-codex-cli)
- [ccusage for Codex CLI: Token Usage Tracking](https://ryoppippi.com/blog/2025-09-20-ccusage-for-codex)
- [Codex CLI Going Native: Rust Rewrite (InfoQ)](https://www.infoq.com/news/2025/06/codex-cli-rust-native-rewrite/)
- [AGENTS.md - A New Standard for Unified Coding Agent Instructions](https://addozhang.medium.com/agents-md-a-new-standard-for-unified-coding-agent-instructions-0635fc5cb759)
- [AGENTS.md Official Site](https://agents.md/)
- [OpenAI Codex Observability with OpenTelemetry (SigNoz)](https://signoz.io/docs/codex-monitoring/)
- [Codex CLI Overview (ccusage)](https://ccusage.com/guide/codex/)

### Protocol and Architecture
- [codex-rs/docs/protocol_v1.md (Fossies)](https://fossies.org/linux/codex-rust/codex-rs/docs/protocol_v1.md)
- [Unlocking the Codex Harness: App Server (OpenAI Blog)](https://openai.com/index/unlocking-the-codex-harness/)
- [Unrolling the Codex Agent Loop (OpenAI Blog)](https://openai.com/index/unrolling-the-codex-agent-loop/)
- [Config Schema JSON](https://developers.openai.com/codex/config-schema.json)
