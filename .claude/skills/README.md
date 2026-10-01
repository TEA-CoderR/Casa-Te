# Project skills

Design skills loaded automatically by Claude Code in this repository.

| Skill | Source | Version | License |
|---|---|---|---|
| `impeccable/` | https://github.com/pbakaus/impeccable (`.claude/skills/impeccable`) | v4.4.0, commit `c74755d` (2026-10-01) | Apache-2.0 |
| `taste-skill/` (`design-taste-frontend`) | https://github.com/Leonxlnx/taste-skill (`skills/taste-skill`) | commit `ce26fc2` (2026-09-26) | MIT |

Notes
- Impeccable's launcher (`impeccable/scripts/impeccable`) downloads its engine binary from the
  project's GitHub releases on first use and verifies the `.sha256` sidecar; if it cannot run, the
  skill falls back to reading the files directly.
- Taste Skill targets landing pages/portfolios; for the admin console (Operate mode) prefer Impeccable.
- Project rules still apply: Italian customer UI, no invented product data or claims (AGENTS.md).
- To update, re-copy the folders from upstream and bump the table above.
