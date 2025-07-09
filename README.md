# llrem — Let your agent sleep on it 💤

An LLM-Retrospective Engine that scans Claude Code transcripts, spots struggle patterns, and hands you diff-ready fixes for prompts, MCPs, and `CLAUDE.md`.

[![npm version](https://badge.fury.io/js/llrem.svg)](https://badge.fury.io/js/llrem)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- **Heuristic & Semantic Analysis**: Catch known loops _and_ discover unseen failure modes.
- **Agent Friction Index (AFI)**: A single score to quantify how much an agent struggled during a session.
- **Diff-Ready Recommendations**: Get `git apply`-able patches for your agent's configuration.
- **Interactive HTML Dashboard**: Visualize latency, cost, and error trends over time.
- **CI / Cron Safe**: Designed for automation with non-interactive flags and meaningful exit codes.
- **Plugin Hooks**: Easily extend `llrem` with your own rules or support for other agents.

## 🏃 Quick Start

```sh
# Install globally
npm i -g llrem
```

## Usage

After installing, run `llrem` against your project transcripts. The tool is designed to be controlled with flags that modify its default analysis behavior.

```sh
# Analyze all transcripts from the last 7 days
llrem --since 7d
```

The CLI is in active development. For a full list of available commands and flags, run `llrem --help`.

## 👩‍💻 Contributing

Contributions are welcome! Please open an issue or submit a pull request.

1. Clone the repository: `git clone https://github.com/danielgwilson/llrem.git`
2. Install dependencies: `pnpm install`
3. Run in development mode: `pnpm dev`

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
