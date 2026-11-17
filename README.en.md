# OpenLogos

[中文](./README.md)

> [!IMPORTANT]
> **This repository is a personal fork of openlogos, not the official repository.**
>
> Built on top of [miniidealab/openlogos](https://github.com/miniidealab/openlogos) (Apache-2.0), with **team collaboration features added**: single-user multi-branch parallel sessions, multi-person cross-clone merging, and automatic numbering-conflict resolution.
> Published as [`@dorname/openlogos`](https://www.npmjs.com/package/@dorname/openlogos) (the official package is [`@miniidealab/openlogos`](https://www.npmjs.com/package/@miniidealab/openlogos)); they are not interchangeable.
> See the [Team Collaboration](#team-collaboration) section and [cli/README.md](./cli/README.md) for the full guide.

<p align="center">
  <img src="./logos/resources/reference/openlogos-index.png" alt="OpenLogos homepage preview" width="1200" />
</p>

**An open-source software development methodology for the AI era.**

> OpenLogos defines the standards. RunLogos makes them land better.

## What Is OpenLogos?

OpenLogos is a software development methodology designed for real AI-assisted projects.

Instead of treating AI as a code generator that should start from implementation immediately, OpenLogos requires teams to make three things explicit first:

- Why this should be built
- What should be built
- How it should be built

OpenLogos turns that discipline into executable specifications, AI skills, CLI commands, and verification rules, so AI can move inside a project with structure instead of pushing it into uncontrolled vibe coding.

## OpenLogos and RunLogos

**OpenLogos defines the standards. RunLogos makes them land better.**

- **OpenLogos** is the open-source methodology: workflow, AI skills, CLI tooling, and specifications
- **RunLogos** is the professional desktop app built on top of that methodology, providing a visual, editable, orchestrated, and debuggable workspace for AI-generated artifacts

OpenLogos works standalone with multiple AI coding tools.  
RunLogos is the productivity layer for teams or individuals who want stronger visual editing, API orchestration, debugging, and structured review workflows.

Learn more:

- OpenLogos: [openlogos.ai](https://openlogos.ai)
- RunLogos (Global): [runlogos.com](https://runlogos.com)
- RunLogos (China): [runlogos.cn](https://runlogos.cn)

### Which RunLogos Site Should I Use?

- **`runlogos.com`**: for global users
- **`runlogos.cn`**: for users in China

They represent the same product family, but provide better regional entry points and information for different audiences.

## Core Workflow

```text
WHY  -> Product requirements
WHAT -> Product design
HOW  -> Architecture -> Scenario modeling -> API / DB -> Test design -> Implementation -> Verification
```

Core principles:

- **Anti-vibe-coding**: AI executes, humans decide
- **Scenario-driven design**: implementation should emerge from business scenarios
- **Test-first delivery**: tests are part of the spec, not an afterthought
- **Traceable iteration**: changes should go through proposal / merge / archive flow

## Full-Auto Flow (the flow engine)

Since `0.11`, OpenLogos models the entire change lifecycle as a **declarative state machine** (the flow engine) that is the single source of truth — `status` / `next` / `watch` all passively derive "what to do next" from it. Every change in a launched project walks a fixed chain:

```text
plan → spec (deltas) → merge → slice (plan [code] slices)
  → implement (slice loop ↻) → deliver (verify/deploy/smoke) → close (archive/push)
```

**Two authorization tiers:**

- **Semi-auto (default)**: merge, verify, deploy, smoke, archive and push stay human confirmation points.
- **Full-auto / unattended (`openlogos next --auto`)**: one standing, run-scoped authorization drives the whole chain to completion — auto-passing skippable gates and auto-running verify / smoke / archive / push once the code is green, appending every pass to a `GATE_AUTO_PASSED` audit trail.

**Hard red line (safety base)**: the implement stage loops on code slices until tests are green; hitting the iteration ceiling unresolved escalates to a non-skippable `loop-exhausted` gate. **No mode — not even `--auto` — ever auto-passes code that did not pass tests.**

```bash
openlogos change add-dark-mode     # create a change proposal
openlogos next --auto              # one command, drives the whole chain unattended
openlogos flow show --resolved     # show the orchestration after overlays
openlogos watch                    # stream live derived state
```

Learn more: [Orchestratable Flow](https://openlogos.ai/deep-dive/orchestratable-flow)

## Install and Prerequisites

### Step 1: Install the OpenLogos CLI

Requires `Node.js >= 18`.

```bash
npm install -g @dorname/openlogos
openlogos --version
```

See [cli/README.md](./cli/README.md) for the CLI package overview.

### Step 2: Install the Host AI Tool

OpenLogos provides the methodology, skills, specifications, and CLI. But whether the `agent`, plugin, or command panel appears depends on whether the host AI tool is installed correctly and signed in.

## Quick Start

```bash
openlogos init my-project
cd my-project
openlogos status
openlogos next
```

A typical workflow looks like this:

1. Initialize a project with `openlogos init`
2. Let the AI complete the required documents step by step according to the current phase
3. Use `openlogos status` and `openlogos next` to stay aligned with the workflow
4. Implement code and tests by scenario, with OpenLogos reporting
5. Run `openlogos verify` for acceptance
6. After the first full delivery, switch into active iteration with `openlogos launch`
7. Manage further iterations with `openlogos change <slug>`, `merge`, and `archive`

## Supported AI Tools

OpenLogos currently supports:

| Tool | Integration |
|------|-------------|
| Cursor | `AGENTS.md` + `.cursor/rules/` |
| Claude Code | native plugin or `CLAUDE.md` |
| OpenCode | native plugin + `.opencode/commands/`, or `AGENTS.md` |
| Codex | native plugin mode (`.codex-plugin/` + `.codex/config.toml`) with `AGENTS.md` fallback |

Additional notes:

- Codex is now a first-class integration and can deploy `.agents/skills/`, `.codex-plugin/`, and `.codex/config.toml`
- OpenLogos skills are platform-agnostic Markdown assets, so the methodology remains broadly portable across tools

### AI Tool Prerequisites

If the host AI tool itself is not installed correctly, not signed in, or not fully restarted after sync, the OpenLogos skills, plugins, or agent panels may not appear as expected.

At minimum, verify the following:

| Tool | Prerequisites |
|------|---------------|
| Cursor | Cursor desktop is installed; the project can be opened normally; it can read `AGENTS.md` and `.cursor/rules/` from the project root; if rules do not appear to apply, restart Cursor or reopen the project window |
| Claude Code | Claude Code is installed; it can launch from your current environment; plugin marketplace is available; restart Claude Code after install or sync so the plugin and agent panel reload |
| OpenCode | OpenCode is installed; `opencode` is available in the terminal; launch it from the project root; restart OpenCode after `openlogos sync` so `.opencode/plugins/` and `.opencode/commands/` reload |
| Codex | Codex CLI is installed; `codex` can launch in the current terminal; the project can load `.codex/config.toml` and `.codex-plugin/`; restart the session after sync so hooks and `.agents/skills/` take effect |

General recommendations:

- Install and verify the `openlogos` CLI first: `npm install -g @dorname/openlogos`
- Then install the host AI tool and make sure its command works in the same terminal environment
- Run `openlogos init` or `openlogos sync` at the project root
- Fully quit and reopen the AI tool

Recommended order:

1. Install the `openlogos` CLI
2. Install and sign in to the host AI tool
3. Run `openlogos init` or `openlogos sync` at the project root
4. Fully restart the host tool and confirm that the skills, plugin, or agent panel appears

If the agent or plugin panel still does not appear, check these first:

- whether the AI tool is signed in
- whether the CLI is available in the current `PATH`
- whether the tool was launched from the project root
- whether the tool was actually restarted after sync

## Core CLI Commands

| Command | Description |
|---------|-------------|
| `openlogos init [name]` | Initialize a project |
| `openlogos sync` | Regenerate AI instruction files and skills |
| `openlogos status` | Inspect current phase and progress |
| `openlogos next [--auto]` | Show the recommended next step; `--auto` is full-auto / unattended mode |
| `openlogos watch` | Stream live derived dev-flow state |
| `openlogos flow show` | Show the flow orchestration (`--resolved` applies overlays) |
| `openlogos verify` | Generate the acceptance report |
| `openlogos deploy-done` | Record controlled deployment completion |
| `openlogos launch` | Switch from initial delivery to active iteration |
| `openlogos change <slug>` | Create a change proposal |
| `openlogos merge <slug>` | Merge proposal deltas |
| `openlogos archive <slug>` | Archive a completed proposal |
| `openlogos module list/add/rename/remove` | Manage multi-module projects |

Important: run these commands at the project root, where `logos/logos.config.json` exists.

## Team Collaboration

> The core addition of this fork. Two shapes: **single-user multi-branch** (multiple AI sessions in one repo) and **multi-person cross-clone** (several people developing the same repo in parallel).
> The illustrated guide lives in [cli/README.md](./cli/README.md#团队协作单人多分支同一仓库多个-ai-会话).

### What this fork adds over upstream openlogos

| Capability | Description |
|---|---|
| **Single-user multi-branch parallelism** | `openlogos change <slug> --worktree` creates an isolated worktree + short-lived branch, so several AI sessions advance several proposals without interfering |
| **Multi-person cross-clone merging** | Two people branching from the same base always pick the same number — this fork finalizes numbering on merge and renumbers to a free slot before push |
| **Automatic numbering-conflict resolution** | Counters become derived (never written back to yaml), so collisions are resolved by mechanism, not coordination |
| **Local-state isolation** | Guard lock, runtime dir, worktree session dir and sync stamp are never committed — eliminating cross-developer write conflicts at the root |

### Single-user multi-branch (multiple AI sessions in one repo)

A second session in the same directory is rejected by the working-directory lock (deliberately correct behavior). For parallel work, give each session its own git worktree:

```bash
# Session A
openlogos change feat-login --worktree
# → branch openlogos/feat-login, worktree .worktrees/feat-login
# → "please start a new session from .worktrees/feat-login"

# Session B
openlogos change feat-search --worktree
```

Then start an AI session in each directory and run the **exact same** single-proposal flow:

```
cd .worktrees/feat-login     # session A's AI works here
openlogos status             # confirms active_change = feat-login
# ... plan → delta → merge → slice → code → verify ...
```

After each side passes verify, merge back and clean up:

```bash
# main worktree
git merge --no-ff openlogos/feat-login
git merge --no-ff openlogos/feat-search
openlogos sync                                  # renumber convergence + index rebuild
git worktree remove .worktrees/feat-login
git worktree remove .worktrees/feat-search
git branch -D openlogos/feat-login
git branch -D openlogos/feat-search
openlogos archive feat-login
openlogos archive feat-search
```

### Multi-person cross-clone (several people, same repo)

Everyone clones and proceeds normally — but **converge before pushing**, otherwise two people on the same base pick the same scenario number:

```bash
# on your branch
openlogos merge my-feature      # numbering is finalized automatically (renumbered to the next free slot if taken)
git pull --rebase               # sync with the remote first
openlogos sync                  # converge: renumber your own unpushed artifacts + rebuild the index
git push
```

Convergence rules: **numbers already pushed by others are frozen**; **your own unpushed artifacts are renumbered to a free slot** (file names, `# SXX` headings and `UT-SXX-*` references are rewritten accordingly).

### How conflicts are handled

| Conflict | Who | Behavior |
|---|---|---|
| Scenario numbering collision | 🤖 automatic | Finalized on merge + auto-renumbered before push |
| Counter line conflict | 🤖 automatic | Counters are derived, never written back to yaml |
| `resource_index` drift | 🤖 automatic | Rebuilt wholesale during convergence |
| Local-state write conflicts | 🤖 automatic | Fixed-ignored, never committed |
| Ambiguous references outside the registered grammar | 🧑 human | Nothing is written; positions are listed for you to disambiguate |
| Both sides already pushed the same number | 🧑 human | Reported only, never rewritten (pushed numbers are frozen) |
| Two people edited the same section of the same document | 🧑 human | Blocked with origin context; rewrite the delta against the new view and replay the merge |

## Runnable Examples

The repository includes two complete examples:

- [examples/flowtask](./examples/flowtask/README.md): a Tauri desktop app focused on Claude Code integration
- [examples/money-log](./examples/money-log/README.md): an Electron desktop app focused on OpenCode integration

See [examples/README.md](./examples/README.md) for the overview.

## Repository Structure

```text
openlogos/
├── cli/              # OpenLogos CLI
├── skills/           # Platform-agnostic AI skills
├── spec/             # Methodology specifications
├── docs/             # Tooling and usage docs
├── plugin/           # Claude Code plugin
├── plugin-codex/     # Codex plugin templates
├── plugin-opencode/  # OpenCode plugin templates
└── examples/         # Runnable example projects
```

## Project Structure After `openlogos init`

```text
your-project/
├── AGENTS.md
├── CLAUDE.md                # generated when applicable
├── logos/
│   ├── logos.config.json
│   ├── logos-project.yaml
│   ├── resources/
│   ├── changes/
│   └── spec/
└── src/
```

OpenLogos keeps methodology assets inside `logos/`, so it stays minimally invasive to the main codebase.

## License

- Code and specifications: [Apache License 2.0](./LICENSE)
- Docs and tutorials: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

## Links

- This fork (personal edition): [github.com/dorname/openlogos](https://github.com/dorname/openlogos) | npm: `@dorname/openlogos`
- Upstream official project: [github.com/miniidealab/openlogos](https://github.com/miniidealab/openlogos) | npm: `@miniidealab/openlogos`
- Website: [openlogos.ai](https://openlogos.ai)
- RunLogos (Global): [runlogos.com](https://runlogos.com)
- RunLogos (China): [runlogos.cn](https://runlogos.cn)
- OpenCode guide: [docs/opencode.md](./docs/opencode.md)
- CLI package guide (with the full team-collaboration guide): [cli/README.md](./cli/README.md)
