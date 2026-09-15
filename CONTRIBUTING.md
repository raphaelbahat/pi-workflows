# Contributing

This repository holds the pi-subagents workflow scripts, grouped by family under
`workflows/pi-plugin/` and `workflows/openspec/`, plus the `checkpoint-bridge` extension
under `extensions/` (see each directory for the current script inventory). The workflow
scripts do **not** publish to npm — releases are tags + GitHub Releases + `CHANGELOG.md`,
fully automated via release-please. The checkpoint-bridge extension **does** publish to
npm as `pi-checkpoint-bridge`, automated by the release workflows.

## Rules

1. **Workflow scripts are engine-shaped.** pi-subagents compiles the scripts
   as an async function body: top-level `return`/`await` are legal, and the
   `export const meta = {...}` header is loader metadata. Do not restructure
   them into plain modules; keep `meta` accurate when behavior changes.
2. **Gates before pushing.**

   ```bash
   prek run -a                                    # hygiene builtins + syntax gate
   node scripts/check-workflow-syntax.mjs workflows/pi-plugin/*.js workflows/openspec/*.js   # what CI runs
   ```

   A bare `node --check workflows/pi-plugin/pi-plugin-eval.js` always fails by design (top-level
   `return`); use the gate script, which reproduces the engine's wrapper
   shape. `package.json` carries `"type": "module"` for the ESM `meta`/import
   parsing.
3. **Conventional commits.** `feat: ...`, `fix: ...`, `docs: ...`,
   `chore: ...` — release-please parses these to version releases. Commits
   are signed via gpg-agent; keep signatures intact.
4. **Edit at source.** Copies of these scripts installed into pi profiles or
   on other machines are sync outputs, never edited targets — edit here and
   sync via skillshare / your pi setup.
5. **Releases are fully automated.** Push conventional commits to `master`;
   release-please opens the Release PR (branch
   `release-please--branches--master`), a workflow step merges it, and the
   publisher tags and publishes the GitHub Release. `CHANGELOG.md` is
   maintained by release-please — never hand-edit it.
