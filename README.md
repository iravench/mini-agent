# mini-agent

Minimal coding agent CLI built on [pi-agent-core](https://github.com/mariozechner/pi-mono) + [pi-ai](https://github.com/mariozechner/pi-mono).

## Setup

```bash
npm install
export AI_PROVIDER=openai        # openai, anthropic, google, moonshot, etc.
export AI_API_KEY=sk-...
```

## Usage

```bash
npx tsx src/cli.ts                                    # REPL
npx tsx src/cli.ts --print "explain this project"      # single-shot
npx tsx src/cli.ts --continue                          # resume last session
npx tsx src/cli.ts --list                              # list sessions
npx tsx src/cli.ts --session 57726a63                  # resume by ID
npx tsx src/cli.ts --provider anthropic --model claude-sonnet-4-20250514
```

## Tools

| Tool | Description |
|---|---|
| `read_file` | Read file contents with line numbers. Offset/limit support. |
| `write_file` | Create or overwrite files. Auto-creates parent dirs. |
| `edit_file` | Unique-match search-and-replace. |
| `bash` | Shell commands with timeout and abort. |
| `grep` | Search file contents via ripgrep. Regex, glob filter, context lines. |
| `find_files` | Find files by glob pattern via fd. |
| `ls` | List directory contents. |

## Config

User config at `~/.mini-agent/config.json`:

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "contextThreshold": 0.8,
  "customInstructions": "Always use TypeScript strict mode.",
  "retry": { "enabled": true, "maxRetries": 3 }
}
```

Resolution order: CLI flags > config file > env vars.

| Env var | Description | Default |
|---|---|---|
| `AI_PROVIDER` | LLM provider | — |
| `AI_MODEL` | Model ID | Provider's first model |
| `AI_API_KEY` | API key fallback | — |
| `MINI_AGENT_HOME` | Data directory | `~/.mini-agent/` |
| `AI_CONTEXT_THRESHOLD` | Context pruning threshold | `0.8` |

## Dev

```bash
npm run dev          # watch mode
npm test             # run tests
npm run lint         # ESLint
npm run format       # Prettier
npm run typecheck    # type check
npm run build        # compile to dist/
```
