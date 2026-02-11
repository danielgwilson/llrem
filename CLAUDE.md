# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**llrem** (LLM Retrospective Engine) - A self-improving AI coding assistant optimizer that analyzes Claude Code transcripts to identify struggle patterns and delivers diff-ready fixes for configurations, prompts, and tool integrations.

### Vision
LLREM embodies the principle of continuous improvement for AI coding assistants. By treating conversation history as a rich source of insight, it creates a feedback loop that makes Claude Code smarter with every session. The goal: an AI pair programmer that not only writes code but continuously tunes itself based on real usage patterns.

### Core Value Proposition
- **Automated Observability**: Transforms black-box AI interactions into actionable insights
- **Self-Optimization**: Applies the Reflexion principle - agents that learn from their past dramatically outperform static ones
- **Diff-Ready Solutions**: Generates concrete, applicable fixes rather than abstract recommendations
- **Developer-Centric**: Lightweight, CLI-native tool designed for immediate practical impact

## Development Commands

```bash
# Install dependencies
pnpm install

# Development - run with file watching
pnpm dev

# Build for production (ESM and CJS)
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint
```

## Architecture & Implementation Strategy

### Tech Stack
- **@oclif/core** - CLI framework for command parsing and execution
- **chalk** - Terminal string styling  
- **ink** - React for interactive command-line apps (matching Claude Code's UI approach)
- **zod** - Schema validation for configs and transcripts
- **vitest** - Testing framework
- **tsup** - TypeScript bundler

### Core Components (Priority Order)

#### 1. Data Collection Layer (`src/parsers/`)
- **TranscriptParser**: Reads Claude Code conversation logs from `~/.claude/` directory
- **ConfigReader**: Parses `CLAUDE.md`, `.claude.json`, and MCP configurations
- **SessionAnalyzer**: Extracts metadata (tokens, duration, errors) from session summaries

#### 2. Pattern Recognition Engine (`src/analysis/`)
- **HeuristicAnalyzer**: Fast pattern matching for known issues
  - UI/visual feedback problems → Playwright MCP suggestion
  - Test failures → Post-commit hook recommendation
  - Context loss → RepoMapper MCP or file inclusion rules
- **LLMAnalyzer**: Claude-powered deep analysis of conversation patterns
  - Aggregates issues across sessions
  - Identifies root causes
  - Generates contextual suggestions

#### 3. Suggestion Generator (`src/suggestions/`)
- **MCPCatalog**: Curated list of Model Context Protocol servers
  - Playwright MCP - Browser automation and UI testing
  - GitHub MCP - Repository and PR management
  - RepoMapper MCP - Large codebase context management
- **ConfigOptimizer**: Generates diffs for configuration files
- **HookRecommender**: Suggests Claude Code hooks for automation

#### 4. Application Layer (`src/apply/`)
- **DiffGenerator**: Creates git-applicable patches
- **ConfigWriter**: Safely updates JSON/Markdown configs with backups
- **MCPInstaller**: Guides MCP server setup and integration

#### 5. User Interface (`src/ui/`)
- **InteractiveUI**: Ink-based terminal interface with:
  - Issue cards with expandable details
  - Apply/Ignore actions for each suggestion
  - Diff preview before applying changes
- **CLIFlags**: Non-interactive mode for automation
  - `--output=json` for machine-readable output
  - `--apply-all` for batch operations
  - `--since=7d` for time-scoped analysis

### Key Implementation Principles

1. **Claude Code First**: Deep integration with Claude's specific features
   - Leverage hooks for post-session analysis
   - Use status bar for progress indicators
   - Respect user/project/local config hierarchy

2. **Incremental Value**: Start with high-impact, low-complexity patterns
   - Focus on UI verification issues (most common pain point)
   - Test automation gaps (second most common)
   - Expand pattern library based on real usage

3. **Safety & Transparency**
   - Always backup before modifying configs
   - Show diffs before applying
   - Explain reasoning behind each suggestion
   - Allow easy rollback via git

4. **Performance Optimization**
   - Default to last 7 days of transcripts
   - Use heuristics before LLM analysis
   - Cache analysis results between sessions
   - Truncate/summarize for LLM context limits

## Implementation Roadmap

### Phase 1: MVP (Focus on UI Issues)
1. Parse Claude Code transcripts from `~/.claude/` 
2. Detect UI/visual verification problems via heuristics
3. Suggest Playwright MCP integration
4. Generate config diff and apply

### Phase 2: Expand Pattern Library
1. Add test automation detection
2. Implement LLM-based analysis for complex patterns
3. Support multiple MCP recommendations
4. Add interactive Ink UI

### Phase 3: Production Ready
1. Add caching and incremental analysis
2. Implement hooks integration
3. Support CI/CD workflows
4. Add telemetry and feedback loop

## Known Patterns to Detect

### High-Priority Patterns
- **"UI doesn't look right"** → Missing visual verification → Suggest Playwright MCP
- **"Tests are failing"** → No automated test runs → Suggest post-commit test hook
- **"Can't find the function"** → Large codebase context issues → Suggest RepoMapper MCP
- **"That's not what I meant"** → Ambiguous instructions → Update CLAUDE.md with clarifications

### Medium-Priority Patterns  
- **Repeated syntax errors** → Missing linting → Add lint hook
- **Token limit warnings** → Context management → Optimize file inclusion
- **Slow responses** → Large context → Suggest focused file selection

## Testing and Quality

### Required Before Every Commit
```bash
pnpm lint
pnpm test
pnpm build
```

### Testing Strategy
1. **Unit Tests**: Core parsers and analyzers
2. **Integration Tests**: Config file modifications
3. **E2E Tests**: Full analysis → suggestion → application flow
4. **Fixture-Based Testing**: Use sample transcripts with known issues

## Development Guidelines

### Code Style
- Functional, composable modules
- Strong TypeScript types for all data structures
- Zod schemas for runtime validation
- No console.log - use proper logging library

### Error Handling
- Never crash on malformed transcripts
- Gracefully skip unparseable sessions
- Always provide actionable error messages
- Log errors for debugging but continue operation

### Performance Targets
- Analyze 7 days of transcripts in < 5 seconds
- Generate suggestions in < 2 seconds  
- Apply changes instantly with proper backups

## Future Considerations

### Extensibility Points
- Plugin system for custom analyzers
- Support for other CLI agents (Cline, Gemini CLI)
- Web dashboard for historical trends
- Integration with Claude Code as a native feature

### Data Privacy
- All analysis happens locally
- No telemetry without explicit consent
- Sensitive data scrubbing before LLM calls
- Option to use local LLMs for analysis