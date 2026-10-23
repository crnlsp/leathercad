# Instructions for coding agents

This project's agent instructions live in two places, written for Claude Code and binding on
every agent. Read them before changing anything; this file only points at them, so they cannot
drift apart.

1. **[`CLAUDE.md`](CLAUDE.md)** — the invariants, commands, layout and conventions. Always read it
   first. Its rules are not optional: violating an invariant is a bug even when the tests pass.
2. **[`.claude/rules/`](.claude/rules/)** — engineering practice, one file per area:
   - `engineering-practices.md` applies everywhere.
   - Each other file starts with a `paths:` list. Read it whenever you touch a file that matches
     one of those globs.

Where a rule file and `CLAUDE.md` disagree, `CLAUDE.md` wins.

`CLAUDE.md` points to slash commands and skills under `.claude/`. If your tool cannot run them,
read the matching file in `.claude/commands/` or `.claude/skills/` and do its steps by hand.
