# claude-code-onboard

An exemplary, public repository that demonstrates current (mid-2026) **Claude Code best
practices** for project-scoped configuration — `CLAUDE.md` memory, `settings.json`
permissions, hooks, skills, and subagents, all under `.claude/`.

It is also an **adoption engine**. The same `.claude/` directory that configures _this_
repo ships skills you can run inside _any_ codebase to install this standard, migrate an
existing AI-rules setup (Cursor, Copilot, Windsurf, Gemini, Cline, AGENTS.md) to it, and
revert cleanly. The repo is the working prototype of a distributable Claude Code **plugin**:
everything here maps 1:1 onto the plugin layout described in
[Plugin-conversion path](#plugin-conversion-path).

> Requires **Claude Code ≥ 2.1.160** and an **xhigh-capable model (Opus 4.7 / 4.8)**.
> See [Effort, ultracode & the version floor](#effort-ultracode--the-version-floor) for
> why that floor is enforced softly (no manifest field exists for it).

---

## Table of contents

1. [The guiding principle: least-powerful mechanism](#the-guiding-principle-least-powerful-mechanism)
2. [File-tree walkthrough](#file-tree-walkthrough)
3. [Permissions syntax (the gotchas)](#permissions-syntax-the-gotchas)
4. [Hooks](#hooks)
5. [Skills vs legacy commands](#skills-vs-legacy-commands)
6. [Subagents](#subagents)
7. [MCP](#mcp)
8. [Effort, ultracode & the version floor](#effort-ultracode--the-version-floor)
9. [The adoption engine](#the-adoption-engine)
10. [Workflows](#workflows)
11. [Plugin-conversion path](#plugin-conversion-path)
12. [Quick start](#quick-start)
13. [License](#license)

---

## The guiding principle: least-powerful mechanism

There is one idea to take away from this repo:

> **Use the least-powerful mechanism that guarantees the behavior you need.**

Claude Code gives you five layers of influence over an agent, ordered here from _weakest /
most flexible_ to _strongest / most rigid_. Reach for the lowest layer that actually
guarantees what you want — escalate only when the layer below can't make the guarantee.

| #   | Layer                             | Strength       | What it guarantees                                                                                                                                                              | Files in this repo                                                                                                                                                                             |
| --- | --------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`CLAUDE.md`** memory            | Advisory       | Loaded every session; high-signal facts the model can't infer. Persuasion, not enforcement.                                                                                     | [`CLAUDE.md`](CLAUDE.md), [`.claude/rules/code-style.md`](.claude/rules/code-style.md), [`.claude/rules/api.md`](.claude/rules/api.md), [`docs/git-instructions.md`](docs/git-instructions.md) |
| 2   | **`settings.json` `permissions`** | Trust boundary | `allow` / `ask` / `deny` over tool calls. `deny` is hard, but only over tools the agent invokes.                                                                                | [`.claude/settings.json`](.claude/settings.json)                                                                                                                                               |
| 3   | **Hooks**                         | Deterministic  | Shell programs the runtime executes on events. `PreToolUse` + `exit 2` blocks even under `bypassPermissions`. The only mechanism for "must happen every time, zero exceptions." | [`.claude/hooks/`](.claude/hooks/) (six scripts)                                                                                                                                               |
| 4   | **Skills**                        | On-demand      | Reusable knowledge & workflows; ~0 tokens until invoked. Slash commands are skills (directory name = the command).                                                              | [`.claude/skills/`](.claude/skills/)                                                                                                                                                           |
| 5   | **Subagents**                     | Isolation      | A separate context window with its own (restricted) tools and model — for research/review without polluting the main thread.                                                    | [`.claude/agents/`](.claude/agents/)                                                                                                                                                           |

Why the ordering matters in practice:

- A coding _convention_ ("use named exports") is advisory — it lives in `CLAUDE.md` /
  `rules/`, layer 1. Putting it in a hook would be brittle and over-engineered.
- "Never read `.env`" is a _trust_ decision — `permissions.deny`, layer 2.
- "Never let _anything_ edit `migrations/`" must hold every time with no exception — that
  is a _hook_, layer 3 (see [`protect-files.sh`](.claude/hooks/protect-files.sh)).
- "Scaffold a new API handler" is an on-demand _workflow_ — a skill, layer 4
  ([`api-handler/`](.claude/skills/api-handler/SKILL.md)).
- "Review my diff without the review chatter leaking into my main context" is _isolation_
  — a subagent, layer 5 ([`code-reviewer.md`](.claude/agents/code-reviewer.md)).

A higher layer can always express a lower layer's intent, but at a cost (more tokens, more
rigidity, harder to reason about). The discipline is to stop climbing as soon as the
guarantee holds.

---

## File-tree walkthrough

Every entry below is a real file in this repo.

```
claude-code-onboard/
├── README.md                          # this file
├── LICENSE                            # MIT
├── CLAUDE.md                          # < 200 lines advisory memory; @imports README/package.json/docs
├── CLAUDE.local.md.example            # personal, gitignored memory (copy to CLAUDE.local.md)
├── .gitignore                         # node_modules, .env*, dist, settings.local.json, CLAUDE.local.md, .adopt-backups/
├── .mcp.json.example                  # HTTP MCP server template (copy to .mcp.json, set env)
├── package.json                       # scripts: lint / test / typecheck / format
├── tsconfig.json                      # strict TypeScript config
├── docs/
│   └── git-instructions.md            # imported by CLAUDE.md (@docs/git-instructions.md)
├── src/
│   ├── index.ts                       # sample app entry point
│   ├── api/handlers/users.ts          # the "API handlers live here" rule's target
│   └── lib/format.ts                  # pure functions exercised by the test
├── tests/
│   └── format.test.ts                 # closes the verification loop (vitest)
├── migrations/
│   └── 0001_init.sql                  # PROTECTED dir — the guardrail hook blocks edits
└── .claude/
    ├── settings.json                  # COMMITTED: $schema, permissions, hooks, env — NO effortLevel
    ├── settings.local.json.example    # personal, gitignored overrides (copy to settings.local.json)
    ├── rules/
    │   ├── code-style.md              # no paths: → always loaded
    │   └── api.md                     # paths: ["src/api/**"] → loads only when touching API files
    ├── hooks/
    │   ├── protect-files.sh           # PreToolUse Edit|Write → exit 2, blocks protected paths
    │   ├── format-on-edit.sh          # PostToolUse Edit|Write → prettier --write the edited file
    │   ├── no-rm-rf.sh                # PreToolUse Bash → permissionDecision deny on rm -rf
    │   ├── session-context.sh         # SessionStart(compact) → re-inject standing reminders
    │   ├── check-version.sh           # SessionStart → claude --version; warn if < 2.1.160
    │   └── recommend-effort.sh        # UserPromptExpansion → nudge /effort ultracode on our commands
    ├── skills/
    │   ├── fix-issue/SKILL.md         # /fix-issue <n>: $ARGUMENTS + !`gh issue view` injection
    │   ├── commit/SKILL.md            # /commit: INERT — drafts message, PRINTS the git command
    │   ├── api-handler/               # progressive-disclosure demo
    │   │   ├── SKILL.md
    │   │   ├── REFERENCE.md
    │   │   └── scripts/new-handler.sh # prints a handler scaffold to stdout (never writes)
    │   ├── adopt-ai-rules/            # ADOPTION ENGINE — entry point
    │   │   ├── SKILL.md
    │   │   ├── REFERENCE.md           # cross-tool → standard mapping table
    │   │   ├── standard-manifest.json # enumerates the canonical payload files
    │   │   └── scripts/
    │   │       ├── detect.mjs         # inventory JSON of existing AI-rule sources
    │   │       └── backup.mjs         # snapshot listed paths + write manifest.json
    │   ├── revert-ai-rules/           # ADOPTION ENGINE — undo
    │   │   ├── SKILL.md
    │   │   └── scripts/
    │   │       ├── list-backups.mjs
    │   │       └── restore.mjs        # restore precisely from a manifest
    │   └── recommend-plugins/         # /recommend-plugins — scan repo → suggest REAL plugins
    │       ├── SKILL.md               # effort: xhigh; recommend-only
    │       ├── REFERENCE.md           # discovery-file & marketplace schemas, signal→plugin table
    │       ├── plugins-catalog.json   # bundled curated seed (verified plugins, signal reverse-index)
    │       └── scripts/scan.mjs       # read-only repo scan → signals JSON (NO network, NO install)
    ├── agents/
    │   ├── code-reviewer.md           # tools: Read,Grep,Glob,Bash; model: inherit; "use proactively"
    │   └── security-reviewer.md       # disallowedTools: Write,Edit; model: sonnet
    └── commands/
        └── legacy-hello.md            # ONE legacy flat-markdown command → migration demo
```

**Memory layering.** [`CLAUDE.md`](CLAUDE.md) is the always-loaded advisory memory. It is
deliberately short (< 200 lines) and uses `@import` syntax to pull in
[`README.md`](README.md), [`package.json`](package.json), and
[`docs/git-instructions.md`](docs/git-instructions.md) (imports nest up to four hops deep).
The [`.claude/rules/`](.claude/rules/) directory is its modular companion:
[`code-style.md`](.claude/rules/code-style.md) has no `paths:` frontmatter so it loads every
session, while [`api.md`](.claude/rules/api.md) declares `paths: ["src/api/**"]` and loads
_only_ when the agent touches an API file — keeping always-on context lean.

**Local overrides.** [`CLAUDE.local.md.example`](CLAUDE.local.md.example) and
[`.claude/settings.local.json.example`](.claude/settings.local.json.example) are committed as
`.example` templates. Copy them (dropping `.example`); the real files are gitignored so each
teammate keeps personal context and permission tweaks out of version control.
`settings.local.json` is for personal `allow` additions and editor preferences such as
`editorMode: "vim"`; note `defaultMode: "auto"` is silently ignored outside `~/.claude`.

---

## Permissions syntax (the gotchas)

Permissions live in [`.claude/settings.json`](.claude/settings.json) under `permissions`,
with three lists — `allow`, `ask`, `deny` — of tool-pattern strings. This repo allows the
safe repeatable commands (`npm run lint`, `npm run test:*`, `npm run typecheck`,
`npm run format`, `git add:*`, `git commit:*`, `git status`, `git diff:*`, `Read(./**)`),
_asks_ before the one risky thing (`git push:*`), and _denies_ secret reads and raw network
egress (`Read(.env)`, `Read(.env.*)`, `Read(./secrets/**)`, `Bash(curl:*)`, `Bash(wget:*)`).

The matcher syntax is unforgiving. The traps that bite people:

| Pattern                              | Meaning                                             | Gotcha                                                                             |
| ------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Bash(ls *)`                         | `ls` followed by a space, then anything             | The space is **load-bearing**. Matches `ls -la`, `ls foo`.                         |
| `Bash(ls*)`                          | any command whose text starts with the literal `ls` | Also matches `lsof`, `lsblk`. Almost never what you want.                          |
| `Read(.env)`                         | a file named `.env` at **any depth**                | Also matches `config/.env`, `a/b/.env`. Path patterns are not anchored by default. |
| `Read(/etc/hosts)` _(leading `/`)_   | anchored to the **project root**                    | A single leading `/` means "from the repo root", **not** the filesystem root.      |
| `Read(//etc/hosts)` _(leading `//`)_ | an **absolute** filesystem path                     | Use a double slash when you really mean `/etc/...`.                                |

**Resolution order is `deny` > `ask` > `allow`, first-match-wins.** A `deny` always beats an
`allow` no matter the order they're written. Rules merge across scopes (user → project →
local → managed), and a **bare-tool `deny`** (e.g. `deny: ["WebFetch"]`) is _un-loosenable_ —
no later `allow` can re-enable it. Prefer specific patterns over bare-tool denies unless you
truly want a permanent lock.

---

## Hooks

Hooks are shell programs the runtime runs on lifecycle events. They are the only
**deterministic, un-bypassable** layer — a `PreToolUse` hook that writes to stderr and
`exit 2` blocks the tool call _even in `bypassPermissions` mode_. Every hook in this repo
starts with `#!/usr/bin/env bash` + `set -euo pipefail`, is `chmod +x`, and is referenced
from [`settings.json`](.claude/settings.json) as
`"$CLAUDE_PROJECT_DIR/.claude/hooks/<name>.sh"`.

The `hooks` object in `settings.json` wires the six scripts exactly like this:

| Event                 | Matcher                                                                                            | Script                                                     | What it does                                                                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PreToolUse`          | `Edit\|Write`                                                                                      | [`protect-files.sh`](.claude/hooks/protect-files.sh)       | Reads `.tool_input.file_path` from stdin JSON; if it matches a protected pattern (`.env*`, `package-lock.json`, `.git/`, `migrations/`, `.claude/.adopt-backups/`) it writes the reason to **stderr** and `exit 2`. The headline un-bypassable demo. |
| `PreToolUse`          | `Bash`                                                                                             | [`no-rm-rf.sh`](.claude/hooks/no-rm-rf.sh)                 | Emits a JSON `permissionDecision: "deny"` on a `rm -rf` command. Demonstrates the v2.1.85+ `if` field (`if: "Bash(rm -rf *)"`).                                                                                                                      |
| `PostToolUse`         | `Edit\|Write`                                                                                      | [`format-on-edit.sh`](.claude/hooks/format-on-edit.sh)     | Runs `npx prettier --write` on the just-edited file. Cosmetic, non-blocking, guards non-existent paths.                                                                                                                                              |
| `SessionStart`        | `compact`                                                                                          | [`session-context.sh`](.claude/hooks/session-context.sh)   | After a compaction, re-injects standing reminders via stdout (use npm; run `npm test` before committing; API handlers live in `src/api/handlers/`).                                                                                                  |
| `SessionStart`        | _(all sources)_                                                                                    | [`check-version.sh`](.claude/hooks/check-version.sh)       | Shells out to `claude --version`, parses the leading semver defensively, and emits a `systemMessage` if `< 2.1.160`. **Warn-only** — SessionStart cannot block.                                                                                      |
| `UserPromptExpansion` | `adopt-ai-rules\|revert-ai-rules\|recommend-plugins\|fix-issue\|commit\|api-handler\|legacy-hello` | [`recommend-effort.sh`](.claude/hooks/recommend-effort.sh) | When one of _this repo's_ slash commands is typed, nudges toward `/effort ultracode` once per session. See [Effort](#effort-ultracode--the-version-floor).                                                                                           |

**One discipline worth repeating:** a blocking `PreToolUse` hook uses **either** stderr +
`exit 2` **or** a JSON `permissionDecision` — _never both_. `protect-files.sh` takes the
exit-2 route; `no-rm-rf.sh` takes the JSON route. Mixing them produces undefined behavior.

### The known gap (and how a `Stop` hook closes it)

The `Edit|Write` matcher only fires for the **Edit** and **Write** tools. A file written via
the **Bash** tool — `echo … > migrations/0002.sql`, `cp`, `sed -i`, a redirect inside a
script — does **not** trigger `protect-files.sh`. `no-rm-rf.sh` only catches `rm -rf`, not
arbitrary clobbering writes.

To close the gap you would add a `Stop` hook that audits the protected paths at the _end_ of
the turn (e.g. compares against a snapshot / `git status`) and re-blocks if one changed. A
`Stop` hook must guard against infinite loops by checking the `stop_hook_active` field in its
stdin JSON and exiting cleanly when it is already set — otherwise the block re-triggers the
stop event forever. This repo documents the pattern rather than shipping it, to keep the hook
set readable; the takeaway is that **tool-matcher hooks scope to a tool, not to a filesystem
effect.**

---

## Skills vs legacy commands

A **skill** is a directory under [`.claude/skills/`](.claude/skills/) containing a
`SKILL.md`. The directory name _is_ the slash command, so
[`skills/fix-issue/`](.claude/skills/fix-issue/SKILL.md) gives you `/fix-issue`. Skills cost
~0 tokens until invoked, can declare `allowed-tools`, accept `$ARGUMENTS`, run `!`shell``preprocessing injections, and use progressive disclosure (a short`SKILL.md`that links a
deeper`REFERENCE.md`).

A **legacy command** is a single flat markdown file under
[`.claude/commands/`](.claude/commands/) — here, [`legacy-hello.md`](.claude/commands/legacy-hello.md)
gives you `/legacy-hello` (filename = command). This is the older form, kept as a migration
demo. **If a skill and a command share a name, the skill wins.**

The skills in this repo:

| Command              | Skill                                                             | Notes                                                                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/fix-issue <n>`     | [`fix-issue/`](.claude/skills/fix-issue/SKILL.md)                 | Functional, non-destructive. Uses `argument-hint`, `$ARGUMENTS`, and a `!`gh issue view $ARGUMENTS``injection;`allowed-tools`scoped to`Bash(gh issue view:_)`, `Bash(git add:_)`, `Bash(git commit:\*)`.                                        |
| `/commit`            | [`commit/`](.claude/skills/commit/SKILL.md)                       | **INERT.** `disable-model-invocation: true` (manual-only, stays out of context). Reviews the diff, drafts a Conventional-Commits message, and **prints the exact `git commit` command** — it never runs it. A teaching template.                |
| `/api-handler`       | [`api-handler/`](.claude/skills/api-handler/SKILL.md)             | Progressive disclosure: `SKILL.md` links [`REFERENCE.md`](.claude/skills/api-handler/REFERENCE.md); `scripts/new-handler.sh` (run via `${CLAUDE_SKILL_DIR}`) prints a scaffold to stdout only.                                                  |
| `/adopt-ai-rules`    | [`adopt-ai-rules/`](.claude/skills/adopt-ai-rules/SKILL.md)       | The [adoption engine](#the-adoption-engine) entry point. `effort: xhigh`.                                                                                                                                                                       |
| `/revert-ai-rules`   | [`revert-ai-rules/`](.claude/skills/revert-ai-rules/SKILL.md)     | Git-independent restore from a backup snapshot + manifest. `effort: xhigh`.                                                                                                                                                                     |
| `/recommend-plugins` | [`recommend-plugins/`](.claude/skills/recommend-plugins/SKILL.md) | **Recommend-only.** Scans the repo and prints `/plugin` commands for real plugins. `effort: xhigh`. It MUST NOT run `/plugin install` or `marketplace add`, call `claude plugin`, or edit `installed_plugins.json` / `known_marketplaces.json`. |

Two side-effecting skills are deliberately **inert** so that cloning this repo never mutates
anything: `/commit` prints rather than commits, and `/recommend-plugins` prints rather than
installs.

---

## Subagents

Subagents live in [`.claude/agents/`](.claude/agents/) as markdown files with YAML
frontmatter. Each runs in an **isolated context window** — research/review work happens there
without polluting the main thread, and only the subagent's final summary returns. Key
properties:

- They are **loaded at session start** (frontmatter is parsed up front).
- A subagent **cannot spawn further subagents** — no recursion.
- Tools are **restricted** per agent via `tools:` (allowlist) or `disallowedTools:`
  (denylist).
- They can run on **cheaper models** to save cost.
- A **proactive `description`** ("use proactively…") lets the main agent delegate
  automatically at the right moment.

This repo ships two:

| Subagent                                                   | Frontmatter                                                                                                      | Purpose                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`code-reviewer`](.claude/agents/code-reviewer.md)         | `tools: Read, Grep, Glob, Bash`; `model: inherit`; description "Use proactively immediately after writing code." | Read-and-inspect review; inherits the main model.                              |
| [`security-reviewer`](.claude/agents/security-reviewer.md) | `disallowedTools: Write, Edit`; `model: sonnet`                                                                  | Single-purpose security pass that **cannot modify files**, on a cheaper model. |

---

## MCP

[`.mcp.json.example`](.mcp.json.example) is a template for a project-scoped MCP server over
HTTP, using `${ENV}` expansion so **no secret is ever committed**:

```jsonc
{
  "mcpServers": {
    "<name>": {
      "type": "http",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": { "Authorization": "Bearer ${API_KEY}" },
    },
  },
}
```

To use it: **copy `.mcp.json.example` to `.mcp.json`** and set the referenced environment
variables (`API_BASE_URL`, `API_KEY`). A committed `.mcp.json` is shared with the team —
teammates are **prompted to approve** project MCP servers on first use. To pre-approve, set
`enableAllProjectMcpServers: true` (all of them) or list specific ones in
`enabledMcpjsonServers` in settings.

MCP tools are gated by the same permission system: `mcp__<server>` matches every tool on a
server, `mcp__<server>__<tool>` matches one specific tool — use these in `allow` / `ask` /
`deny` exactly like `Bash(...)` patterns.

> **Zero-auth option:** the hosted **Claude Code docs MCP server** needs no credentials —
> a good first MCP server to try, since there are no env vars to set.

---

## Effort, ultracode & the version floor

This repo targets **Claude Code ≥ 2.1.160** + an **xhigh-capable model (Opus 4.7 / 4.8)**.
`2.1.160` is where the `ultracode` trigger keyword was introduced (renamed from `workflow`)
and where ultracode stopped being offered on models that can't run xhigh. The floor is
**necessary but not sufficient**: on Opus 4.6 / Sonnet 4.6 `xhigh` degrades to `high` and
ultracode is unavailable.

**There is no declarative way to require a version.** Neither `plugin.json` nor
`marketplace.json` has a `minClaudeCodeVersion` / `engines` / `requires` field, and unknown
manifest fields are silently ignored — so don't invent one. The floor is enforced **softly**,
three ways: this README, the plugin `description` (the authoritative human-readable
statement once packaged), and the warn-only [`check-version.sh`](.claude/hooks/check-version.sh)
SessionStart hook. A hard block from SessionStart is impossible.

### What's achievable — stated honestly

| Goal                                                                | Achievable?                     | Mechanism                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Require CC ≥ 2.1.160                                                | ⚠️ **Soft only**                | README + plugin `description`; warn-only [`check-version.sh`](.claude/hooks/check-version.sh)                                                                                                                                                                                        |
| Nudge to `/effort ultracode` **on this repo's slash commands only** | ✅ Yes                          | [`recommend-effort.sh`](.claude/hooks/recommend-effort.sh) — a `UserPromptExpansion` hook scoped by a `command_name` matcher, gated on `$CLAUDE_EFFORT`, with a once-per-session marker and a one-time `systemMessage`. (Not `PreToolUse` — direct `/command` typing bypasses that.) |
| Raise xhigh **reasoning** per-invocation                            | ✅ Yes (chosen)                 | `effort: xhigh` frontmatter on the **three heavy skills only** (`adopt-ai-rules`, `revert-ai-rules`, `recommend-plugins`)                                                                                                                                                            |
| Raise xhigh **session-wide** via committed `effortLevel`            | ✅ possible, **but NOT chosen** | A committed `effortLevel` would override the user's own session effort choice, so we don't ship one                                                                                                                                                                                  |
| Auto-apply ultracode **orchestration**                              | ❌ No                           | Session-only; settable only via `/effort ultracode`, `--settings {"ultracode":true}`, or an SDK control request — never via settings / flag / env / frontmatter                                                                                                                      |
| Detect ultracode vs plain xhigh                                     | ❌ No                           | Ultracode reports as `xhigh` everywhere a hook can read it                                                                                                                                                                                                                           |

**No committed `effortLevel` lives anywhere in this repo** — not in `settings.json`, not in
`settings.local.json.example`. Effort is raised _only_ per-invocation, _only_ via the
`effort: xhigh` frontmatter on the three heavy skills (legal values:
`low | medium | high | xhigh | max`). That frontmatter raises **reasoning depth only**, never
ultracode orchestration, and reverts after the skill finishes; on Opus 4.6 / Sonnet 4.6 it
degrades to `high`. No other skill carries effort frontmatter.

The `recommend-effort.sh` nudge is **best-effort by design**: a hook can _recommend_ effort
but can never _set_ it, and because ultracode reports as `xhigh`, the gate can't distinguish a
real user-`xhigh` from ultracode. So it fails safe — if `$CLAUDE_EFFORT` is already
`xhigh`/`max` (or unset/empty), it stays silent.

---

## The adoption engine

The two adoption skills let you install this standard into **any** repo and back it out
cleanly. The install **payload is the repo's own committed standard artifacts** — there are
no separate templates and therefore no drift; the repo dogfoods exactly what it installs.
[`standard-manifest.json`](.claude/skills/adopt-ai-rules/standard-manifest.json) enumerates
the canonical payload files, and the payload root resolves as
`${CLAUDE_PLUGIN_ROOT:-$CLAUDE_PROJECT_DIR}` so the same skill works as a plain project today
and a plugin later. The adopter copies only the _configuration standard_ — never
`settings.local.json`, `CLAUDE.local.md`, `.adopt-backups/`, `node_modules`, or the sample app
(`src/`, `tests/`, `migrations/`).

### `/adopt-ai-rules`

1. **Detect** — [`scripts/detect.mjs`](.claude/skills/adopt-ai-rules/scripts/detect.mjs)
   globs for every known AI-rules source plus an existing `.claude/`, and emits an inventory
   JSON.
2. **Branch** —
   - _Greenfield_ (no foreign sources found): scaffold the canonical payload into the target.
   - _Migrate_: the model reads each detected source and produces a **mapping plan**, shown to
     you for **confirmation** before any write.
3. **Back up** — [`scripts/backup.mjs`](.claude/skills/adopt-ai-rules/scripts/backup.mjs)
   snapshots every path the plan will create/modify/delete into
   `.claude/.adopt-backups/<UTC-timestamp>/` and writes `manifest.json` — **before any write
   happens.**
4. **Apply** — write/patch files per the confirmed plan.
5. **Report** — summarize what changed and how to revert (`/revert-ai-rules`).

**Supported migrate-from formats:**

| Family             | Sources detected                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Claude / AGENTS.md | `CLAUDE.md`, `CLAUDE.local.md`, `**/CLAUDE.md`, `AGENTS.md`, `**/AGENTS.md`, `.claude/**` |
| Cursor             | `.cursorrules`, `.cursor/rules/**/*.mdc`                                                  |
| GitHub Copilot     | `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md`            |
| Windsurf           | `.windsurfrules`, `.windsurf/rules/**/*`                                                  |
| Gemini             | `GEMINI.md`, `**/GEMINI.md`                                                               |
| Cline              | `.clinerules`, `.clinerules/**/*`                                                         |

The mapping plan routes each construct to the **least-powerful** standard target: always-apply
prose → `CLAUDE.md` body; glob-scoped rules (Cursor `.mdc` globs, Copilot `applyTo`, Windsurf
globs) → `.claude/rules/<name>.md` with `paths:`; command/tool prohibitions → `settings.json`
`permissions.deny` + a protect-files hook pattern; secret/sensitive-path mentions →
`deny(Read(...))`; build/test/lint commands → the `CLAUDE.md` Commands section; anything
ambiguous → preserved verbatim under a flagged "Migrated notes (review)" section.

### Backup / manifest format

Each adoption writes `.claude/.adopt-backups/<UTC-timestamp>/` containing:

- **`manifest.json`** — the record of the operation:
  ```jsonc
  {
    "adoptionId": "<ts>",
    "createdAt": "<ISO8601, stamped at runtime>",
    "mode": "greenfield | migrate",
    "pluginVersion": "<from plugin.json / standard-manifest>",
    "sources": [
      /* detector inventory */
    ],
    "operations": [
      {
        "path": "CLAUDE.md",
        "op": "create | modify | delete",
        "backupPath": "files/CLAUDE.md",
        "sha256Before": null,
        "sha256After": "...",
      },
    ],
  }
  ```
- **`files/`** — verbatim copies of every pre-existing file that was modified or deleted.
- **`revert.log`** — appended to by the restore step.

The protect-files hook guards `.claude/.adopt-backups/` so a later session can't clobber your
backups.

### `/revert-ai-rules`

Restore is **git-independent** — it works from the snapshot + manifest, not from version
control. [`scripts/list-backups.mjs`](.claude/skills/revert-ai-rules/scripts/list-backups.mjs)
lists available snapshots (newest first);
[`scripts/restore.mjs`](.claude/skills/revert-ai-rules/scripts/restore.mjs) `<ts>` replays
`operations` in reverse — deleting files the adoption _created_, restoring _modified_ / _deleted_
files from `files/`, pruning now-empty directories the adoption made, and appending to
`revert.log`.

> All adoption scripts are **Node ESM (`.mjs`)** using only `node:fs`, `node:path`, and
> `node:crypto` — zero npm dependencies, cross-platform. They run via
> `node "${CLAUDE_SKILL_DIR}/scripts/<x>.mjs"`.

---

## Workflows

These are **documented patterns**, not shipped code:

- **explore → plan → code → commit.** Read and understand first, write a plan, implement,
  then commit (with `/commit`, which drafts and prints — you run the command).
- **Delegate research to subagents.** Push exploration/review into an isolated context
  (`code-reviewer`, `security-reviewer`) so the main thread stays focused; only the summary
  returns.
- **The verification loop.** After a change, run the [`tests/`](tests/) suite _and_ hand the
  diff to the review subagent — code is "done" only when tests pass and review is clean. This
  is why the repo ships [`tests/format.test.ts`](tests/format.test.ts): it closes the loop.
- **Headless / CI.** `claude -p "<prompt>"` runs non-interactively for CI fan-out and
  scripting.
- **Saved dynamic workflows** are a _runtime-dependent research preview_ — documented here,
  not shipped as `.js` files.
- **User-invocable skills are interactive-only** — they're for a human at the prompt, not for
  unattended automation.

---

## Plugin-conversion path

This repo is the prototype of a distributable plugin. Converting it is a mechanical
re-layout — the contents are already correct:

| In this repo (project)                 | In a plugin                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `.claude/commands/`                    | `commands/`                                                                      |
| `.claude/agents/`                      | `agents/`                                                                        |
| `.claude/skills/`                      | `skills/`                                                                        |
| `.claude/settings.json` `hooks` object | `hooks/hooks.json`                                                               |
| _(none)_                               | `.claude-plugin/plugin.json` — only `plugin.json` lives inside `.claude-plugin/` |

Other rules to know:

- **Plugin skills are namespaced**: `/recommend-plugins` becomes
  `/<plugin>:recommend-plugins`.
- **Paths use `${CLAUDE_PLUGIN_ROOT}`** instead of `$CLAUDE_PROJECT_DIR`. The adoption
  payload already resolves via `${CLAUDE_PLUGIN_ROOT:-$CLAUDE_PROJECT_DIR}`, so it works in
  both forms unchanged.
- **A plugin-root `CLAUDE.md` is NOT loaded** — don't rely on one for plugin behavior; put
  guidance in skills/agents instead.
- The adoption skills are the plugin's reason to exist. The **version-floor + effort hooks**
  ship in the plugin's `hooks/hooks.json`, and the **2.1.160 floor goes in the plugin
  `description`** — the only human-readable place it can be stated, since no manifest field
  enforces it.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. The toolchain scripts (also the ones settings.json pre-approves)
npm run lint        # eslint
npm run test        # vitest (tests/format.test.ts)
npm run typecheck   # tsc --noEmit, strict
npm run format      # prettier --write

# 3. (optional) personal overrides
cp CLAUDE.local.md.example CLAUDE.local.md
cp .claude/settings.local.json.example .claude/settings.local.json

# 4. (optional) MCP
cp .mcp.json.example .mcp.json    # then set API_BASE_URL / API_KEY
```

When you open this repo in Claude Code, the **permissions and hooks activate automatically on
session start** — no extra step. `check-version.sh` will warn if you're below 2.1.160, and
`session-context.sh` re-injects the standing reminders after any context compaction.

---

## License

[MIT](LICENSE).
