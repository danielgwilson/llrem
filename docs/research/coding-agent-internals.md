# Coding Agent Internals: Data Storage, Session Formats, and Architecture

> Deep technical research into how AI coding agents store sessions, configurations, and operational data. This document is essential for LLREM's parser and analysis layer design.

## Table of Contents

1. [Claude Code Internals (Primary Target)](#1-claude-code-internals)
2. [Cursor IDE Internals](#2-cursor-ide-internals)
3. [Cline / Roo Code Internals](#3-cline--roo-code-internals)
4. [Aider Internals](#4-aider-internals)
5. [Gemini CLI Internals](#5-gemini-cli-internals)
6. [OpenAI Codex CLI Internals](#6-openai-codex-cli-internals)
7. [Windsurf (Cascade) Internals](#7-windsurf-cascade-internals)
8. [Amazon Q Developer CLI Internals](#8-amazon-q-developer-cli-internals)
9. [Cross-Agent Comparison Matrix](#9-cross-agent-comparison-matrix)
10. [Common Patterns for Retrospective Analysis](#10-common-patterns-for-retrospective-analysis)
11. [LLREM Parser Design Implications](#11-llrem-parser-design-implications)

---

## 1. Claude Code Internals

**Source: Direct analysis of `daniels-data/.claude/` directory (real user data, May-August 2025)**

Claude Code is LLREM's primary target. It has the richest and most accessible data layer of any coding agent.

### 1.1 Directory Structure Overview

```
~/.claude/
├── __store.db                    # SQLite database (legacy? co-exists with JSONL)
├── settings.json                 # Global user settings
├── repomix-output.xml            # Cached repomix context output
├── .claude/
│   └── settings.local.json       # Nested local settings (permissions)
├── commands/                     # Custom slash commands (empty in sample)
├── hooks/                        # Hook scripts
│   ├── logs.py
│   ├── notifications.py
│   ├── openmemory/               # OpenMemory integration hooks
│   │   ├── search-memory.py
│   │   ├── post-tool-memory.py
│   │   ├── pre-compact-memory.py
│   │   └── save-memory.py
│   └── tts/                      # Text-to-speech hooks
│       ├── .env
│       └── elevenlabs.py
├── hooks-backup/                 # Backup of hooks directory
├── ide/                          # IDE integration lock files
│   └── <pid>.lock                # JSON: {pid, workspaceFolders, ideName, transport, authToken}
├── local/                        # Local Claude Code installation
│   ├── claude                    # CLI binary/wrapper
│   ├── package.json              # {"dependencies": {"@anthropic-ai/claude-code": "^1.0.98"}}
│   └── node_modules/
├── logs/                         # Debug/hook logs
│   ├── hook-debug.log
│   └── search-hook-debug.log
├── plugins/
│   ├── config.json               # {"repositories": {}}
│   └── repos/
├── projects/                     # Per-project session data (JSONL files)
│   ├── -Users-danielgwilson-local-git-image-mcp/
│   │   ├── <session-uuid>.jsonl  # One file per session
│   │   └── ...
│   ├── -Users-danielgwilson-local-git-legion-main/
│   │   └── ...
│   └── ... (22+ project directories in sample)
├── shell-snapshots/              # Zsh/shell environment snapshots
│   └── snapshot-zsh-<timestamp>-<id>.sh
├── statsig/                      # Feature flag evaluation cache
│   └── statsig.cached.evaluations.<hash>
└── todos/                        # Task/todo state per session/agent
    ├── <session-uuid>.json
    └── <session-uuid>-agent-<agent-uuid>.json
```

### 1.2 Project Directory Naming Convention

Project directories use a path-encoding scheme: the absolute filesystem path with slashes replaced by dashes.

```
/Users/danielgwilson/local_git/image-mcp
  -> -Users-danielgwilson-local-git-image-mcp
```

This means LLREM can reverse-map any project directory back to its filesystem path for context.

### 1.3 SQLite Database (`__store.db`)

The SQLite database uses Drizzle ORM and contains five tables. **Note**: This may be a legacy or supplemental store; newer sessions primarily use JSONL files in the `projects/` directory.

#### Schema

```sql
-- Message tree structure (parent-child linked list)
CREATE TABLE base_messages (
    uuid TEXT PRIMARY KEY NOT NULL,
    parent_uuid TEXT,                          -- Links to parent message (tree structure)
    session_id TEXT NOT NULL,                   -- Groups messages into sessions
    timestamp INTEGER NOT NULL,                 -- Unix milliseconds
    message_type TEXT NOT NULL,                 -- 'user' | 'assistant'
    cwd TEXT NOT NULL,                          -- Working directory at time of message
    user_type TEXT NOT NULL,                    -- 'external' (always in sample data)
    version TEXT NOT NULL,                      -- Claude Code version string
    isSidechain INTEGER NOT NULL,               -- Whether message is on a side-branch
    original_cwd TEXT NOT NULL DEFAULT '',       -- Original working directory
    FOREIGN KEY (parent_uuid) REFERENCES base_messages(uuid)
);

-- Assistant response data (1:1 with base_messages where type='assistant')
CREATE TABLE assistant_messages (
    uuid TEXT PRIMARY KEY NOT NULL,
    cost_usd REAL NOT NULL,                     -- API cost for this response
    duration_ms INTEGER NOT NULL,               -- Response generation time
    message TEXT NOT NULL,                       -- Full API response JSON
    is_api_error_message INTEGER DEFAULT false,  -- Whether this was an error response
    timestamp INTEGER NOT NULL,
    model TEXT DEFAULT '' NOT NULL,              -- Model ID (e.g., 'claude-3-7-sonnet-20250219')
    FOREIGN KEY (uuid) REFERENCES base_messages(uuid)
);

-- User message data (1:1 with base_messages where type='user')
CREATE TABLE user_messages (
    uuid TEXT PRIMARY KEY NOT NULL,
    message TEXT NOT NULL,                       -- User prompt or tool result JSON
    tool_use_result TEXT,                        -- Tool execution result (stdout/stderr/etc.)
    timestamp INTEGER NOT NULL,
    is_at_mention_read INTEGER,                  -- @mention handling flag
    is_meta INTEGER,                             -- Whether this is a meta/system message
    FOREIGN KEY (uuid) REFERENCES base_messages(uuid)
);

-- Conversation summaries (one per conversation leaf)
CREATE TABLE conversation_summaries (
    leaf_uuid TEXT PRIMARY KEY NOT NULL,
    summary TEXT NOT NULL,                       -- Human-readable summary string
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (leaf_uuid) REFERENCES base_messages(uuid)
);

CREATE TABLE __drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash TEXT NOT NULL,
    created_at NUMERIC
);
```

#### Key Data Points from Sample (12 sessions, Apr 30 - May 10 2025)

| Metric | Value |
|--------|-------|
| Total messages | 1,889 |
| User messages | 1,005 |
| Assistant messages | 884 |
| Messages with tool results | 819 (81.5% of user messages!) |
| Conversation summaries | 15 |
| Total API cost | $39.58 |
| Avg cost per response | $0.045 |
| Avg response duration | 9.2 seconds |
| Max response duration | 393 seconds (6.5 min!) |
| Sessions with API errors | 1 error message found |

#### Message JSON Formats

**User message (human prompt):**
```json
{
  "role": "user",
  "content": "Please visit localhost:3000/hadley and notice that..."
}
```

**User message (tool result):**
```json
{
  "role": "user",
  "content": [
    {
      "tool_use_id": "toolu_01MT4GzvGX6Ui24sPr6WVLxm",
      "type": "tool_result",
      "content": "",
      "is_error": false
    }
  ]
}
```

**tool_use_result field (Bash tool):**
```json
{
  "stdout": "origin\thttps://github.com/...",
  "stderr": "",
  "interrupted": false,
  "isImage": false,
  "sandbox": false
}
```

**Assistant message (full API response):**
```json
{
  "id": "msg_019owvuWWKd9LVuAGBK6QS8n",
  "type": "message",
  "role": "assistant",
  "model": "claude-3-7-sonnet-20250219",
  "content": [
    {"type": "text", "text": "I'll check the website..."},
    {"type": "tool_use", "id": "toolu_01UYVKkv9kLppDRxVDtLoskM",
     "name": "mcp__puppeteer__puppeteer_navigate",
     "input": {"url": "http://localhost:3000/hadley"}}
  ],
  "stop_reason": "tool_use",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 4,
    "cache_creation_input_tokens": 42482,
    "cache_read_input_tokens": 0,
    "output_tokens": 1,
    "service_tier": "standard"
  }
}
```

### 1.4 JSONL Session Files (Newer Format, Primary)

Located in `~/.claude/projects/<project-dir>/<session-uuid>.jsonl`, these are append-only log files. Each line is a JSON object. **This is the primary format for newer Claude Code versions (1.0.93+).**

#### Record Types

**1. Summary records** (appear at top of file):
```json
{
  "type": "summary",
  "summary": "Credit Pricing Strategy: Psychological Tiers Breakdown",
  "leafUuid": "bf46cebb-bcc2-42bb-aa32-70f98bae4d1f"
}
```

**2. User messages:**
```json
{
  "parentUuid": null,               // null for first message in session
  "isSidechain": false,
  "userType": "external",
  "cwd": "/Users/danielgwilson/local_git/image-mcp",
  "sessionId": "117326d6-b77a-4bfc-a202-06fe6a9b063a",
  "version": "1.0.98",
  "gitBranch": "main",
  "type": "user",
  "message": {"role": "user", "content": "..."},
  "uuid": "c4d5462d-a3f2-4cfc-a808-8f5a856b8af2",
  "timestamp": "2025-08-30T08:40:21.611Z"
}
```

All possible user message keys:
- `parentUuid`, `isSidechain`, `userType`, `cwd`, `sessionId`, `version`, `gitBranch`
- `type` (always "user")
- `message` (API message payload)
- `uuid`, `timestamp`
- `toolUseResult` (present when this message carries a tool execution result)
- `isVisibleInTranscriptOnly` (for hook outputs and system insertions)
- `isCompactSummary` (marks auto-compaction/context-compression events)
- `isMeta` (system-level meta messages)

**3. Assistant messages:**
```json
{
  "parentUuid": "a58dea07-4046-46f7-9221-a17320d6fb6c",
  "isSidechain": false,
  "userType": "external",
  "cwd": "/Users/danielgwilson/local_git/image-mcp",
  "sessionId": "117326d6-...",
  "version": "1.0.98",
  "gitBranch": "main",
  "message": {
    "id": "msg_01RNySjcJSYSqwaLz4HzoRiM",
    "type": "message",
    "role": "assistant",
    "model": "claude-opus-4-1-20250805",
    "content": [...],
    "stop_reason": null,
    "usage": {
      "input_tokens": 4,
      "cache_creation_input_tokens": 78110,
      "cache_read_input_tokens": 4734,
      "output_tokens": 1,
      "service_tier": "standard"
    }
  },
  "requestId": "req_011CSdbSHG6oPc7uUzpySHpA",
  "type": "assistant",
  "uuid": "36e7ff62-c33b-4193-8d15-362cf941e854",
  "timestamp": "2025-08-30T08:40:31.488Z"
}
```

**4. System messages** (hook outputs, tool status):
```json
{
  "parentUuid": "bd481a6c-...",
  "isSidechain": false,
  "userType": "external",
  "cwd": "/Users/danielgwilson/local_git/image-mcp",
  "sessionId": "17111e17-...",
  "version": "1.0.93",
  "gitBranch": "main",
  "type": "system",
  "content": "Running PostToolUse:Bash...",
  "isMeta": false,
  "timestamp": "2025-08-27T08:03:01.484Z",
  "uuid": "8583a335-...",
  "toolUseID": "toolu_01CmoTwQ9ZMPrTopjc2m6iVV",
  "level": "info"
}
```

**5. Tool use result messages** (user message with toolUseResult):
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [{"tool_use_id": "toolu_...", "type": "tool_result", "content": "..."}]
  },
  "toolUseResult": {
    "stdout": "...",
    "stderr": "...",
    "interrupted": false,
    "isImage": false
  }
  // ... or for TodoWrite:
  "toolUseResult": {
    "oldTodos": [...],
    "newTodos": [...]
  }
}
```

**6. Compact summary messages** (context window management):
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "This session is being continued from a previous conversation that ran out of context. The conversation is summarized below:..."
  },
  "isVisibleInTranscriptOnly": true,
  "isCompactSummary": true
}
```

### 1.5 Settings Files

**Global settings** (`~/.claude/settings.json`):
```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "model": "opus",
  "hooks": {
    "UserPromptSubmit": [...],
    "PreToolUse": [...],
    "PostToolUse": [...],
    "Stop": [...],
    "SubagentStop": [...],
    "PreCompact": [...],
    "Notification": [...]
  },
  "feedbackSurveyState": {
    "lastShownTime": 1754095193293
  }
}
```

**Local permissions** (`~/.claude/.claude/settings.local.json`):
```json
{
  "permissions": {
    "allow": [
      "mcp__firecrawl__firecrawl_scrape",
      "Bash(curl:*)",
      "mcp__openmemory-local__list_memories",
      "Bash(docker logs:*)"
    ],
    "deny": []
  }
}
```

### 1.6 Hook Event Data

Hooks receive JSON on stdin with the following structure (from `search-hook-debug.log`):

```json
{
  "session_id": "e4bb78ac-220a-4364-98d2-0296b3109893",
  "transcript_path": "/Users/danielgwilson/.claude/projects/-Users-..../e4bb78ac-....jsonl",
  "cwd": "/Users/danielgwilson/local_git/image-mcp",
  "permission_mode": "acceptEdits",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "And make sure you're following best practices..."
}
```

**Hook event types**: UserPromptSubmit, PreToolUse, PostToolUse, Stop, SubagentStop, PreCompact, Notification

### 1.7 IDE Integration (`ide/` directory)

Lock files with JSON containing IDE metadata:
```json
{
  "pid": 21434,
  "workspaceFolders": ["/Users/danielgwilson/local_git/image-mcp"],
  "ideName": "Cursor",
  "transport": "ws",
  "runningInWindows": false,
  "authToken": "83b11b2c-..."
}
```

### 1.8 Todos (`todos/` directory)

759+ files in the sample. Each is a JSON file keyed by session UUID (or session-agent UUID for subagents).

```json
[
  {
    "content": "Phase 1: Core UX Revolution",
    "status": "completed",
    "priority": "high",
    "id": "legion-cli-phase-1"
  },
  ...
]
```

Empty sessions have `[]` (just the empty array literal - 2 bytes).

### 1.9 Shell Snapshots

Zsh environment snapshots captured at session start, containing exported aliases, functions, and environment variables. File naming: `snapshot-zsh-<unix-ms>-<random>.sh`.

### 1.10 Key Observations for LLREM

1. **Dual storage**: SQLite database (legacy/older sessions) and JSONL files (newer). LLREM needs parsers for both.
2. **Rich metadata**: Every message carries `cwd`, `gitBranch`, `version`, `sessionId`, and parent chain.
3. **Full API responses**: Assistant messages contain complete Anthropic API responses including `usage` (token counts, caching info), `model`, `stop_reason`.
4. **Tool usage tracking**: 81.5% of user messages carry tool results - tool_use is the dominant interaction pattern.
5. **Context compaction**: `isCompactSummary` marks when the context window was compressed.
6. **Conversation tree**: `parentUuid` creates a tree structure, with `isSidechain` marking branched explorations.
7. **Hook ecosystem**: Hooks provide real-time integration points; LLREM could integrate as a PostToolUse or Stop hook.
8. **Error signals**: `is_api_error_message` in SQLite, `stderr` in tool results, `is_error` in tool result content.

---

## 2. Cursor IDE Internals

### 2.1 Data Storage Architecture

Cursor (a VSCode fork) stores data using SQLite databases inherited from VSCode's architecture.

**Primary storage location (macOS):**
```
~/Library/Application Support/Cursor/User/
├── globalStorage/
│   └── state.vscdb               # Global state SQLite database
├── workspaceStorage/
│   └── <workspace-hash>/
│       └── state.vscdb           # Per-workspace SQLite database
```

### 2.2 SQLite Schema (`state.vscdb`)

Cursor uses two key-value tables:

```sql
-- Primary KV store (newer)
CREATE TABLE cursorDiskKV (
    key TEXT PRIMARY KEY,
    value TEXT                     -- JSON-encoded values
);

-- VSCode legacy KV store
CREATE TABLE ItemTable (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

**Important keys in cursorDiskKV / ItemTable:**

| Key Pattern | Content |
|-------------|---------|
| `aiService.prompts` | AI service prompt configuration |
| `workbench.panel.aichat.view.aichat.chatdata` | Chat panel data |
| `composerData:<composerId>` | Individual Composer session data (JSON with `_v`, `latestConversationSummary`) |
| Command allowlist keys | Approved terminal commands |

### 2.3 Configuration Files

**Project-level rules** (`.cursor/rules/`):
```
.cursor/rules/
├── your-rule-name.mdc
├── testing.mdc
└── style-guide.mdc
```

**`.mdc` file format** (YAML frontmatter + Markdown):
```yaml
---
description: Short description of the rule's purpose
globs: src/**/*.ts, tests/**/*.test.ts
alwaysApply: false
---
# Rule Title

Markdown content explaining the rule and its instructions.
```

**Legacy format**: `.cursorrules` (single file, plain text, still supported but deprecated).

### 2.4 Limitations for LLREM

- Chat history stored inside SQLite blobs as JSON - requires SQLite + JSON parsing
- No standardized session boundary format
- Conversation data format is not publicly documented and may change between versions
- No JSONL or streaming log format
- Workspace-hash directories require mapping back to actual paths

---

## 3. Cline / Roo Code Internals

### 3.1 Storage Location

Cline uses VS Code's extension globalStorage API.

**macOS:**
```
~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/
├── state/
│   ├── taskHistory.json           # Task history index
│   └── taskHistory.backup.*.json  # Automated backups
├── tasks/
│   └── <task-id>/
│       ├── api_conversation_history.json  # Full API conversation
│       ├── ui_messages.json               # UI-facing message display
│       └── task_metadata.json             # Task metadata
└── checkpoints/
    └── <workspace-specific>/              # Workspace state snapshots
```

**Roo Code** (fork) uses the same structure under `rooveterinaryinc.roo-cline/`.

### 3.2 Key File Formats

**taskHistory.json** (index file):
```json
[
  {
    "id": "<task-uuid>",
    "ts": 1706000000000,
    "task": "Initial prompt text",
    "tokensIn": 12345,
    "tokensOut": 6789,
    "cacheWrites": 0,
    "cacheReads": 0,
    "totalCost": 0.15
  }
]
```

**api_conversation_history.json** (per-task):
```json
[
  {"role": "user", "content": [...]},
  {"role": "assistant", "content": [...]},
  {"role": "user", "content": [{"type": "tool_result", ...}]},
  ...
]
```

**task_metadata.json** (per-task):
```json
{
  "taskId": "<uuid>",
  "startTime": 1706000000000,
  "endTime": 1706000999000,
  "model": "claude-3-5-sonnet-20241022",
  "totalTokensIn": 50000,
  "totalTokensOut": 25000,
  "totalCost": 0.45
}
```

### 3.3 Configuration

**`.clinerules`** - can be a single file or a directory:
```
.clinerules                       # Single file with rules text
# OR
.clinerules/
├── general.md
├── testing.md
└── security.md
```

### 3.4 Key Observations for LLREM

- Clean JSON format with clear separation of API history and UI messages
- Per-task organization makes it easy to analyze individual coding sessions
- Token counts and costs tracked per task in both index and metadata
- Checkpoint system provides workspace state at each step (diff-able)
- Dual-stream (API + UI) means full context vs. user-visible context are separately available

---

## 4. Aider Internals

### 4.1 File-Based Storage

Aider uses simple file-based storage in the project working directory:

```
<project-root>/
├── .aider.chat.history.md        # Full chat transcript (Markdown)
├── .aider.input.history           # User input history (readline-style)
├── .aider.tags.cache.v3/          # Ctags cache for code indexing
├── .aider.conf.yml                # Project-specific configuration
└── .env                           # Environment variables (API keys)
```

**Global configuration:**
```
~/.aider.conf.yml                  # Global config
```

### 4.2 Chat History Format (`.aider.chat.history.md`)

Markdown format with heading-delimited entries:

```markdown
#### 2025-01-15 10:30:00

> /ask How do I fix this test?

I can see the issue in your test file. The assertion is checking...

#### 2025-01-15 10:32:00

> Fix the test assertion in test_auth.py

I'll update the assertion to match the expected output...

```

User input is prefixed with `> ` (markdown blockquote). Aider commands use `> /command` syntax. Assistant responses follow as plain markdown.

### 4.3 Git Integration

Aider's deepest differentiator is its native git integration:

- **Auto-commits**: Every file edit creates a git commit with a descriptive message
- **Dirty file protection**: Uncommitted changes are committed first (preserving user work)
- **Commit message format**: Aider-generated commits use a distinctive format
- **Diff-based editing**: Uses unified diff or search/replace blocks for edits

### 4.4 Configuration (`.aider.conf.yml`)

```yaml
model: claude-3-5-sonnet-20241022
edit-format: diff
auto-commits: true
map-tokens: 1024
chat-history-file: .aider.chat.history.md
input-history-file: .aider.input.history
```

### 4.5 Key Observations for LLREM

- Simplest storage format - plain markdown files, easy to parse
- No structured token/cost data in the history file itself
- Git history provides a parallel log of all code changes (aider-authored commits)
- Input history file provides raw command sequence for pattern analysis
- Configuration is YAML-based, straightforward to read and modify

---

## 5. Gemini CLI Internals

### 5.1 Directory Structure

```
~/.gemini/
├── settings.json                  # Global configuration
├── .env                           # API keys and environment
├── tmp/
│   └── <project-hash>/
│       └── chats/
│           ├── session-<id>.jsonl  # JSONL session files (newer)
│           └── session-<id>.json   # JSON session files (legacy)
└── sandbox-macos-custom.sb        # Custom sandbox profiles

<project-root>/
├── GEMINI.md                      # Project context file (equivalent to CLAUDE.md)
└── .gemini/
    ├── settings.json              # Project-specific settings
    ├── .env                       # Project-specific env vars
    └── sandbox-macos-custom.sb    # Project-specific sandbox
```

### 5.2 Session Storage Format

Gemini CLI is transitioning from monolithic JSON to JSONL:

**JSONL format (newer):**
```jsonl
{"type": "session_metadata", "id": "...", "timestamp": "...", "model": "..."}
{"type": "user", "id": "...", "content": "..."}
{"type": "gemini", "id": "...", "content": "..."}
{"type": "message_update", "id": "...", "delta": "..."}
```

**Saved data includes:**
- Complete conversation history (prompts and responses)
- All tool executions (inputs and outputs)
- Token usage statistics
- Assistant thoughts/reasoning summaries (when available)

### 5.3 Configuration (`settings.json`)

```json
{
  "context": {
    "fileName": "GEMINI.md"
  },
  "sessions": {
    "maxAge": "30d",
    "maxCount": 50
  }
}
```

### 5.4 Key Observations for LLREM

- JSONL format is similar to Claude Code, making parser reuse possible
- Project-hash-based organization parallels Claude Code's approach
- GEMINI.md is the direct equivalent of CLAUDE.md
- Session cleanup is configurable (maxAge, maxCount)
- Tool execution data is preserved in the session log

---

## 6. OpenAI Codex CLI Internals

### 6.1 Directory Structure

```
~/.codex/                          # CODEX_HOME (configurable)
├── config.toml                    # Configuration file
├── AGENTS.md                      # Global instructions (like CLAUDE.md)
├── AGENTS.override.md             # Override instructions (higher priority)
├── history.jsonl                  # Command history
├── sessions/
│   └── <session-id>.jsonl         # Per-session JSONL transcripts
├── archived_sessions/             # Archived/old sessions
└── instructions/                  # Additional instruction files
```

### 6.2 Session JSONL Format

```jsonl
{"type": "metadata", "session_id": "...", "source": "cli", "timestamp": "...", "model_provider": "openai"}
{"type": "user_turn", "content": "...", "timestamp": "..."}
{"type": "agent_response", "content": "...", "tool_calls": [...], "timestamp": "..."}
{"type": "tool_result", "tool_call_id": "...", "result": "...", "timestamp": "..."}
```

Each session is a JSONL file containing:
- Session metadata header
- User turns
- Agent responses (including tool calls)
- Tool execution results

### 6.3 Configuration (`config.toml`)

```toml
[history]
persistence = true
max_bytes = 10485760              # 10MB cap, oldest entries dropped

[project_doc]
max_bytes = 32768                 # Max bytes to read from AGENTS.md
fallback_filenames = ["AGENTS.md", "CLAUDE.md"]  # Fallback context files
```

### 6.4 AGENTS.md Instruction Chain

Codex builds instructions with precedence:
1. `~/.codex/AGENTS.override.md` (if exists)
2. `~/.codex/AGENTS.md` (global)
3. Walk from project root to cwd, checking each directory for `AGENTS.override.md` then `AGENTS.md`

### 6.5 Key Observations for LLREM

- JSONL format aligns well with Claude Code and Gemini CLI
- `fallback_filenames` includes "CLAUDE.md" - cross-agent compatibility built in
- Session resumption means sessions can be long-running across multiple invocations
- History file with byte-capped rotation provides a unified log
- TOML config is different from JSON (Claude Code) and YAML (Aider)

---

## 7. Windsurf (Cascade) Internals

### 7.1 Data Storage

```
<server>/data/
├── vector_store/                  # Vector embeddings storage
├── sessions/                      # User session history
└── logs/
    └── usage_tracking.log         # Usage analytics

<workspace>/.windsurf/rules/       # Workspace-specific rules
```

### 7.2 Rules Format (`.windsurf/rules/`)

Rules are Markdown files with metadata, similar to Cursor's `.mdc` format but with different constraints:
- Individual rule files limited to 6,000 characters
- Total combined rules (global + local) limited to 12,000 characters
- Global rules take priority over workspace rules

### 7.3 Cascade Memories

- Stored in local encrypted files
- Only persistent within a single Windsurf installation
- Not exportable or inspectable by external tools
- Long sessions degrade performance (in-memory accumulation)

### 7.4 Key Observations for LLREM

- Most opaque of all agents - encrypted local storage, no JSONL/JSON exports
- Rule format is accessible but session data is not
- Would require Windsurf-specific integration (API or plugin) to access session data
- Lowest priority for LLREM integration due to data accessibility limitations

---

## 8. Amazon Q Developer CLI Internals

### 8.1 Directory Structure

```
~/.aws/amazonq/
├── mcp.json                       # Global MCP server configuration

<project-root>/.amazonq/
├── mcp.json                       # Project-specific MCP config
└── rules/                         # Project rules (similar to CLAUDE.md)
```

### 8.2 Session Storage

Amazon Q CLI does **not** automatically persist sessions. Conversation data must be explicitly saved:

```bash
/save <path>                       # Save current conversation to JSON
/load <path>                       # Load a previously saved conversation
```

Saved format is JSON containing the full conversation state.

### 8.3 MCP Configuration (`mcp.json`)

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@my/mcp-server"],
      "env": {"API_KEY": "..."}
    }
  }
}
```

### 8.4 Key Observations for LLREM

- Manual save/load model means sessions are only available if user explicitly saves them
- MCP configuration format is consistent with Claude Code's MCP setup
- AWS integration means potential access to CloudWatch/X-Ray telemetry data
- Lower priority for LLREM unless we specifically target enterprise AWS users

---

## 9. Cross-Agent Comparison Matrix

| Feature | Claude Code | Cursor | Cline/Roo | Aider | Gemini CLI | Codex CLI | Windsurf | Amazon Q |
|---------|------------|--------|-----------|-------|------------|-----------|----------|----------|
| **Storage Format** | SQLite + JSONL | SQLite (KV) | JSON files | Markdown | JSONL | JSONL | Encrypted | JSON (manual) |
| **Session Boundaries** | UUID-based | Workspace-based | Task-based | File-based | Hash-based | UUID-based | Session-based | Manual |
| **Token Tracking** | Per-message | No | Per-task | No | Per-session | Per-session | No | No |
| **Cost Tracking** | Per-message USD | No | Per-task USD | No | No | No | No | No |
| **Tool Use Logging** | Full I/O | Partial | Full I/O | Git diffs | Full I/O | Full I/O | Unknown | Partial |
| **Error Capture** | stderr + API errors | No | Tool errors | No | Tool errors | Tool errors | No | No |
| **Git Integration** | Branch tracking | No | Checkpoints | Auto-commits | No | No | No | No |
| **Context File** | CLAUDE.md | .cursor/rules/*.mdc | .clinerules | .aider.conf.yml | GEMINI.md | AGENTS.md | .windsurf/rules/ | .amazonq/rules/ |
| **Context File Format** | Markdown | YAML+Markdown | Markdown/dir | YAML | Markdown | Markdown | Markdown | Markdown |
| **Parseable** | Excellent | Medium | Good | Easy | Good | Good | Poor | Limited |
| **MCP Support** | Native | Native | Native | No | No | No | No | Native |

---

## 10. Common Patterns for Retrospective Analysis

### 10.1 Universally Available Data

These data points are available across most or all agents:

1. **Conversation text** - User prompts and assistant responses (all agents)
2. **Tool invocations** - What tools were called and with what inputs (most agents)
3. **Tool results** - Success/failure and output of tool executions (most agents)
4. **Error indicators** - stderr, error flags, retry patterns (most agents)
5. **Session boundaries** - When sessions start and end (all agents)
6. **Project context** - Working directory, git branch (most agents)
7. **Instructions file** - CLAUDE.md / AGENTS.md / GEMINI.md / .cursorrules (all agents)

### 10.2 Claude Code-Exclusive Data (Premium Signals)

These are only available in Claude Code and represent the highest-value signals:

1. **Per-message cost (USD)** - Precise cost attribution per response
2. **Per-message duration (ms)** - Response latency tracking
3. **Token usage breakdown** - Input, output, cache creation, cache read
4. **Cache efficiency** - `cache_creation_input_tokens` vs `cache_read_input_tokens`
5. **Context compaction events** - `isCompactSummary` marks window management
6. **Conversation tree structure** - `parentUuid` + `isSidechain` for branching analysis
7. **Model per-response** - Tracks which model served each response
8. **Stop reason** - Whether response ended due to `tool_use`, `end_turn`, `max_tokens`
9. **Hook integration points** - Real-time event hooks for live analysis

### 10.3 High-Value Patterns to Detect

| Pattern | Signal Source | Detection Method |
|---------|-------------|-----------------|
| Tool retry loops | Sequential tool_use with same tool and similar inputs | Count sequential calls to same tool |
| Context thrashing | `isCompactSummary` frequency | Rate of compaction events per session |
| Expensive dead ends | High cost + `isSidechain=true` | Cost aggregation on sidechain branches |
| Error cascades | Multiple consecutive stderr/is_error results | Sequential error counting |
| UI verification gaps | Text mentions of "look", "check", "see" without Playwright/browser tool | NLP + tool absence detection |
| Long thinking pauses | High `duration_ms` without proportional `output_tokens` | Duration/token ratio analysis |
| Cache misses | Low `cache_read_input_tokens` relative to session length | Cache efficiency tracking |
| Model downgrades | Model changes within a session | Track `model` field changes |
| Prompt repetition | Similar user messages within same session | Text similarity comparison |
| Permission friction | System messages about permission denials | Parse system message content |

---

## 11. LLREM Parser Design Implications

### 11.1 Recommended Parser Architecture

```
src/parsers/
├── base.ts                        # Abstract parser interface
├── claude-code/
│   ├── jsonl-parser.ts            # JSONL session file parser (primary)
│   ├── sqlite-parser.ts           # SQLite __store.db parser (legacy)
│   ├── config-reader.ts           # settings.json, permissions, hooks
│   └── project-mapper.ts          # Project directory <-> filesystem mapping
├── cline/
│   ├── task-parser.ts             # api_conversation_history.json parser
│   └── metadata-parser.ts         # task_metadata.json + taskHistory.json
├── aider/
│   ├── history-parser.ts          # .aider.chat.history.md parser
│   └── git-parser.ts              # Aider-authored git commit analysis
├── gemini-cli/
│   └── jsonl-parser.ts            # JSONL parser (similar to Claude Code)
├── codex-cli/
│   └── jsonl-parser.ts            # JSONL parser (similar to Claude Code)
└── common/
    ├── types.ts                   # Normalized session/message types
    └── normalizer.ts              # Agent-specific -> common format conversion
```

### 11.2 Normalized Data Model

All parsers should produce a common intermediate format:

```typescript
interface NormalizedSession {
  agentType: 'claude-code' | 'cline' | 'aider' | 'gemini-cli' | 'codex-cli';
  sessionId: string;
  projectPath: string;
  gitBranch?: string;
  startTime: Date;
  endTime: Date;
  messages: NormalizedMessage[];
  summary?: string;
  metrics: SessionMetrics;
}

interface NormalizedMessage {
  id: string;
  parentId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;                    // Text content
  toolCalls?: ToolCall[];             // Tool invocations
  toolResults?: ToolResult[];         // Tool results
  timestamp: Date;
  metrics?: MessageMetrics;
  flags: {
    isError: boolean;
    isSidechain: boolean;
    isCompactSummary: boolean;
    isToolResult: boolean;
  };
}

interface ToolCall {
  id: string;
  name: string;                       // Tool name
  input: Record<string, unknown>;     // Tool input parameters
}

interface ToolResult {
  toolCallId: string;
  success: boolean;
  stdout?: string;
  stderr?: string;
  isError: boolean;
}

interface MessageMetrics {
  costUsd?: number;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  model?: string;
  stopReason?: string;
}

interface SessionMetrics {
  totalCostUsd?: number;
  totalDurationMs?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  messageCount: number;
  toolCallCount: number;
  errorCount: number;
  compactionCount: number;
}
```

### 11.3 Priority Order for Implementation

1. **Claude Code JSONL Parser** - Richest data, primary target, ~60% of value
2. **Claude Code SQLite Parser** - Legacy support, ~10% of value
3. **Cline JSON Parser** - Second most popular agent, clean format, ~15% of value
4. **Aider Markdown Parser** - Simple format, git integration value, ~5% of value
5. **Gemini CLI JSONL Parser** - Growing adoption, similar to Claude Code, ~5% of value
6. **Codex CLI JSONL Parser** - Similar to Claude/Gemini parsers, ~3% of value
7. **Cursor SQLite Parser** - Complex extraction, opaque format, ~2% of value

### 11.4 Auto-Detection Strategy

LLREM should auto-detect which agent produced the data:

```typescript
function detectAgent(path: string): AgentType {
  // Check for Claude Code
  if (path.includes('.claude/projects/') && path.endsWith('.jsonl')) return 'claude-code';
  if (path.endsWith('__store.db')) return 'claude-code-legacy';

  // Check for Cline
  if (path.includes('saoudrizwan.claude-dev/tasks/')) return 'cline';
  if (path.includes('rooveterinaryinc.roo-cline/tasks/')) return 'roo-code';

  // Check for Aider
  if (path.endsWith('.aider.chat.history.md')) return 'aider';

  // Check for Gemini CLI
  if (path.includes('.gemini/tmp/') && path.endsWith('.jsonl')) return 'gemini-cli';

  // Check for Codex CLI
  if (path.includes('.codex/sessions/') && path.endsWith('.jsonl')) return 'codex-cli';
}
```

---

## Sources

### Claude Code (Direct Analysis)
- Primary source: `daniels-data/.claude/` directory (real production data)
- SQLite schema via `sqlite3` inspection
- JSONL format via direct file parsing
- Hook event format from `search-hook-debug.log`

### Cursor
- [Cursor Changelog](https://changelog.cursor.sh/)
- [Cursor DB MCP Server](https://github.com/jbdamask/cursor-db-mcp)
- [Cursor Settings Location](https://www.jackyoustra.com/blog/cursor-settings-location)
- [Cursor Data Storage Structure](https://zread.ai/S2thend/cursor-history/6-cursor-data-storage-structure)
- [How to Recover Lost Chat History in Cursor](https://dredyson.com/how-to-recover-lost-chat-history-in-cursor-ide-using-data-analytics-bi-tools/)

### Cline / Roo Code
- [Task History Recovery Guide - Cline](https://docs.cline.bot/troubleshooting/task-history-recovery)
- [Cline Architecture Overview (DeepWiki)](https://deepwiki.com/cline/cline/1.3-architecture-overview)
- [Roo Code vs Cline](https://www.qodo.ai/blog/roo-code-vs-cline/)

### Aider
- [Aider Git Integration](https://aider.chat/docs/git.html)
- [Aider Usage Docs](https://aider.chat/docs/usage.html)
- [Aider FAQ](https://aider.chat/docs/faq.html)

### Gemini CLI
- [Gemini CLI Configuration](https://google-gemini.github.io/gemini-cli/docs/get-started/configuration.html)
- [Session Management | Gemini CLI](https://geminicli.com/docs/cli/session-management/)
- [JSONL Storage Issue #15292](https://github.com/google-gemini/gemini-cli/issues/15292)
- [Google Developers Blog: Session Management](https://developers.googleblog.com/pick-up-exactly-where-you-left-off-with-session-management-in-gemini-cli/)

### OpenAI Codex CLI
- [Codex CLI Features](https://developers.openai.com/codex/cli/features/)
- [Advanced Configuration](https://developers.openai.com/codex/config-advanced/)
- [Custom Instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md/)
- [Session Persistence (DeepWiki)](https://deepwiki.com/openai/codex/3.3-session-management-and-persistence)

### Windsurf
- [Cascade Memories](https://docs.windsurf.com/windsurf/cascade/memories)
- [Windsurf Rules Directory](https://windsurf.com/editor/directory)

### Amazon Q Developer
- [Amazon Q Data Storage](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/data-storage.html)
- [Conversation Persistence](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line-chat-persistence.html)
