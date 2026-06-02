<!--
  LEGACY FORM — this file is intentionally the old style.

  This is a flat-markdown custom slash command: a single `.md` file under
  `.claude/commands/`, where the filename IS the command. This file is
  `legacy-hello.md`, so it is invoked as `/legacy-hello`.

  Contrast it with the modern form, `.claude/skills/fix-issue/` — a *skill*
  directory containing a `SKILL.md` (plus optional REFERENCE.md, scripts/, and
  frontmatter like `allowed-tools` / `argument-hint`). Skills are the current
  best practice: they carry richer metadata, support progressive disclosure, and
  the model can invoke them on its own (unless `disable-model-invocation: true`),
  whereas a flat command like this one is essentially a stored prompt template.

  Migration path: a flat command `foo.md` becomes a skill by moving it to
  `.claude/skills/foo/SKILL.md` and adding frontmatter. Keep this one around only
  to demonstrate the legacy shape and the upgrade.

  NAME COLLISION: if a skill and a flat command share the same base name, the
  SKILL WINS — the skill shadows the flat command of the same name. So do not
  ship both `commands/fix-issue.md` and `skills/fix-issue/`; the command would be
  dead. (HTML comments like this one cost no tokens — they are stripped before
  the prompt is sent.)
-->

Greet the person or thing named in the argument.

Say hello to: **$ARGUMENTS**

If `$ARGUMENTS` is empty, greet the world instead. Keep it to one friendly
sentence — this command exists to demonstrate `$ARGUMENTS` substitution in the
legacy flat-command form, nothing more.
