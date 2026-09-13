# Validation History

Measured pilots and production runs of the workflow family. Related: [Development and
Maintenance](development-and-maintenance.md) (the gates and diagnostics used here) and the
[OpenSpec Index](openspec-index.md).

- **2026-09-13** — `add-workflow-model-fallback` implemented in all three OpenSpec workflow
  scripts (`agentFB` + cross-provider chains + `pi --list-models` discovery filtering;
  strict-valid; syntax gate green). Motivated by two OpenRouter shared-pool `429`s in the
  apply-campaign runs.
- **2026-09-13** — apply-campaign runs against 8 changes (84 tasks): first run 4.24M tokens /
  51 agents / 4 h, zero complete — root causes (unanswered bridge escalations aborting whole
  changes; load/status parse regressions) fixed with skip-and-continue + verbatim-JSON output
  contracts + configurable `onUnansweredEscalation`. A 2,292× `StructuredOutput` loop on
  `glm-5.3-flash` (degenerate blocked-snapshot payload) was diagnosed via
  `scripts/analyze-subagent-transcripts.mjs` and killed by the QA pattern (text verdicts +
  `parseAgentJson`) applied to ALL schema'd classes + the 3-strike malformed-call cap.
- **2026-09-11..12** — production run #2 (`add-cgc-slash-commands`) completed 11/11 across two
  attempts — first attempt 9.48M tokens (loop + full-suite test burns), continuation 402k tokens /
  94 tool uses / 12.6 min after the fixes. Final: 303/303 tests, `tsc` clean, strict-valid,
  commit `9193694`. Effort tiers (load medium, primer high) and the primer pointer-misfire guard
  date from this run.
- **2026-09-07** — `add-pipeline-efficiency` implemented (model tiers, context primer, rolling
  handoffs, true-resume corrective passes, context discipline — nested decomposition DEFERRED
  with a measurable revisit trigger); the resumed `add-cgc-session-lifecycle-gate` run (12/16 →
  16/16) completed the measurement: **16/16, `all_done`, zero incidents** (no loops, no runaway,
  no wrong-repo writes — all stability fixes held), quality gates clean (203/203 tests,
  typecheck pass). **Token target MISSED**: ~3.3M total (~825k/task vs the stopped run's
  ~400k/task baseline), 309 tool uses (≈20/agent) dominated by test-run and read outputs; the
  20.7 h wall clock is machine sleep + provider latency, not compute.
- **2026-09-07** — `openspec-campaign` pilot PASSED — the last family member proven: 2 items via
  args, serial scaffolds, one-level plan fan-out (both proposals `ok`), mutation-rights
  discipline held across the fan-out (authors refused `.openspec.yaml` and flagged `skip_specs`
  for the host), `CAMPAIGN.md` digest composed with no apply/archive instructions. 7 agents,
  ~572k tokens, ~3.8 min. All four family members integration-proven; the first production run
  (`add-cgc-session-lifecycle-gate`, 16 tasks) launched in `pi-codegraphcontext`.
- **2026-09-06** — step 5 implemented + measured pilots PASSED: `apply-ready` loop on
  `add-pilot-note` (5 agents, ~246k tokens, ~116 s, planning_complete true — bounded; the first
  attempt ran away at 79 agents on an author-returned skip that never settles in status, fixed
  by skipSettled + maxIterations); `openspec-apply-change` on the same change (8 agents,
  ~406k→~297k tokens, all_done, 2/2 checkboxes marked by the SEPARATE verifier). Two live
  defects caught and fixed: a schema'd QA child looping forever on successful StructuredOutput
  calls (QA is now unschemad + gate-based), and task work landing in the wrong repository via
  relative paths (implementer/verifier prompts now pin the absolute repo root from the CLI's
  change_dir).
- **2026-09-06** — openspec family added (ADR-0001): `openspec-validate-change` dry-run on
  `add-cgc-agent-guide`; apply-pipelines and a campaign orchestrator gated behind measured pilots.
- **2026-09-02** — initial genericization from the 54-plugin context-optimization sweep
  (eval/verify/gate/skip-if-exists/tool-discipline hardened prompts; digest+compose synthesis);
  discovered pi-subagents resolver skips symlinked workflows in `.pi/workflows/` — switched the
  skillshare extra to copy mode; by-name invocation then resolved correctly. 2-plugin smoke test
  via by-name + object args; args-as-string pass; drift check — see session log.