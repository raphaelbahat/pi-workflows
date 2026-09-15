# Development and Maintenance

CI, scripts, distribution mechanics, and operational notes. Related:
[Workflows — OpenSpec group](workflows/openspec-workflows.md) ·
[Workflows — Pi Plugin group](workflows/pi-plugin-workflows.md) ·
[OpenSpec Index](openspec-index.md) · [Validation History](validation-history.md).

## Distribution (Skillshare extras)


- **Tracked install (recommended for consumers):** `skillshare install raphaelbahat/pi-workflows --track`
  preserves the repo's `.git`, so `skillshare update pi-workflows` later pulls the latest workflows via
  git in one command (see the README's Quick Setup for both installation paths).
- **Tracked clone path:** the `--track` install clones into the Skillshare **agents** source as
  `_pi-workflows/` (the repo has no `SKILL.md`, so Skillshare classifies it as an agents repo):
  `~/.config/skillshare/agents/_pi-workflows/`. Point the extras' `source:` fields at
  `~/.config/skillshare/agents/_pi-workflows/workflows/openspec` and
  `~/.config/skillshare/agents/_pi-workflows/workflows/pi-plugin` — edit
  `~/.config/skillshare/config.yaml` for an existing setup (`extras init --force` resets the
  target list), then `skillshare sync extras -g --force`. See the README's Distribution section
  for the full tracked and untracked registration commands.
- **Valid distribution targets:** `.pi/workflows/`, `.agents/workflows/`, or `<agent dir>/workflows/` —
  any directory the pi-subagents resolver scans works; pick the one your setup already uses.
- **Edit at source only** (`~/pi-workflows`), then `skillshare sync extras --force` — targets are
  managed **copies** (mode=copy) that go stale after source edits; plain sync SKIPS conflicting
  files in copy mode, so `--force` is the standard re-sync. `skillshare extras list` shows drift,
  `skillshare diff` covers extras. Never edit synced files inside a project.
- **Mode must be `copy`:** pi-subagents' workflow resolver SKIPS SYMLINKS when scanning
  `.pi/workflows/`, so `merge` (per-file symlink) and `symlink` (whole dir) modes break by-name
  discovery. Verified 2026-09-02: symlinked workflow → "No saved workflow named ..."; real copy
  → resolves.
- Add new projects as targets (both extras, same target):
  `skillshare extras pi-workflows-openspec --add-target /path/to/project/.pi/workflows -g &&
  skillshare extras pi-workflows-plugins --add-target /path/to/project/.pi/workflows -g` then
  `skillshare sync extras -g --force`. Retire scratch projects with `--remove-target … --prune`
  on both extras.
- Releases run through release-please (conventional commits → version + CHANGELOG PRs).

## CI gate

`node scripts/check-workflow-syntax.mjs` runs `node --check` on every workflow script — wired
into prek and GitHub Actions; it must pass before every push. Workflow scripts must keep the
`export const meta = { name, description }` declaration (the resolver's marker), a pure-literal
`meta`, and no `Date.now`/`Math.random` (determinism for resume).

## Scripts

### scripts/check-workflow-syntax.mjs
The CI gate above. Run locally before pushing: `node scripts/check-workflow-syntax.mjs` (all
workflows) or pass specific files.

### scripts/analyze-subagent-transcripts.ts
TypeScript diagnostics over pi workflow journals + sub-agent session files (run with bun):

```bash
bun scripts/analyze-subagent-transcripts.ts [SESSIONS_DIR] [--days N] [--top N] [--last-n N] [--range A..B] [--json | --plain]
```

A workflow run = one `wf_*.workflow.jsonl` journal; its sub-agent children = sidechain sessions in the run's time window, role-classified from the first dispatch prompt. Reports per-run/per-role/overall token stats (total/avg/min/max/median), aggregate tool distribution, loop signatures, and ctx_* adoption. Output modes: default pretty (console-table-printer tables + @crafter/charts sparklines), `--plain` (text), `--json` (programmatic). Live use (2026-09-13) identified the 2,064× degenerate `StructuredOutput` loop from a `glm-5.3-flash` status child.

## Operational notes

- **GPG-signed commits.** If the agent's passphrase cache expires mid-work, signing fails with
  `failed to write commit object` / `Couldn't find key in agent?` — stage the work and re-run the
  host unlock ritual (`echo test | gpg --batch --clearsign /dev/null`), then retry the commit.
  An interrupted `git pull --rebase` can be parked with `git rebase --abort` (work stays staged).
- **Checkpoint bridge**: the checkpoint-bridge extension (this repo, published as
  `pi-checkpoint-bridge`) is required for all `workflows/openspec/` authoring/apply workflows —
  see [Workflows — OpenSpec group](workflows/openspec-workflows.md).
- **pi-subagents quirks** (source-verified + issue-tracked upstream): agent-file `tools:` fields
  scope built-ins only, extension tools need `extensions:` frontmatter entries pointing at
  extension **entry files**; `StructuredOutput`-schema'd children can loop on degenerate
  payloads (hence the QA pattern); lazily-registered extension tools surface via re-derived
  scoping on v0.15+.
