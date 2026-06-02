# Security policy

`claude-code-onboard` is configuration tooling for Claude Code — it ships shell hooks,
skills, and Node scripts that run on a developer's machine. We take the safety of that
surface seriously.

## Supported versions

This project is pre-1.0 (`0.x`). Security fixes land on the latest `main` only; pin to a
commit if you need stability.

## Reporting a vulnerability

**Please do not open a public issue for security problems.** Use GitHub's private
vulnerability reporting:
**[Report a vulnerability](https://github.com/christopherjohnson1/claude-code-onboard/security/advisories/new)**
(the repo's **Security** tab → _Report a vulnerability_). Include the affected
file/hook/skill, reproduction steps, and the impact. We aim to acknowledge within a few days.

## What counts as a vulnerability here

Because this repo's whole point is _guardrails_, these are in scope:

- Making a `PreToolUse` hook **fail open** — letting an edit reach a protected path
  (`.env*`, `migrations/`, `package-lock.json`, `.git/`, `.claude/.adopt-backups/`) that
  `protect-files.sh` should block, or a destructive `rm -rf` that `no-rm-rf.sh` should deny.
- A hook or skill script **executing attacker-controlled input** (command injection via
  crafted stdin JSON, filenames, or environment variables).
- An adoption/revert script (`*.mjs`) writing outside its intended target or clobbering a
  backup snapshot.

## Secrets: the standing stance

Secrets never belong in committed files, and contributions must preserve the repo's defense
in depth:

- `settings.json` **denies** reads of `.env`, `.env.*`, and `./secrets/**`.
- `protect-files.sh` **blocks** edits to `.env*` outright.
- MCP config uses `${ENV}` expansion only (`.mcp.json.example`) — never literal credentials.

If you spot a committed secret, treat it as a vulnerability and report it privately so it can
be rotated.
