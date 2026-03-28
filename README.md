# mini-agent

Minimal coding agent CLI built on [pi-agent-core](https://github.com/mariozechner/pi-mono) + [pi-ai](https://github.com/mariozechner/pi-mono).

## Setup

```bash
npm install
```

Set your provider and API key:

```bash
export AI_PROVIDER=moonshot
export AI_MODEL=kimi-k2-0905-preview
export AI_API_KEY=sk-...
```

## Usage

Interactive REPL:

```bash
npx tsx src/cli.ts
```

Single-shot:

```bash
npx tsx src/cli.ts --print "explain the structure of this project"
```

Resume last session:

```bash
npx tsx src/cli.ts --continue
```

List sessions:

```bash
npx tsx src/cli.ts --list
```

Resume by session ID (from `--list`):

```bash
npx tsx src/cli.ts --session 57726a63
```

## Tools

| Tool | Description |
|---|---|
| `read_file` | Read file contents with line numbers. Supports offset/limit. |
| `write_file` | Create or overwrite files. Auto-creates parent dirs. |
| `edit_file` | Search-and-replace. Match must be unique. |
| `bash` | Run shell commands with timeout and abort support. |

## Config

| Env var | Description | Default |
|---|---|---|
| `AI_PROVIDER` | LLM provider (required) | — |
| `AI_MODEL` | Model ID | Provider's first model |
| `AI_API_KEY` | API key fallback | — |
| `MINI_AGENT_HOME` | Base data directory | `~/.mini-agent/` |
| `AI_CONTEXT_THRESHOLD` | Context pruning threshold | `0.8` |

Sessions are stored per-project at `~/.mini-agent/sessions/<encoded-cwd>/`.

## Dev

```bash
npm run dev      # watch mode
npm run build    # compile to dist/
npm run typecheck
```
