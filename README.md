# claude-code-onboard

[![CI](https://github.com/christopherjohnson1/claude-code-onboard/actions/workflows/ci.yml/badge.svg)](https://github.com/christopherjohnson1/claude-code-onboard/actions/workflows/ci.yml)

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
8. [Large codebases & monorepos](#large-codebases--monorepos)
9. [Effort, ultracode & the version floor](#effort-ultracode--the-version-floor)
10. [The adoption engine](#the-adoption-engine)
11. [Workflows](#workflows)
12. [Plugin-conversion path](#plugin-conversion-path)
13. [Quick start](#quick-start)
14. [License](#license)

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

There is a second, orthogonal axis: **locality** — _where_ a layer's config lives and _how
far down the tree_ it applies. In a small flat repo (like this one) everything sensibly
lives in one root `CLAUDE.md` + one `.claude/`. In a monorepo that default fills the context
window with conventions for packages you aren't touching, so the same layers get _scoped_:
per-directory `CLAUDE.md`, path-scoped `.claude/rules/`, per-package skills, and `Read`
denies for generated trees. The least-powerful-mechanism discipline still applies — you just
also choose the **narrowest scope** that covers the code. See
[Large codebases & monorepos](#large-codebases--monorepos).

---

## File-tree walkthrough

Every entry below is a real file in this repo.

```
claude-code-onboard/
├── README.md                          # this file
├── LICENSE                            # MIT
├── CONTRIBUTING.md                    # how to contribute: the verification loop, conventions, PR flow
├── SECURITY.md                        # report a vulnerability; the secrets-safety stance
├── CLAUDE.md                          # < 200 lines advisory memory; @imports README/package.json/docs
├── CLAUDE.local.md.example            # personal, gitignored memory (copy to CLAUDE.local.md)
├── .gitignore                         # node_modules, .env*, dist, settings.local.json, CLAUDE.local.md, .adopt-backups/, .DS_Store
├── .prettierignore                    # generated files Prettier skips (package-lock.json, dist/, coverage/)
├── .mcp.json.example                  # HTTP MCP server template (copy to .mcp.json, set env)
├── .github/
│   ├── workflows/ci.yml               # CI: lint/typecheck/test/prettier on Node 20 & 22 → ci-success gate
│   ├── ISSUE_TEMPLATE/                # bug_report.md, feature_request.md, config.yml
│   ├── PULL_REQUEST_TEMPLATE.md       # PR checklist mirroring the verification loop
│   └── dependabot.yml                 # weekly npm + github-actions updates
├── .claude-plugin/                     # makes the repo an installable plugin (in-place, zero-dup)
│   ├── plugin.json                     # manifest: remaps components onto .claude/; floor in description
│   ├── marketplace.json                # single-plugin marketplace (source: "./")
│   └── hooks.json                      # settings.json hooks rebased to ${CLAUDE_PLUGIN_ROOT}
├── package.json                       # scripts: lint / test / typecheck / format
├── package-lock.json                  # committed lockfile → reproducible `npm ci` in CI
├── eslint.config.js                   # flat ESLint config (makes `npm run lint` real); bans default exports
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
_asks_ before the one risky thing (`git push:*`), and _denies_ secret reads, checked-in
generated/vendored trees, and raw network egress (`Read(.env)`, `Read(.env.*)`,
`Read(./secrets/**)`, `Read(./**/dist/**)`, `Read(./**/build/**)`, `Read(./**/*.generated.*)`,
`Read(./vendor/**)`, `Bash(curl:*)`, `Bash(wget:*)`).

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

Two practical notes for larger repos. First, the **generated/vendored `Read` denies**
(`dist/`, `build/`, `*.generated.*`, `vendor/`) are _context hygiene, not security_: they
stop the agent from burning context `cat`/`grep`-ing machine output. `.gitignore` already
keeps _untracked_ build output out of searches, but a **committed** generated tree (a
vendored SDK, checked-in generated clients) needs an explicit deny. Per the docs, a `Read`
deny covers the built-in file tools and recognized Bash file commands (`cat`, `head`, `grep`,
`find`) when a denied path is an argument — it does **not** filter denied paths out of a
recursive search's _output_, nor cover arbitrary subprocesses. Second, **`./`-relative
patterns scope to the start directory's subtree**, so to match a generated dir wherever it
appears in a monorepo, prefix the glob with `**/` (`Read(./**/dist/**)`), not just
`Read(./dist/**)`. See [Large codebases & monorepos](#large-codebases--monorepos).

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

### Large-repo hook patterns (documented, not shipped)

The same "document the pattern, don't ship it" discipline covers several hook ideas the
[monorepo guide](https://code.claude.com/docs/en/large-codebases) raises. None ship here —
each would over-fit the flat sample app or duplicate the CI gate — but they are the natural
next hooks once this standard lands in a large tree:

- **SessionStart launch-dir → plugin recommender.** A `SessionStart` (all-sources) hook can
  read the launch directory from its stdin (defensively probe `.cwd` / `.directory` / `$PWD`,
  `exit 0` if absent), look it up in a committed `path-map.json`, and print "you're in
  `packages/api/` — its owners maintain the `api-tooling` plugin" to stdout so it lands in
  context before the first prompt. This is a **new** hook, not a tweak to
  [`session-context.sh`](.claude/hooks/session-context.sh) (which is `compact`-only).
- **Stop hook that proposes `CLAUDE.md` updates.** A `Stop` hook receives the session
  transcript path; it can review the session and propose `CLAUDE.md` edits while the gap is
  fresh — most valuable per-package, the highest-drift artifact in a monorepo. Guard
  `stop_hook_active`, as in [the known gap](#the-known-gap-and-how-a-stop-hook-closes-it).
- **Per-package verification hook.** A `PostToolUse(Edit|Write)` hook can resolve the edited
  file's nearest `package.json` and run _that_ package's `typecheck`/`lint` (non-blocking).
  We don't ship it: it would contradict the deliberate "CI is the verification gate; lint
  doesn't block the turn" decision — but it is the right shape for a monorepo that wants fast
  per-package feedback.
- **Format hook resolves prettier from the root.**
  [`format-on-edit.sh`](.claude/hooks/format-on-edit.sh) runs `npx --no-install prettier` from
  the launch/worktree root, so in a monorepo every edit is formatted by the _root_ prettier
  (a package on a different prettier major sees churn; a package whose prettier lives only in
  its own `node_modules` silently no-ops). Config still auto-discovers per file. Hoist
  prettier to the workspace root rather than adding per-package binary resolution, which
  would break the intentionally-cosmetic, exit-0 contract.

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

### Scoping & placement in large repos

Three current skill features matter once a repo grows — none the flat sample app needs to
_ship_, but all the standard should teach:

- **`paths:` frontmatter scopes a skill like a rule.** A skill in the root
  `.claude/skills/` can declare `paths:` globs so it loads only when Claude touches matching
  files — e.g. a migration-helper scoped to `**/migrations/**`, which would pair neatly with
  this repo's protected `migrations/` directory. (No skill here uses `paths:` yet; it is the
  skill analogue of [`rules/api.md`](.claude/rules/api.md).)
- **Placement follows scope.** A shared skill (PR conventions, a deploy checklist) lives in
  the repo-root `.claude/skills/` so it loads from any start directory. An area-specific
  skill lives under `<package>/.claude/skills/` and loads on demand only while Claude works
  in that package — in a monorepo, [`api-handler`](.claude/skills/api-handler/SKILL.md)'s
  `src/api/handlers/` target becomes `packages/<pkg>/...`. Or keep it central and scope it
  with `paths:`. Cross-repo / versioned reuse → package it as a plugin (already modeled by
  this repo's [Plugin-conversion path](#plugin-conversion-path)); plugin skills get a
  `plugin-name:skill-name` namespace, so they never collide with per-directory skills.
- **Descriptions get shortened when there are many.** Names always load, but with the
  hundreds of skills a monorepo root accumulates, descriptions are truncated — so front-load
  each `description` with the literal trigger phrases and scope nouns a request would contain
  ("tests in `packages/api/`"), not prose. The OTEL `skill_activated` event with
  `OTEL_LOG_TOOL_DETAILS=1` records which skills actually fire, so you can retire unused ones.

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

## Large codebases & monorepos

This repo is a small **flat** app, so its own config sensibly lives in one root `CLAUDE.md`

- one `.claude/`. But the adoption engine installs the standard into _any_ repo — and the
  first thing many teams point it at is a monorepo. In a large tree the small-repo defaults
  fill the context window with instructions and file reads for code the task never touches.
  The fix is the [locality axis](#the-guiding-principle-least-powerful-mechanism): keep the
  least-powerful mechanism, and also pick the **narrowest scope** that covers the code. The
  authoritative reference is the official guide,
  [Set up Claude Code in a monorepo or large codebase](https://code.claude.com/docs/en/large-codebases);
  this section maps each mechanism onto the layers above.

### Where you start Claude — and the inheritance trap

Where you launch `claude` decides what loads:

- **From the repo root:** every file is reachable; only the **root** `CLAUDE.md` loads at
  launch, and each subdirectory's `CLAUDE.md` loads on demand when Claude reads a file
  there. Best when a task spans packages.
- **From a package (`cd packages/api && claude`):** that subtree only, with that directory's
  `CLAUDE.md` **plus every ancestor's**. Best when work is scoped to one package.

> **The trap:** unlike `CLAUDE.md`, `.claude/settings.json` is **not inherited from parent
> directories** — a root settings file applies _only_ when you start from the root. Launch
> inside `packages/api/` and the standard's `permissions` (the `.env`/secret/`curl` denies)
> and its `$CLAUDE_PROJECT_DIR`-wired hooks silently **don't load**. Remedies: start from the
> root; keep a **self-contained** `.claude/settings.json` per package; or put rules you need
> everywhere in **managed settings**, which user/project settings can't override.

### Scope instructions: per-directory `CLAUDE.md` vs path-scoped rules

Both target instructions at part of the tree; they differ in where the file lives and when
it loads.

| Approach                             | Lives                          | Loads when                                                  | Use when                                                             |
| ------------------------------------ | ------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Per-directory `CLAUDE.md`            | inside the directory's code    | at launch from there (or on demand when Claude reads there) | the directory's owners version conventions alongside their code      |
| Path-scoped rule in `.claude/rules/` | central `.claude/` at the root | when Claude touches a file matching its `paths:` glob       | you want conventions in one place, or one rule spans scattered paths |

This repo ships the path-scoped half — [`rules/api.md`](.claude/rules/api.md) declares
`paths: ["src/api/**"]` — and can only _describe_ the per-directory half, being flat. A
monorepo typically uses both: a root `CLAUDE.md` that **orients** ("this is a monorepo;
packages live under `packages/`; run commands from the package directory") plus, per package,
either a co-located `CLAUDE.md` or a root `rules/<pkg>.md` scoped with `paths:`.

### Exclude, deny, and reduce reads

- **`claudeMdExcludes`** (settings; arrays merge across user/project/local/managed) skips
  `CLAUDE.md`/rules under packages you never touch. Patterns match **absolute** paths, so
  prefix with `**/` (`"**/packages/legacy-*/**"`). Put personal excludes in
  `settings.local.json`. Managed-policy `CLAUDE.md` can't be excluded. It's static — to focus
  per-task, _start from that package_ instead.
- **`Read` denies for committed generated/vendored code** — this repo now ships
  `Read(./**/dist/**)`, `Read(./**/build/**)`, `Read(./**/*.generated.*)`, `Read(./vendor/**)`
  (see [Permissions](#permissions-syntax-the-gotchas)). `.gitignore` already keeps _untracked_
  output out of search; an explicit deny is for trees that are **checked in**.
- **Code-intelligence (LSP) plugins** — `/recommend-plugins` surfaces the per-language
  `*-lsp` plugins (`typescript-lsp`, `pyright-lsp`, `gopls-lsp`, …) as **scan-reducers**:
  jump-to-definition / find-references via a language server instead of grep-walking the tree.
  Enable repo-wide with the `enabledPlugins` project setting.

### Worktrees & cross-package access

- **`worktree.sparsePaths`** writes only the listed directories (plus root-level files) into a
  `--worktree` checkout. List directories, not files; root-level **dirs** aren't auto-checked
  out, so **include `.claude`** or the worktree loses the settings/rules/skills you rely on.
  Pair with **`worktree.symlinkDirectories: ["node_modules"]`** to avoid duplicating deps.
  These are read from the start dir _before_ the worktree is created, and are **shared by every
  worktree in the session** — including subagent worktrees, so list every package a subagent
  needs.
- **`permissions.additionalDirectories`** grants file access to sibling packages/repos but
  **never loads** their `CLAUDE.md`/rules/skills. **`--add-dir`** (or `/add-dir`) loads skills,
  and loads `CLAUDE.md`/rules only with `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`.

### Changes that span packages

For a change touching several packages (update a shared type + every call site), do the whole
change in **one session** so the decisions stay consistent, and ask Claude to **write the plan
to a markdown file** first — a long cross-package session compacts its context, and the saved
plan survives where conversation history may not.

### What this flat repo deliberately does _not_ do

It ships **no populated** `claudeMdExcludes`, `worktree.sparsePaths`, or `additionalDirectories`
— a single flat app has nothing to exclude or sparse-check-out, so a value would be fiction.
These are documented here and _generated by the adoption engine_ when it detects a workspace
layout (see [The adoption engine](#the-adoption-engine)), not baked into the sample config.

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

| Goal                                                                | Achievable?                     | Mechanism                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Require CC ≥ 2.1.160                                                | ⚠️ **Soft only**                | README + plugin `description`; warn-only [`check-version.sh`](.claude/hooks/check-version.sh)                                                                                                                                                                                                                                                                                                                            |
| Nudge to `/effort ultracode` **on this repo's slash commands only** | ✅ Yes                          | [`recommend-effort.sh`](.claude/hooks/recommend-effort.sh) — a `UserPromptExpansion` hook scoped by a `command_name` matcher, with a once-per-session marker and a one-time `systemMessage`. It does **not** gate on the effort tier: a live capture confirmed `$CLAUDE_EFFORT` is **not** exposed to this event, so it nudges once per session regardless. (Not `PreToolUse` — direct `/command` typing bypasses that.) |
| Raise xhigh **reasoning** per-invocation                            | ✅ Yes (chosen)                 | `effort: xhigh` frontmatter on the **three heavy skills only** (`adopt-ai-rules`, `revert-ai-rules`, `recommend-plugins`)                                                                                                                                                                                                                                                                                                |
| Raise xhigh **session-wide** via committed `effortLevel`            | ✅ possible, **but NOT chosen** | A committed `effortLevel` would override the user's own session effort choice, so we don't ship one                                                                                                                                                                                                                                                                                                                      |
| Auto-apply ultracode **orchestration**                              | ❌ No                           | Session-only; settable only via `/effort ultracode`, `--settings {"ultracode":true}`, or an SDK control request — never via settings / flag / env / frontmatter                                                                                                                                                                                                                                                          |
| Detect ultracode vs plain xhigh                                     | ❌ No                           | Ultracode reports as `xhigh` everywhere a hook can read it                                                                                                                                                                                                                                                                                                                                                               |

**No committed `effortLevel` lives anywhere in this repo** — not in `settings.json`, not in
`settings.local.json.example`. Effort is raised _only_ per-invocation, _only_ via the
`effort: xhigh` frontmatter on the three heavy skills (legal values:
`low | medium | high | xhigh | max`). That frontmatter raises **reasoning depth only**, never
ultracode orchestration, and reverts after the skill finishes; on Opus 4.6 / Sonnet 4.6 it
degrades to `high`. No other skill carries effort frontmatter.

The `recommend-effort.sh` nudge is **best-effort by design**: a hook can _recommend_ effort
but can never _set_ it. It originally gated on `$CLAUDE_EFFORT` (nudge only when below xhigh),
but a live capture (`CC_ARCH_HOOK_DEBUG=1`) confirmed that **`$CLAUDE_EFFORT` is not exposed to
a `UserPromptExpansion` hook** — it is unset in the hook's environment even when the session is
at `high`, and the event's stdin carries no effort field either. So the gate was removed: the
hook now nudges **once per session** whenever one of these commands is typed, with the message
worded so it never asserts the current tier. (Even if the var were available, ultracode reports
as `xhigh`, so a hook still could not distinguish a real user-`xhigh` from ultracode.)

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

Most are **documented patterns** rather than shipped code; the CI workflow is the exception:

- **explore → plan → code → commit.** Read and understand first, write a plan, implement,
  then commit (with `/commit`, which drafts and prints — you run the command).
- **Delegate research to subagents.** Push exploration/review into an isolated context
  (`code-reviewer`, `security-reviewer`) so the main thread stays focused; only the summary
  returns.
- **The verification loop.** After a change, run the [`tests/`](tests/) suite _and_ hand the
  diff to the review subagent — code is "done" only when tests pass and review is clean. This
  is why the repo ships [`tests/format.test.ts`](tests/format.test.ts): it closes the loop.
- **Continuous integration (shipped).** [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
  runs the verification loop — `lint`, `typecheck`, `test`, `prettier --check` — on every push
  to `main` and every PR, across Node 20 and 22. A single `ci-success` gate job is the required
  status check protecting `main`.
- **Headless / CI.** `claude -p "<prompt>"` runs non-interactively for CI fan-out and
  scripting.
- **Saved dynamic workflows** are a _runtime-dependent research preview_ — documented here,
  not shipped as `.js` files.
- **User-invocable skills are interactive-only** — they're for a human at the prompt, not for
  unattended automation.

---

## Plugin-conversion path

This repo **is** a distributable plugin — packaged **in-place**, with zero file duplication,
true to its "dogfoods exactly what it installs" principle. A thin
[`.claude-plugin/`](.claude-plugin/) manifest remaps the plugin's components onto the existing
`.claude/` tree (no top-level re-layout, no forked copies):

| File                                                  | Role                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`plugin.json`](.claude-plugin/plugin.json)           | Manifest. Remaps `commands`/`skills` to the `.claude/…` dirs and `agents` to the two agent **files** (the `agents` field takes file paths, not a directory — unlike `commands`/`skills`); points `hooks` at the hooks.json below; states the 2.1.160 floor in `description`. |
| [`hooks.json`](.claude-plugin/hooks.json)             | The `settings.json` `hooks` object, rebased from `$CLAUDE_PROJECT_DIR` to `${CLAUDE_PLUGIN_ROOT}` so the same `.claude/hooks/*.sh` scripts run from the install cache.                                                                                                       |
| [`marketplace.json`](.claude-plugin/marketplace.json) | Makes the repo its own single-plugin marketplace (`source: "./"`).                                                                                                                                                                                                           |

Install it (a git-marketplace install clones the whole repo into the cache, so the remapped
`.claude/…` paths and `${CLAUDE_PLUGIN_ROOT}/.claude/hooks/*.sh` resolve unchanged):

```bash
/plugin marketplace add christopherjohnson1/claude-code-onboard
/plugin install claude-code-onboard@claude-code-onboard
```

The conventional alternative is a mechanical top-level re-layout — shown here for reference,
though we chose in-place to avoid duplicating the standard:

| In this repo (project)                 | In a plugin                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `.claude/commands/`                    | `commands/`                                                                      |
| `.claude/agents/`                      | `agents/`                                                                        |
| `.claude/skills/`                      | `skills/`                                                                        |
| `.claude/settings.json` `hooks` object | `hooks/hooks.json`                                                               |
| _(none)_                               | `.claude-plugin/plugin.json` — only `plugin.json` lives inside `.claude-plugin/` |

Other rules to know:

- **Plugin skills are namespaced**: `/recommend-plugins` becomes
  `/claude-code-onboard:recommend-plugins`.
- **Paths use `${CLAUDE_PLUGIN_ROOT}`** instead of `$CLAUDE_PROJECT_DIR`. The adoption
  payload already resolves via `${CLAUDE_PLUGIN_ROOT:-$CLAUDE_PROJECT_DIR}`, so it works in
  both forms unchanged.
- **A plugin-root `CLAUDE.md` is NOT loaded** — don't rely on one for plugin behavior; put
  guidance in skills/agents instead.
- The adoption skills are the plugin's reason to exist. The **version-floor + effort hooks**
  ship in `.claude-plugin/hooks.json`, and the **2.1.160 floor goes in the plugin
  `description`** — the only human-readable place it can be stated, since no manifest field
  enforces it.

---

## Quick start

### Install & use the plugin (in any repo)

> **Prerequisites:** Claude Code **≥ 2.1.160** and `git` on the machine. This repo is a
> **public** GitHub marketplace, so no GitHub auth is needed to add it.

Plugins install at the **user level**, so it doesn't matter which workspace you're in. From
inside a Claude Code session, add the marketplace and install the plugin:

```text
/plugin marketplace add christopherjohnson1/claude-code-onboard
/plugin install claude-code-onboard@claude-code-onboard
```

- The first command clones the repo into Claude Code's local cache and registers it as a
  marketplace (it finds [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json)
  automatically).
- The install ref is `<plugin>@<marketplace>` — both are named `claude-code-onboard` here.
- Prefer a UI? Run `/plugin` with no arguments to add the marketplace and install from the
  interactive browser.
- [`check-version.sh`](.claude/hooks/check-version.sh) warns on session start if you're below
  2.1.160 (a soft floor — see [Effort, ultracode & the version floor](#effort-ultracode--the-version-floor)).

Once installed, the commands are **namespaced** under the plugin name:

```text
/claude-code-onboard:adopt-ai-rules      # scaffold or migrate a repo to this standard
/claude-code-onboard:revert-ai-rules     # undo an adoption from its backup snapshot
/claude-code-onboard:recommend-plugins   # scan the repo, print real /plugin suggestions
/claude-code-onboard:fix-issue <n>       # fetch a GitHub issue, implement, stage + commit
/claude-code-onboard:commit              # draft a Conventional-Commits message (prints only)
/claude-code-onboard:api-handler         # scaffold a new src/api/handlers/ handler
```

**The intended flow in a fresh repo:** install the plugin, then run
**`/claude-code-onboard:adopt-ai-rules`** to scaffold the configuration standard (`CLAUDE.md`,
`settings.json`, `.claude/rules/`, the hooks) into it — backed up first and fully reversible
via `/claude-code-onboard:revert-ai-rules`. See [The adoption engine](#the-adoption-engine).

Two things to know before you rely on it:

- **The plugin ships the skills, the two subagents, and the six hooks — _not_ this repo's
  `CLAUDE.md` or `settings.json` permissions.** Those are project-scoped (a plugin-root
  `CLAUDE.md` is [never loaded](#plugin-conversion-path)), which is exactly why
  `adopt-ai-rules` exists: it installs those project files into a target repo.
- **An installed plugin's hooks are active in _every_ repo on that machine.**
  [`format-on-edit.sh`](.claude/hooks/format-on-edit.sh) runs `prettier --write` on files you
  edit, and [`protect-files.sh`](.claude/hooks/protect-files.sh) blocks edits to `migrations/`,
  `.env*`, `package-lock.json`, and `.git/`. Disable the plugin via `/plugin` in repos where
  you don't want those guards.

### Local development (working on this repo)

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
