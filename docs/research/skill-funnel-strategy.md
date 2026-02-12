# Skill-as-Funnel Strategy for LLREM

> Strategy document for using a lightweight Claude Code skill as the entry point to the full LLREM (LLM Retrospective Engine) package. Covers pattern analysis, skill design, distribution, cross-agent compatibility, and includes a complete production-ready SKILL.md draft. February 2026.

## Table of Contents

1. [The New Landscape: /insights Changes Everything](#1-the-new-landscape-insights-changes-everything)
2. [Skill-as-Funnel Pattern Analysis](#2-skill-as-funnel-pattern-analysis)
3. [The Prompt-First Approach](#3-the-prompt-first-approach)
4. [Skill Design for Maximum Leverage](#4-skill-design-for-maximum-leverage)
5. [The Grow-Up Story](#5-the-grow-up-story)
6. [Cross-Agent Skill Compatibility](#6-cross-agent-skill-compatibility)
7. [Distribution and Discovery](#7-distribution-and-discovery)
8. [Precedent Research: Freemium Funnel Patterns](#8-precedent-research-freemium-funnel-patterns)
9. [Complete Production-Ready Skill](#9-complete-production-ready-skill)
10. [Strategic Recommendations](#10-strategic-recommendations)

---

## 1. The New Landscape: /insights Changes Everything

### Claude Code's Built-in /insights Command

In early February 2026, Anthropic launched `/insights` -- a built-in command that reads your message history from the past month, summarizes your projects, analyzes how you use Claude Code, and suggests workflow improvements. This is directly relevant to LLREM because it validates the core thesis while simultaneously occupying part of the problem space.

**How /insights works internally:**
- Collects all session logs from `~/.claude/projects/`
- Filters out agent sub-sessions and internal operations
- Extracts structured metadata (tokens, tools used, duration) from each session
- For transcripts exceeding 30,000 characters, chunks into 25,000-character segments and summarizes each chunk before analysis
- Runs LLM analysis to extract qualitative "facets" from session transcripts
- Caches facets in `~/.claude/usage-data/facets/` for faster subsequent runs
- Generates an interactive HTML report saved to `~/.claude/usage-data/report.html`

**What /insights does well:**
- Zero setup -- it is built in
- Comprehensive usage statistics (message counts, session counts, file modifications)
- Tool usage pattern breakdowns
- Project area analysis
- Personalized suggestions

**What /insights does NOT do (LLREM's opportunity):**
- Does not detect specific struggle patterns (UI verification failures, tool retry loops, error cascades)
- Does not map patterns to concrete fixes (no diff generation, no MCP recommendations)
- Does not modify any configuration files
- Does not suggest new MCP servers, hooks, or rules based on observed patterns
- Does not track improvement over time (no closed-loop optimization)
- Does not aggregate patterns across sessions into actionable categories
- Output is a read-only HTML report, not actionable diffs

**Strategic implication:** /insights proves users want session analysis. LLREM's skill should position itself as the _action layer_ -- "insights told you what's wrong, LLREM fixes it." The skill should explicitly reference /insights where useful: "Run /insights first to see your patterns, then run /llrem-review to get fixes."

---

## 2. Skill-as-Funnel Pattern Analysis

### Existing Examples of Skills as Entry Points

Several tools in the Claude Code ecosystem already use skills as lightweight entry points that funnel users toward deeper tool adoption:

#### SpecStory: The Canonical Example

SpecStory is the clearest precedent for the skill-as-funnel pattern:

1. **Free skills layer** (`specstoryai/agent-skills`): A collection of agent skills that work with `.specstory/history/` session data:
   - `specstory-session-summary` -- Generates standup-ready summaries of recent AI coding sessions
   - `specstory-yak` -- Analyzes yak shaving patterns in coding sessions
   - `specstory-link-trail` -- Tracks URLs fetched during sessions
   - `specstory-organize` -- Keeps history files organized by year/month
   - `specstory-guard` -- Pre-commit hook skill

2. **The funnel mechanism**: Skills require SpecStory to be installed first (they read from `.specstory/history/`). Installing the free skills naturally leads to installing the SpecStory CLI, which in turn promotes the cloud sync product.

3. **Progressive value**: Free skills provide immediate utility (summaries, organization), but the full SpecStory product adds searchability, cloud sync, sharing, and historical analysis.

**Key insight:** SpecStory's skills do not nag about upgrading. They deliver real value and the limitations naturally surface (e.g., "I can only analyze sessions that are in `.specstory/history/` -- install SpecStory CLI to capture all sessions automatically").

#### claude-mem: Plugin-First with Skill Discovery

claude-mem follows a different pattern but with similar funnel dynamics:

1. **Plugin entry point**: Install via `/plugin marketplace add thedotmack/claude-mem`
2. **Skill interface**: The `mem-search` skill provides natural language queries over session memory
3. **Progressive disclosure**: 3-layer token-efficient workflow (search -> timeline -> get_observations) that starts compact and expands
4. **The funnel**: Basic memory works immediately; advanced features (Chroma vector search, web viewer UI) require the full worker service running on port 37777

#### Anthropic's Official Skills Repository

The `anthropics/skills` repository (50+ skills) demonstrates the pattern at scale:
- Document processing skills (docx, pdf, pptx, xlsx) work standalone but implicitly showcase what Claude Code can do
- Development tools like Playwright skill demonstrate MCP integration
- Each skill is a self-contained demonstration of a capability that benefits from deeper integration

### The User Journey: Skill to Full Package

Based on analyzing these patterns, the typical journey is:

```
1. Discovery     -- User sees skill mentioned on GitHub, Twitter, awesome-list, or SkillsMP
2. Try it        -- `npx skills add owner/repo` or copy SKILL.md to ~/.claude/skills/
3. First value   -- Skill produces useful output in 30 seconds
4. Hit limits    -- "This analysis is great but I wish it could also..."
5. Investigate   -- Skill mentions the full tool in its output or README
6. Install full  -- User installs the npm package / plugin for deeper features
7. Integrate     -- User sets up hooks, MCP servers, custom agents
```

The critical insight is step 4: **the skill must deliver genuine value while naturally exposing its own limitations.** Users should never feel tricked -- they should feel that the skill is doing everything it can and that the full tool simply does _more_.

### What Makes Skills Funnel Effectively

| Factor | Why it works | Anti-pattern |
|--------|-------------|-------------|
| **Genuine standalone utility** | Users feel the skill respects their time | Skill is a teaser that withholds results |
| **Natural limitation exposure** | "I found 3 patterns but can't auto-apply fixes from a skill" | Hard-coded upgrade prompts |
| **Zero friction install** | One command or one file copy | Requires npm install, config, API keys |
| **Output references the full tool** | Footer: "For automated fixes, see github.com/..." | Popup/modal/interstitial style nagging |
| **Works without internet** | Pure local analysis | Requires cloud service or API |
| **Cross-agent compatible** | SKILL.md works in Claude Code AND Codex CLI | Claude Code only |

---

## 3. The Prompt-First Approach

### The Manual Pattern That Already Works

The user has already validated the core concept by manually prompting Claude Code: "review my recent session logs and identify improvements." This works because Claude Code can:

1. Read JSONL files from `~/.claude/projects/` using Read/Glob tools
2. Parse the JSON structure of each line
3. Identify patterns through its general reasoning capabilities
4. Suggest improvements in natural language

**The problem with the manual approach:**
- Requires remembering the right prompt each time
- No consistency in analysis -- different prompts produce different results
- No structured output format
- No institutional knowledge of what patterns to look for
- No connection to concrete fixes (MCP suggestions, config diffs, hook recommendations)
- No aggregation across sessions
- Consumes main context window with transcript data

### How a Skill Formalizes This

A skill turns the ad-hoc prompt into a repeatable, optimized process:

```
Manual:  "Hey Claude, look at my recent sessions and tell me what could be better"
         (vague, inconsistent, no structure)

Skill:   /llrem-review
         (specific, consistent, structured, includes institutional knowledge)
```

**What the skill adds over raw prompting:**

1. **Curated analysis framework**: The skill instructions encode knowledge about what patterns matter, what to look for, and how to categorize findings. This is the equivalent of a senior engineer's mental checklist versus a junior engineer's "looks fine to me."

2. **Dynamic context injection**: Using `!command` syntax, the skill automatically pulls in recent session data, current config state, and project structure -- no manual file navigation needed.

3. **Structured output format**: The skill specifies exactly how to format findings (severity, category, evidence, suggested fix), making output actionable rather than conversational.

4. **Pattern library**: The skill includes known patterns to detect (UI verification failures, tool retry loops, context thrashing) that a generic prompt would not know to look for.

5. **Fix templates**: For each detected pattern, the skill includes specific remediation steps -- not just "you should use Playwright" but the exact `.mcp.json` config to add.

6. **Cross-session awareness**: Through dynamic context injection, the skill can read multiple session files and aggregate patterns rather than analyzing one session at a time.

### The Minimal Viable Skill

The absolute minimum skill that provides real value is remarkably simple -- it is essentially a well-crafted prompt with dynamic context:

```markdown
---
name: session-review
description: Reviews recent Claude Code sessions to identify improvement opportunities
---

Review the following recent session data and identify patterns that suggest
configuration improvements, missing tools, or workflow optimizations.

## Recent Session Data
!`ls -lt ~/.claude/projects/*/  2>/dev/null | head -20`

## Current Configuration
!`cat CLAUDE.md 2>/dev/null || echo "No CLAUDE.md found"`
!`cat .mcp.json 2>/dev/null || echo "No .mcp.json found"`

Look for these patterns:
1. Repeated tool failures (same tool failing 3+ times in a row)
2. Visual/UI verification without browser tools
3. Large context causing compaction
4. Permission friction from repeated denials
5. Missing test automation

For each finding, provide:
- **Pattern**: What you detected
- **Evidence**: Specific examples from the sessions
- **Fix**: Concrete configuration change (show the diff)
```

This is approximately 30 lines and already more useful than a manual prompt. But it has obvious limitations that the full package solves: it cannot auto-apply fixes, it cannot read the actual JSONL content (just file listings), and it has no persistent memory of past analyses.

### How the Skill Accesses Transcript Data

There are several mechanisms for getting session data into the skill's context:

**1. Dynamic Context Injection (`!command` syntax)**

The most powerful approach. Commands run before the skill content is sent to Claude:

```markdown
## Recent sessions (metadata only - keep tokens low)
!`for f in $(ls -t ~/.claude/projects/*/*.jsonl 2>/dev/null | head -5); do echo "=== $f ==="; head -1 "$f" | jq -r '.type // "unknown"'; wc -l < "$f"; done`
```

**2. Hooks providing `transcript_path`**

When invoked from a hook context (e.g., SessionEnd), the skill can receive `transcript_path` via stdin JSON:

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/user/.claude/projects/project-name/abc123.jsonl"
}
```

**3. Glob/Read tool access**

The skill can instruct Claude to use Read and Glob tools to access transcript files:

```markdown
Use the Glob tool to find recent JSONL files in ~/.claude/projects/
and Read the last 100 lines of each to analyze conversation patterns.
```

**4. Session variables**

`${CLAUDE_SESSION_ID}` provides the current session ID, which can be used to locate the current transcript.

**Recommended approach for the LLREM skill:** Use a combination of `!command` for lightweight metadata injection (file sizes, line counts, recent timestamps) and tool-based reading for deeper analysis of specific sessions. This keeps initial context small while allowing deep dives.

---

## 4. Skill Design for Maximum Leverage

### Frontmatter Configuration Strategy

The frontmatter settings significantly affect how the skill operates. Here is the recommended configuration with rationale:

```yaml
---
name: llrem-review
description: >-
  Analyzes recent Claude Code sessions to identify struggle patterns, workflow
  inefficiencies, and missing tool integrations. Suggests concrete fixes
  including CLAUDE.md updates, MCP server recommendations, and hook
  configurations. Run after a session to improve future performance.
argument-hint: "[days|session-id]"
disable-model-invocation: true
context: fork
agent: general-purpose
allowed-tools: Read, Grep, Glob, Bash, Write
---
```

**Rationale for each setting:**

| Setting | Value | Why |
|---------|-------|-----|
| `name` | `llrem-review` | Short, memorable, clearly indicates it reviews sessions |
| `description` | (long, detailed) | This is the PRIMARY triggering mechanism -- Claude uses it to decide relevance. Include key terms: "sessions," "patterns," "fixes," "CLAUDE.md," "MCP" |
| `argument-hint` | `[days\|session-id]` | Allow `7d` for time-scoped or a specific session ID |
| `disable-model-invocation` | `true` | User-controlled only -- avoid surprise context consumption. This is a deliberate analysis tool, not an auto-trigger |
| `context: fork` | Yes | Critical -- runs in isolated subagent to keep analysis out of main context window. Transcript analysis can consume many tokens |
| `agent` | `general-purpose` | Needs Write access for generating fix files; Explore would be too limited |
| `allowed-tools` | Read, Grep, Glob, Bash, Write | Needs file reading for transcripts, Bash for jq/data processing, Write for generating fix files |

**Why NOT `model: haiku`:** Analysis quality matters more than speed here. Haiku might miss subtle patterns. Let the user's default model handle it. For the full LLREM package, tiered analysis (heuristics -> haiku -> default model) makes sense, but for the skill, use the best available.

### How the Skill Should Reference the Full Package

The skill should reference the full LLREM package in two places:

**1. In the analysis output (natural, contextual):**

The skill instructions should include something like:

```markdown
## Output Format

After presenting your findings, include a "Next Steps" section. If you found
3 or more actionable patterns, mention:

"For automated fix application and continuous monitoring, consider the full
LLREM package: `npm install -g llrem` (https://github.com/user/llrem).
LLREM can auto-apply these fixes, set up SessionEnd hooks for continuous
analysis, and track improvement over time."

Only mention this if the analysis found substantive issues. Never mention it
if no significant patterns were detected.
```

**2. In the skill's README/supporting docs (not in runtime output):**

The skill directory should include a `references/full-package.md` that describes the upgrade path, loaded only if the user asks about it.

### Output Strategy: Report vs. Direct Updates vs. Both

The skill should produce a **structured report with ready-to-apply fix blocks** but should NOT directly modify CLAUDE.md or other config files. Rationale:

1. **Trust**: Users need to see and approve changes before they are applied
2. **Safety**: A skill modifying CLAUDE.md could break existing instructions
3. **Funnel**: Direct modification is a feature of the full package (with backups, rollback, etc.)
4. **Transparency**: Showing the diff educates the user about what changes and why

The output format should be:

```markdown
## Session Review Results

### Finding 1: UI Verification Without Browser Tools
**Severity**: High | **Frequency**: 4 sessions in the last 7 days
**Pattern**: You asked Claude to verify visual changes but no browser
automation tool (Playwright MCP) is configured.
**Evidence**: Sessions on 2026-02-08, 2026-02-09 (2x), 2026-02-10 contain
phrases like "does that look right" and "check the UI" without any
browser-based verification.

**Suggested Fix** (add to `.mcp.json`):
```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-playwright"]
    }
  }
}
```

### Finding 2: Repeated Test Failures
...

## Summary
- 3 high-severity patterns detected
- 1 medium-severity pattern detected
- Estimated token savings from fixes: ~15% per session

## Next Steps
- To apply these fixes automatically with backup: `npm install -g llrem && llrem apply`
- To set up continuous monitoring: `llrem hooks install`
```

### Dynamic Context Design

The skill should use `!command` to inject three categories of context:

**1. Session metadata (always injected, low token cost):**
```markdown
## Recent Session Metadata
!`find ~/.claude/projects -name "*.jsonl" -mtime -7 -exec sh -c 'echo "FILE: {}"; wc -l < "{}"; head -1 "{}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get(\"type\",\"?\"),d.get(\"timestamp\",\"?\"))" 2>/dev/null' \; 2>/dev/null | head -60`
```

**2. Current configuration state (always injected, moderate token cost):**
```markdown
## Current Project Configuration
!`cat CLAUDE.md 2>/dev/null | head -100 || echo "No CLAUDE.md"`
!`cat .mcp.json 2>/dev/null || echo "No .mcp.json"`
!`cat .claude/settings.json 2>/dev/null || echo "No .claude/settings.json"`
```

**3. Session content samples (tool-based, on-demand, high token cost):**
```markdown
For deeper analysis, use the Read tool to examine the most recent 3-5 JSONL
files. Focus on lines containing "is_error", "tool_use", and "compactSummary"
to identify failure patterns and context management issues.
```

---

## 5. The Grow-Up Story

### Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Tier 1: Skill (Free, Zero-Install)                             │
│  ─────────────────────────────────                              │
│  • Copy SKILL.md to ~/.claude/skills/ or npx skills add         │
│  • Analyzes recent sessions on demand                           │
│  • Generates human-readable report with fix suggestions         │
│  • Works in Claude Code AND Codex CLI                           │
│  • No dependencies, no config, no API keys                      │
│                                                                 │
│  Limitations:                                                   │
│  × Cannot auto-apply fixes (generates diffs, user applies)      │
│  × No persistent memory across analyses                         │
│  × No automatic triggers (user must invoke /llrem-review)       │
│  × Single-session or limited multi-session analysis             │
│  × No historical trend tracking                                 │
│  × Token-intensive (uses context window for analysis)           │
├─────────────────────────────────────────────────────────────────┤
│  Tier 2: CLI Package (npm install -g llrem)                     │
│  ──────────────────────────────────────                         │
│  Everything in Tier 1, plus:                                    │
│  • Automated fix application with backup/rollback               │
│  • Heuristic-first analysis (fast, no LLM cost)                 │
│  • Persistent pattern database across sessions                  │
│  • SessionEnd hook for continuous monitoring                     │
│  • Multi-session aggregation and trend analysis                 │
│  • Interactive Ink-based terminal UI                             │
│  • JSON output for CI/CD integration                            │
│  • Time-scoped analysis (--since=7d, --since=30d)               │
│                                                                 │
│  Limitations:                                                   │
│  × Requires npm install                                         │
│  × Manual hook configuration                                    │
│  × No deep Claude Code integration (no subagent memory)         │
├─────────────────────────────────────────────────────────────────┤
│  Tier 3: Plugin (Full Integration)                              │
│  ─────────────────────────────────                              │
│  Everything in Tier 2, plus:                                    │
│  • One-click install via /plugin install                         │
│  • Bundled hooks (SessionEnd, PostToolUseFailure, SessionStart) │
│  • Custom analysis agent with persistent memory                 │
│  • Real-time pattern capture during sessions                    │
│  • Agent team support for parallel analysis                     │
│  • Namespaced skills (/llrem:analyze, /llrem:apply, /llrem:status)│
│  • Optional MCP server for cross-tool access                    │
│  • CLAUDE.md rules generation with path conditions              │
└─────────────────────────────────────────────────────────────────┘
```

### The Natural Escalation Path

Each tier's limitations naturally surface during use, creating organic upgrade moments:

**Skill -> CLI upgrade moments:**
- "This skill found 5 patterns but I have to manually apply each fix" -> `llrem apply` auto-applies with backup
- "I keep running /llrem-review and seeing the same issues" -> `llrem` tracks what has been fixed
- "I want this to run automatically after every session" -> `llrem hooks install` adds SessionEnd hook
- "Analysis is slow because it uses my context window" -> CLI uses heuristics first, LLM only when needed

**CLI -> Plugin upgrade moments:**
- "I want analysis results injected at session start" -> Plugin's SessionStart hook loads prior results
- "I want real-time failure capture, not just post-session" -> Plugin's PostToolUseFailure hook
- "I want the analyzer to remember my project's specific patterns" -> Plugin agent with `memory: user`
- "I want a single install that sets up everything" -> Plugin bundles hooks, skills, agents, MCP config

### What Each Tier Demonstrates

| Capability | Skill | CLI | Plugin |
|-----------|-------|-----|--------|
| Pattern detection | LLM-only (in context) | Heuristics + LLM | Heuristics + LLM + memory |
| Fix generation | Text suggestions | Diff-ready patches | Auto-applied with backup |
| Trigger mechanism | Manual (/llrem-review) | Manual + SessionEnd hook | Automatic (hooks + agents) |
| Persistence | None | SQLite database | Database + agent memory |
| Multi-session analysis | Limited (context window) | Full (direct parsing) | Full + real-time capture |
| Output format | Markdown in conversation | Terminal UI + JSON | In-conversation + terminal |
| Config scope | Current project only | Any project | Any project + global patterns |
| Cross-agent support | Claude Code + Codex CLI | Claude Code + others via parsers | Claude Code only |

---

## 6. Cross-Agent Skill Compatibility

### Agent Skills Standard (agentskills.io)

The Agent Skills specification, originally published by Anthropic in December 2025 and adopted by Microsoft, OpenAI, Atlassian, Figma, Cursor, and GitHub, defines a universal format for AI agent capabilities. The same SKILL.md file works across multiple platforms.

**Adopters and their skill directories:**

| Agent | Skill Directory | SKILL.md Support |
|-------|----------------|-----------------|
| Claude Code | `~/.claude/skills/` or `.claude/skills/` | Full (native, originator of spec) |
| OpenAI Codex CLI | `~/.codex/skills/` | Full (adopted same spec) |
| GitHub Copilot / VS Code | VS Code agent skills API | Partial (adapted format) |
| Cursor | `.cursor/skills/` | Partial |
| Windsurf | Limited | Partial |
| OpenCode | Via skills CLI | Full |

### Designing for Cross-Agent Compatibility

The LLREM skill should work in both Claude Code and Codex CLI. Key considerations:

**1. Transcript format differences:**

| Agent | Transcript Location | Format |
|-------|-------------------|--------|
| Claude Code | `~/.claude/projects/<project>/<session>.jsonl` | JSONL with rich metadata |
| Codex CLI | `~/.codex/sessions/` (varies) | JSONL (similar structure) |

The skill should detect which agent is running and adapt:

```markdown
## Detect Agent Environment
!`if [ -d ~/.claude/projects ]; then echo "AGENT=claude-code"; elif [ -d ~/.codex/sessions ]; then echo "AGENT=codex-cli"; else echo "AGENT=unknown"; fi`
```

**2. Tool availability:**

Both Claude Code and Codex CLI support Read, Grep, Glob, and Bash tools. The skill should stick to these common tools for maximum compatibility.

**3. Variable substitution:**

- `${CLAUDE_SESSION_ID}` is Claude Code-specific
- The skill should gracefully handle missing variables with fallbacks

**4. Frontmatter compatibility:**

Some frontmatter fields are Claude Code-specific (`context: fork`, `agent:`, `hooks:`). For cross-agent compatibility, the skill should work correctly even if these fields are ignored by other agents.

### Practical Limitations

While the Agent Skills spec is cross-agent, some features are inherently platform-specific:

- **Dynamic context injection** (`!command`): Supported in Claude Code and Codex CLI, but may not work in IDE-integrated agents
- **context: fork**: Claude Code only -- other agents will run the skill in the main context
- **Hooks**: Platform-specific event systems, not portable
- **MCP references**: Configuration differs by platform

**Recommendation:** Design the core SKILL.md to work anywhere, with a Claude Code-specific `references/claude-code-extras.md` file that adds platform-specific features. The skill should detect its environment and adapt its instructions accordingly.

---

## 7. Distribution and Discovery

### How Users Find and Install Skills

**Discovery channels (ranked by effectiveness):**

1. **awesome-claude-skills lists** (GitHub) -- Curated lists like travisvn/awesome-claude-skills, VoltAgent/awesome-agent-skills, ComposioHQ/awesome-claude-skills. Getting listed here is the single most impactful distribution action.

2. **SkillsMP marketplace** (skillsmp.com) -- The emerging marketplace with 66,000+ skills indexed from GitHub. Automatic ingestion from public repos with 2+ stars.

3. **skills.sh directory** (Vercel) -- Launched January 2026, a directory and leaderboard platform. Growing quickly.

4. **Social media / developer blogs** -- Twitter/X threads, dev.to posts, Medium articles demonstrating the skill in action generate viral adoption.

5. **GitHub search** -- Users search for "claude code skill [problem]" and find repos.

6. **Word of mouth** -- Especially in the Anthropic Developer Discord (58,000+ members).

7. **Plugin marketplaces** -- For the Tier 3 plugin version: the official anthropics/claude-plugins-official repo and community marketplaces like claudemarketplaces.com.

### Installation Methods

```bash
# Method 1: skills CLI (recommended for cross-agent)
npx skills add owner/llrem --skill llrem-review

# Method 2: Manual copy (simplest)
mkdir -p ~/.claude/skills/llrem-review
curl -o ~/.claude/skills/llrem-review/SKILL.md https://raw.githubusercontent.com/owner/llrem/main/skill/SKILL.md

# Method 3: Git clone (for contributing)
git clone https://github.com/owner/llrem
cp -r llrem/skill/llrem-review ~/.claude/skills/

# Method 4: Plugin install (Tier 3)
/plugin install llrem@anthropics/claude-plugins-official
```

### What Makes a Skill Go Viral

Based on analysis of successful skills in the ecosystem:

| Factor | Impact | LLREM Application |
|--------|--------|------------------|
| **Immediate visible value** | Highest | First run produces actionable findings within 60 seconds |
| **Shareable output** | High | Generates a report that users screenshot and share on Twitter |
| **Solves a universal pain** | High | "Why does Claude keep making the same mistakes?" is universal |
| **Zero config** | High | No API keys, no setup, just install and run |
| **Memorable name** | Medium | `/llrem-review` -- short, descriptive, easy to type |
| **Good README** | Medium | Shows before/after examples, real output screenshots |
| **Listed in awesome lists** | Medium | Submit PRs to all major awesome-claude-skills repos |
| **Cross-agent compatible** | Medium | Works in Codex CLI too, expanding addressable market |
| **Active maintenance** | Medium | Regular updates show the skill is alive |

### SEO and Discoverability Strategy

For the GitHub repository:

- **Repository name**: `llrem` (short, unique, searchable)
- **Description**: "Self-improving AI coding assistant optimizer. Analyzes Claude Code sessions, detects struggle patterns, generates config fixes."
- **Topics/tags**: `claude-code`, `agent-skills`, `claude-skills`, `ai-coding`, `developer-tools`, `session-analysis`, `claude-md`, `mcp`, `workflow-optimization`
- **README sections**: Quick start (30 seconds to first value), example output, comparison with /insights
- **Skill subdirectory**: Prominently linked from README with one-command install

For SkillsMP/skills.sh automatic indexing:
- Ensure the repository has 2+ stars (minimum for SkillsMP ingestion)
- Include proper SKILL.md frontmatter with descriptive `description` field
- Use standard skill directory structure

---

## 8. Precedent Research: Freemium Funnel Patterns

### Open Source Tools with Lightweight-to-Full Funnels

Several successful open source projects follow the pattern of a lightweight entry point leading to deeper adoption:

#### 1. Prettier: npx -> devDependency -> CI integration

**Entry point:** `npx prettier --write .` -- instant formatting with zero install
**Upgrade path:** `npm install --save-dev prettier` for project lock, then `.prettierrc` config, then pre-commit hooks via Husky, then CI checks
**Lesson for LLREM:** The `npx` pattern proves that zero-install first-use dramatically increases adoption. LLREM's skill is the equivalent of `npx prettier --write .`

#### 2. ESLint: npx init -> config -> plugins -> custom rules

**Entry point:** `npx eslint --init` generates a starter config
**Upgrade path:** Custom rules, shareable configs (`eslint-config-airbnb`), plugins, IDE integration
**Lesson for LLREM:** ESLint's `--init` command generates a config file that the user then customizes. LLREM's skill generates CLAUDE.md improvements that the user reviews and applies. Same pattern: tool generates, user approves.

#### 3. Husky: npx init -> git hooks -> lint-staged -> full CI

**Entry point:** `npx husky-init && npm install` -- adds git hooks in seconds
**Upgrade path:** Custom hooks, lint-staged integration, CI/CD pipeline hooks
**Lesson for LLREM:** Husky's lightweight init creates the infrastructure (git hooks) that enables the full ecosystem. LLREM's skill creates awareness of patterns; the full package creates the infrastructure (hooks, agents) for continuous improvement.

#### 4. Next.js: create-next-app -> pages -> API routes -> middleware -> full framework

**Entry point:** `npx create-next-app` -- full project scaffold in 30 seconds
**Upgrade path:** Progressive feature adoption (pages -> API routes -> middleware -> edge functions -> server components)
**Lesson for LLREM:** Next.js does not require you to use all features. You start simple and add complexity as needed. LLREM should follow the same progressive disclosure: skill (simple analysis) -> CLI (automated fixes) -> plugin (full integration).

#### 5. Sentry: SDK init -> error tracking -> performance -> session replay

**Entry point:** `npx @sentry/wizard@latest -i nextjs` -- auto-instruments a project
**Upgrade path:** Error tracking (free tier) -> performance monitoring (paid) -> session replay (paid) -> profiling (paid)
**Lesson for LLREM:** Sentry's wizard modifies your codebase to add instrumentation, similar to how LLREM modifies CLAUDE.md to add instructions. The free tier provides enough value to demonstrate the concept; paid tiers unlock deeper features.

#### 6. Tailwind CSS: CDN script -> npm install -> config -> plugins

**Entry point:** Single `<script>` tag for CDN version -- instant utility-first CSS
**Upgrade path:** npm install for production builds, `tailwind.config.js` for customization, plugins for extensions
**Lesson for LLREM:** The CDN script is deliberately limited (no custom config, no purging). It works well enough to prove the concept but has obvious limitations that drive npm install. LLREM's skill should be similarly "good enough to prove it" but obviously limited.

### The Common Pattern

All successful freemium funnels share these characteristics:

```
1. Zero-friction entry      -- No account, no install, no config (or near-zero)
2. Immediate value           -- Useful output within 60 seconds
3. Natural limitation        -- Limitations emerge through use, not artificial gates
4. Clear upgrade path        -- One command to unlock the next tier
5. Value accumulates         -- Each tier builds on the previous, not replaces it
6. No data lock-in           -- Users can revert without losing anything
```

**LLREM maps perfectly to this:**

| Step | LLREM Implementation |
|------|---------------------|
| Zero-friction entry | `npx skills add owner/llrem` or copy one SKILL.md file |
| Immediate value | `/llrem-review` produces findings in 30-60 seconds |
| Natural limitation | "I found 4 patterns but can't auto-apply fixes from a skill" |
| Clear upgrade path | "Run `npm install -g llrem && llrem apply` to auto-fix" |
| Value accumulates | Skill findings inform CLI; CLI database informs plugin agent |
| No data lock-in | All output is Markdown/JSON, all fixes are standard configs |

---

## 9. Complete Production-Ready Skill

### Directory Structure

```
llrem-review/
  SKILL.md                    # Main skill file (below)
  references/
    patterns.md               # Detailed pattern descriptions and fix templates
    mcp-catalog.md            # MCP server recommendations with configs
    upgrade-guide.md          # Guide to the full LLREM package
  scripts/
    session-metadata.sh       # Extracts metadata from JSONL files
    recent-sessions.sh        # Lists recent sessions with stats
  examples/
    sample-output.md          # Example of what the skill produces
```

### SKILL.md (Complete, Production-Ready)

```yaml
---
name: llrem-review
description: >-
  Analyzes recent Claude Code sessions to identify struggle patterns (tool retry
  loops, UI verification gaps, context thrashing, error cascades, permission
  friction) and generates concrete fix suggestions including CLAUDE.md updates,
  MCP server recommendations, hook configurations, and settings changes. Produces
  a structured report with diff-ready fixes. Run after one or more sessions to
  improve future Claude Code performance. For deeper analysis with automated fix
  application, see the full LLREM package.
argument-hint: "[days-back (default: 7)]"
disable-model-invocation: true
context: fork
agent: general-purpose
allowed-tools: Read, Grep, Glob, Bash
---

# LLREM Session Review

You are a Claude Code session analyst. Your job is to review recent coding
sessions, identify patterns that indicate workflow inefficiencies or missing
tool integrations, and generate concrete, applicable fixes.

## Step 1: Gather Session Data

First, determine the analysis scope. The user may provide a number of days
to look back (default: 7). Use $ARGUMENTS if provided, otherwise default to 7.

Find recent session transcript files:

```bash
find ~/.claude/projects -name "*.jsonl" -mtime -${DAYS_BACK:-7} -type f 2>/dev/null | sort -t/ -k6 -r | head -20
```

For each transcript file found, extract key metadata by reading the first and
last few lines to get session start/end times, and scanning for patterns.

## Step 2: Analyze for Known Patterns

For each session transcript, use Grep and Read to search for these specific
patterns. You MUST check for ALL of them.

### Pattern 1: UI/Visual Verification Without Browser Tools
**Search for**: User messages containing "look", "looks right", "check the UI",
"visually", "screenshot", "see if", "does it look", "appearance", "layout",
"styling", "CSS" combined with absence of any Playwright/browser tool usage.
**Signal**: User wants visual verification but no browser automation is configured.
**Fix**: Suggest adding Playwright MCP to `.mcp.json`.

### Pattern 2: Tool Retry Loops
**Search for**: 3 or more consecutive tool_use blocks with the same tool name
and similar inputs, especially where results contain errors.
**Signal**: Claude is stuck in a retry loop, burning tokens without progress.
**Fix**: Suggest CLAUDE.md instruction about when to stop retrying and ask for help.

### Pattern 3: Test Automation Gaps
**Search for**: Manual "npm test" or "pytest" or "cargo test" commands run
repeatedly, especially after file edits. Also look for test failures that
were not caught before committing.
**Signal**: Tests are run manually instead of automatically.
**Fix**: Suggest a PostToolUse hook on Write/Edit that runs relevant tests.

### Pattern 4: Context Thrashing / High Compaction
**Search for**: Lines containing "isCompactSummary" or "compact" type records.
Count the frequency relative to total session length.
**Signal**: Context window is filling up too quickly, causing information loss.
**Fix**: Suggest file inclusion rules in CLAUDE.md, context: fork for heavy
skills, or RepoMapper MCP for large codebases.

### Pattern 5: Error Cascades
**Search for**: 3 or more consecutive tool results with "is_error": true or
stderr output.
**Signal**: Claude is not recovering from errors effectively.
**Fix**: Suggest CLAUDE.md instruction about error recovery strategies.

### Pattern 6: Permission Friction
**Search for**: System messages about permission denials or repeated
permission requests for the same tool.
**Signal**: Permission configuration is too restrictive for the workflow.
**Fix**: Suggest updating `.claude/settings.json` permission allowlists.

### Pattern 7: Expensive Dead Ends (Sidechain Analysis)
**Search for**: Lines with "isSidechain": true, especially in long sequences.
Estimate token cost of sidechain branches.
**Signal**: Claude is exploring approaches that get abandoned.
**Fix**: Suggest planning instructions in CLAUDE.md ("Think through your
approach before starting implementation").

### Pattern 8: Missing Instructions (Repeated Clarifications)
**Search for**: User messages that correct Claude's behavior with phrases like
"no, I meant", "that's not what I wanted", "actually, you should", "I already
told you", or similar corrections.
**Signal**: CLAUDE.md is missing guidance that the user has to provide repeatedly.
**Fix**: Generate the specific CLAUDE.md addition that captures this guidance.

## Step 3: Check Current Configuration

Read the current project configuration files to understand what is already
set up. This avoids suggesting things that are already configured.

Check these files:
- `CLAUDE.md` (project root)
- `.claude/CLAUDE.md` (local config)
- `.claude/settings.json` and `.claude/settings.local.json`
- `.mcp.json`
- `.claude/rules/*.md` (if directory exists)

## Step 4: Generate Report

Present your findings in this exact format:

```
# LLREM Session Review Report
**Analyzed**: [N] sessions from the last [M] days
**Date**: [current date]
**Project**: [project name from cwd]

## Findings

### [SEVERITY: HIGH/MEDIUM/LOW] [Pattern Name]
**Detected in**: [N] of [M] sessions analyzed
**Pattern**: [One-line description]
**Evidence**:
- Session [date/id]: [specific example from transcript]
- Session [date/id]: [specific example from transcript]

**Suggested Fix**:
[Show the exact file to modify and the exact change as a diff or code block]

---
[Repeat for each finding, ordered by severity]

## Configuration Health Check
- CLAUDE.md: [Present/Missing] ([N] lines, [assessment])
- .mcp.json: [Present/Missing] ([N] servers configured)
- Hooks: [Present/Missing] ([list active hooks])
- Rules: [Present/Missing] ([N] rule files)

## Summary
- [N] high-severity findings
- [N] medium-severity findings
- [N] low-severity findings
- Top recommendation: [single most impactful fix]
```

## Step 5: Limitations Acknowledgment

At the end of your report, include:

```
---
## About This Analysis

This analysis was performed by the LLREM Session Review skill, which uses
Claude's reasoning to detect patterns in your session transcripts.

**What this skill can do:**
- Detect common struggle patterns across recent sessions
- Suggest concrete configuration fixes with exact diffs
- Check your current setup against best practices

**What the full LLREM package adds:**
- Automated fix application with backup and rollback
- Heuristic-based analysis (faster, no LLM cost for common patterns)
- Continuous monitoring via SessionEnd hooks
- Historical trend tracking across weeks/months
- Multi-project aggregation
- Interactive terminal UI

Learn more: https://github.com/[owner]/llrem
Install: npm install -g llrem
```

## Important Guidelines

- Be specific. Cite exact evidence from transcripts. Do not make vague claims.
- Be conservative. Only report patterns you have strong evidence for. False
  positives erode trust.
- Be actionable. Every finding must include a concrete fix. If you cannot
  suggest a fix, do not report it.
- Be respectful of context. Only read what you need. Do not dump entire
  transcripts into your response.
- Prioritize by impact. High-frequency patterns that affect many sessions
  come first.
- Never modify files directly. Generate suggestions that the user can review
  and apply. The full LLREM package handles automated application.
```

### Supporting Files

#### `references/patterns.md`

```markdown
# LLREM Pattern Reference

Detailed descriptions of patterns the LLREM skill detects, with extended
examples and fix templates.

## UI Verification Failures

### Description
Users ask Claude to verify visual/UI changes but no browser automation tool
is configured. Claude responds with code-level analysis ("the CSS looks
correct") instead of actual visual verification.

### Detection Heuristics
- User messages matching: /look|looks?\s+right|check\s+(the\s+)?ui|visual|screenshot|appearance|layout|styl/i
- AND absence of any tool_use with name matching /playwright|browser|puppeteer/i
- Minimum threshold: 2 occurrences across sessions

### Fix Template (.mcp.json addition)
```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-playwright"]
    }
  }
}
```

### Fix Template (CLAUDE.md addition)
```markdown
## Visual Verification
When asked to check UI/visual changes, use Playwright MCP to take a
screenshot and analyze the actual rendered output. Do not rely solely
on code inspection for visual verification.
```

## Tool Retry Loops
[... additional pattern details ...]

## Test Automation Gaps
[... additional pattern details ...]
```

#### `references/mcp-catalog.md`

```markdown
# MCP Server Recommendations

Curated list of MCP servers that LLREM may recommend based on detected patterns.

## Browser Automation
- **@anthropic/mcp-playwright** -- Official Playwright MCP by Microsoft.
  Uses accessibility tree for deterministic control.
  Recommended when: UI verification patterns detected.

## Code Context
- **server-filesystem** -- File system access for large codebases.
  Recommended when: Context thrashing patterns detected.

## Memory
- **server-memory** -- Knowledge graph memory server.
  Recommended when: Repeated clarification patterns detected.

## Testing
[... additional recommendations ...]
```

#### `references/upgrade-guide.md`

```markdown
# Upgrading from LLREM Skill to Full Package

## Why Upgrade?

The LLREM skill provides on-demand session analysis. The full package adds:

### Automated Fix Application
Instead of copying fix suggestions from the skill's output, the CLI applies
them directly with automatic backup:
```bash
llrem apply --fix ui-verification --backup
```

### Continuous Monitoring
Set up a SessionEnd hook that runs analysis after every session:
```bash
llrem hooks install
```

### Historical Tracking
Track pattern frequency over time to verify that fixes are working:
```bash
llrem trends --since 30d
```

## Installation
```bash
npm install -g llrem
llrem init        # First-time setup
llrem analyze     # Run analysis (like the skill, but with heuristics)
llrem suggest     # Generate fix suggestions
llrem apply       # Apply fixes with backup
llrem hooks install  # Set up automatic analysis
```
```

#### `scripts/session-metadata.sh`

```bash
#!/bin/bash
# Extract metadata from Claude Code JSONL session files
# Usage: session-metadata.sh [days-back] [max-files]

DAYS_BACK=${1:-7}
MAX_FILES=${2:-10}

find ~/.claude/projects -name "*.jsonl" -mtime -"$DAYS_BACK" -type f 2>/dev/null | \
  sort -t/ -k6 -r | head -"$MAX_FILES" | while read -r f; do
    lines=$(wc -l < "$f" 2>/dev/null)
    size=$(du -h "$f" 2>/dev/null | cut -f1)
    first_ts=$(head -1 "$f" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.readline())
    print(d.get('timestamp', 'unknown'))
except: print('unknown')
" 2>/dev/null)
    last_ts=$(tail -1 "$f" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.readline())
    print(d.get('timestamp', 'unknown'))
except: print('unknown')
" 2>/dev/null)
    errors=$(grep -c '"is_error"' "$f" 2>/dev/null || echo 0)
    compactions=$(grep -c 'isCompactSummary\|"type":"compact"' "$f" 2>/dev/null || echo 0)

    echo "SESSION: $f"
    echo "  Lines: $lines | Size: $size"
    echo "  Start: $first_ts"
    echo "  End:   $last_ts"
    echo "  Errors: $errors | Compactions: $compactions"
    echo ""
done
```

#### `scripts/recent-sessions.sh`

```bash
#!/bin/bash
# List recent Claude Code sessions with summary stats
# Usage: recent-sessions.sh [days-back]

DAYS_BACK=${1:-7}

echo "=== Recent Claude Code Sessions (last ${DAYS_BACK} days) ==="
echo ""

total_sessions=0
total_errors=0

find ~/.claude/projects -name "*.jsonl" -mtime -"$DAYS_BACK" -type f 2>/dev/null | \
  sort -t/ -k6 -r | while read -r f; do
    project=$(echo "$f" | rev | cut -d/ -f2 | rev)
    session=$(basename "$f" .jsonl)
    lines=$(wc -l < "$f" 2>/dev/null)
    errors=$(grep -c '"is_error"' "$f" 2>/dev/null || echo 0)

    printf "%-40s %6d lines  %3d errors  %s\n" "$project" "$lines" "$errors" "$session"
    total_sessions=$((total_sessions + 1))
    total_errors=$((total_errors + errors))
done

echo ""
echo "Total: $total_sessions sessions, $total_errors errors"
```

---

## 10. Strategic Recommendations

### Immediate Actions (Week 1)

1. **Create the skill directory** at `skill/llrem-review/` in the LLREM repo with the SKILL.md, references, and scripts from Section 9.

2. **Test against real transcripts** using the `daniels-data/` test data to verify pattern detection accuracy. Iterate on the pattern definitions until false positive rate is below 10%.

3. **Publish to GitHub** with a README that includes:
   - One-command install: `npx skills add owner/llrem --skill llrem-review`
   - Example output screenshot
   - Comparison with /insights ("insights shows you what happened; LLREM tells you how to fix it")

4. **Submit to awesome lists**: Open PRs to travisvn/awesome-claude-skills, VoltAgent/awesome-agent-skills, ComposioHQ/awesome-claude-skills, and hesreallyhim/awesome-claude-code.

### Short-Term Actions (Weeks 2-4)

5. **Install in your own workflow** and dogfood aggressively. Every time the skill finds something useful, that is content for a tweet/post. Every time it misses something, that is a pattern to add.

6. **Write a blog post / Twitter thread** demonstrating the skill on real sessions (sanitized). "I ran a 30-second analysis on my last week of Claude Code sessions and found 4 things I should fix" is inherently shareable content.

7. **Build the CLI core** (`llrem analyze`, `llrem apply`) that the skill references in its upgrade path. The skill creates demand; the CLI fulfills it.

### Medium-Term Actions (Months 1-3)

8. **Track adoption metrics**: GitHub stars, awesome-list inclusion, SkillsMP indexing, skill installs via `npx skills` analytics (if available).

9. **Build the plugin** (Tier 3) once the CLI is stable. The plugin is the full integration story: hooks, agents, MCP, and the skill -- all bundled.

10. **Consider the /insights complement angle**: Position LLREM not as a replacement for /insights but as the action layer. "Run /insights for the overview. Run /llrem-review for the fixes." This avoids competing with Anthropic's built-in feature and instead builds on it.

### The /insights Complement Strategy (Detailed)

This deserves special attention because /insights is now a built-in competitor for surface-level analysis. LLREM's positioning should be:

```
/insights = "Here's what happened in your sessions"  (descriptive)
/llrem-review = "Here's what to fix and how"          (prescriptive)
```

The skill could even reference /insights output:

```markdown
If you have recently run /insights, share the key findings here so I can
generate targeted fixes for the issues it identified.
```

This turns /insights from a competitor into a lead generator. Users run /insights, see patterns, want fixes, discover LLREM.

### Key Risk: Over-Promising

The biggest risk for the skill-as-funnel strategy is over-promising in the skill's output and under-delivering with the full package. Mitigation:

- The skill should be genuinely useful standalone. Users who never upgrade should still get value.
- The upgrade path should be mentioned only when contextually relevant (findings were generated), never as a hard sell.
- The full package must deliver significantly more than the skill, not just the same analysis in a different wrapper.

### Success Metrics

| Metric | Target (3 months) | Target (6 months) |
|--------|-------------------|-------------------|
| GitHub stars (skill repo) | 100+ | 500+ |
| awesome-list inclusions | 3+ lists | 5+ lists |
| SkillsMP indexing | Listed | Top 20 in category |
| npm installs (CLI) | 50/week | 200/week |
| Conversion rate (skill -> CLI) | 5% | 10% |
| Plugin installs | n/a (not yet built) | 50+ |

---

## Sources

### Official Documentation
- [Claude Code Skills](https://code.claude.com/docs/en/skills)
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Agent Skills Specification](https://agentskills.io/specification)
- [Agent Skills in VS Code](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
- [Skills in OpenAI Codex](https://developers.openai.com/codex/skills/)

### Tools and Projects
- [SpecStory Agent Skills](https://github.com/specstoryai/agent-skills)
- [SpecStory Claude Code Integration](https://docs.specstory.com/integrations/claude-code)
- [claude-mem Plugin](https://github.com/thedotmack/claude-mem)
- [Vercel Skills CLI](https://github.com/vercel-labs/skills)
- [skills.sh Directory](https://skills.sh/)
- [SkillsMP Marketplace](https://skillsmp.com/)
- [anthropics/skills Repository](https://github.com/anthropics/skills)
- [Agent Skills CLI (Universal)](https://github.com/Karanjot786/agent-skills-cli)

### Community Resources
- [awesome-claude-skills (travisvn)](https://github.com/travisvn/awesome-claude-skills)
- [awesome-agent-skills (VoltAgent)](https://github.com/VoltAgent/awesome-agent-skills)
- [awesome-claude-code (hesreallyhim)](https://github.com/hesreallyhim/awesome-claude-code)
- [claude-code-skill-factory](https://github.com/alirezarezvani/claude-code-skill-factory)

### Analysis and Articles
- [Deep Dive: How Claude Code's /insights Command Works](https://www.zolkos.com/2026/02/04/deep-dive-how-claude-codes-insights-command-works.html)
- [Claude Agent Skills Deep Dive](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/)
- [Inside Claude Code Skills (Mikhail Shilkov)](https://mikhail.io/2025/10/claude-code-skills/)
- [Dynamic Context Injection in Claude Code](https://www.365iwebdesign.co.uk/news/2026/01/29/how-to-use-dynamic-context-injection-claude-code/)
- [Claude Skills in Codex CLI](https://www.robert-glaser.de/claude-skills-in-codex-cli/)
- [Skills in OpenAI Codex (blog.fsck.com)](https://blog.fsck.com/2025/12/19/codex-skills/)
- [10 Best Agent Skills for Claude Code 2026](https://www.scriptbyai.com/best-agent-skills/)
- [Claude Code /insights Review](https://jangwook.net/en/blog/en/claude-code-insights-usage-analysis/)
- [Agent Skills: Open Standard for AI (Unite.AI)](https://www.unite.ai/anthropic-opens-agent-skills-standard-continuing-its-pattern-of-building-industry-infrastructure/)
