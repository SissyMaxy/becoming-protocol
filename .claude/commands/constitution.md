---
description: Amend the Protocol Constitution (operator-explicit only)
---

You are running **/constitution** for the Protocol.

Input: `$ARGUMENTS` (the amendment the operator wants).

The Constitution (`.specify/memory/constitution.md`) is the law every spec/plan/
implementation is validated against. Amending it is the ONLY way to relax or
change an article — no agent may weaken an article to make a feature pass.

Do this:
1. Read the current constitution.
2. Confirm the amendment is an explicit operator instruction (this command's args
   or a clear chat directive). If it would weaken a floor/safety article (Art. II),
   restate plainly what protection is being reduced and confirm intent before
   writing.
3. Edit the relevant article(s); keep the structure (principle + Validation line).
   Bump the "Ratified" date and append a one-line amendment note.
4. Flag any existing specs/plans whose Constitution Check may now change.

Output: the diff of what changed and which in-flight features need re-`/analyze`.
