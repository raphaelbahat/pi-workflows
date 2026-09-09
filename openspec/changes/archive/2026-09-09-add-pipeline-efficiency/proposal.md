## Why

The first production run of `openspec-apply-change` (add-cgc-session-lifecycle-gate, 12 of 16 tasks) consumed ~4.8M tokens (~400k/task) before being stopped for cost. The breakdown: every fresh agent re-read `design.md` + specs + growing source (~25–35k just to begin, ×~30 dispatches), implementer bodies dominated (~200–250k each), verifiers independently re-read by design, and per-token prices were pro-tier. All of that is addressable: implementation here is spec-following, not research, and most re-reads are redundant with what prior agents already learned.

## What Changes

- **Model tiers (args-configurable, flash defaults)**: implementer = `deepseek/deepseek-v4-flash-0731` @ effort `high`; verifier = `qwen/qwen3.8-flash` @ `medium`; utility agents (status/load/discover/escalate/QA) = `qwen/qwen3.8-flash` @ `low`–`medium`. The host can override per run.
- **Context primer**: the Load phase gains one agent that reads `design.md` + specs + the instruction excerpt ONCE and distills a ~1,500-token primer (decisions, component map, conventions, file layout, gotchas) injected into every implementer/verifier prompt.
- **Rolling handoffs**: implementer and verifier structured outputs gain a `handoff` field (≤200 words: what was done, key facts, gotchas, next-task hints); the pipeline rolls the last 2–3 into subsequent prompts.
- **True `resume` for corrective implementer passes**: blocker resumes continue the SAME child (context preserved) instead of cold re-spawns — per the `gated-fix.js` pattern, noting `gate` cannot ride along on a resumed child and the resumed child predates `StructuredOutput` (returns text; the verifier remains the gatekeeper).
- **Context-discipline + trust-boundary prompt lines**: agents are told to prefer the primer/handoffs and re-read files only when truly necessary — with the explicit rule that primer/handoffs are GUIDANCE; files and the CLI remain the truth.
- **Deferred (recorded, not built): nested sub-agent decomposition + `steer_subagent`** — see design D6 for the revisit trigger.

## Capabilities

### New Capabilities

- `pipeline-efficiency`: the model-tier, primer, handoff, resume, and context-discipline mechanisms of the openspec apply/plan pipelines — the cost and context-redundancy contract for all future production runs.

### Modified Capabilities

- (none — `openspec/specs/` has no prior version of these mechanics; everything is introduced as the new `pipeline-efficiency` capability)

## Impact

- **Code — `workflows/openspec/openspec-apply-change.js`**: args, primer agent, schema extensions, resume semantics, prompt updates.
- **Code — `workflows/openspec/openspec-plan-change.js`**: model tiers for author/QA/status/resolve + context-discipline line.
- **Docs — `README.md`**: args contracts + validation history. **ADR — `docs/adr/ADR-0002`**: one-line deferred-mechanism note.
- **Cost**: expected ~15–25× reduction on the per-change cost profile (flash-tier pricing × ~60–70% fewer redundant tokens). Behavior unchanged: same tasks, same verifier separation, same host authority.
