## Context

The first production run of `openspec-apply-change` consumed ~4.8M tokens for 12 of 16 tasks (~400k/task) and was stopped for cost. Breakdown: cold-start redundancy (every fresh agent re-read `design.md` ~10–15k + specs + tasks + growing source, ×~30 dispatches ≈ 800k–1M), implementer bodies (~200–250k × 12 ≈ 2.4–3M), verifiers (independent re-reads by design, ~100–150k × 12 ≈ 1.2–1.8M), and CLI re-queries (~300–500k). Two independent levers apply: pay less per token (model tiers) and dispatch fewer redundant tokens (primer + rolling handoffs + context-preserving resumes).

Engine facts this design builds on (all verified this session): workflow `agent()` opts are a closed set (no `inherit_context`, no `max_turns`); `gate` cannot combine with `resume`; a resumed child predates `StructuredOutput` (returns text); a schema'd child was observed looping forever on *successful* StructuredOutput calls (the QA incident — QA is now gate-based); and workflow children resolve relative paths against the session cwd (absolute repo-root pinning is already in place).

## Goals / Non-Goals

**Goals:** model tiers (args-configurable, flash defaults); one-shot context primer; rolling handoffs; context-preserving corrective resumes; prompt-level context discipline with an explicit trust boundary. All behavior-preserving: same tasks, same verifier separation, same host authority, same CLI-as-truth.

**Non-Goals:**
- **Nested sub-agent decomposition + `steer_subagent` — DEFERRED (D6).**
- MemPalace / user-scope memory for task coordination: wrong scope (cross-project, human-scale) and nondeterministic; the script-level handoff is run-scoped and deterministic.
- `inherit_context`: not available on workflow `agent()`, and semantically wrong — forking a conversation multiplies context instead of distilling it.
- pi-subagents native project memory: nondeterministic and unbounded; considered as a cross-run conventions store and rejected for now (the host can pass `priorLearnings` explicitly per run).
- Changing the verifier's independence, the evidence contract, or the archive/update prohibition.

## Decisions

**D1 — Model tiers are args with flash defaults.** `implementerModel` (default `deepseek/deepseek-v4-flash-0731`, effort `high`), `verifierModel` (default `qwen/qwen3.8-flash`, effort `medium`), `utilityModel` (default `qwen/qwen3.8-flash`, effort `low` for status/load/escalate, `medium` for QA-style checks), `authorModel` (plan-change, default `qwen/qwen3.8-flash`, effort `high`). Implementation here is spec-following; flash-tier models follow specs well, and the verifier's evidence contract plus host review remain the quality gates. Alternative considered — pro-tier everywhere: rejected on cost with no measured quality benefit for spec-following tasks; the args allow per-run promotion for genuinely hard tasks.

**D2 — One primer per run, produced in Load.** After the apply snapshot, one primer agent (utility tier, effort `medium`) reads `design.md` + the capability specs + the instruction excerpt and returns a ≤1,500-token distillation: decisions, component map, conventions, file layout, gotchas. The primer is injected into every implementer and verifier prompt. Trust boundary stated verbatim in each prompt: the primer is guidance — re-read the file when the answer matters; files and the CLI are the truth. Alternative — injecting the full design into every prompt: rejected, that is the current 4.8M problem.

**D3 — Rolling handoffs, script-held.** `TASK_RESULT` and `VERIFY_RESULT` gain `handoff` (string, ≤200 words). The script keeps the last 2–3 handoffs (attributed: implementer/verifier, task id) and injects them into subsequent prompts, truncating at the cap. Deterministic, run-scoped, dies with the run — no persistence, no memory pollution. Alternative — file-based inheritance buffers: rejected (extra writes, stale-content risk, cleanup burden); alternative — engine memory: rejected above.

**D4 — Corrective implementer passes use true `resume`.** On escalation `ok`, the pipeline re-invokes with `{label: 'implement:<task>', resume: 'implement:<task>'}` — the child keeps everything it learned (files read, edits made) and is told the host's decisions. Engine constraints honored: no `schema`/`gate`/`effort`/`model` on the resumed call; its output is TEXT (the resumed child predates `StructuredOutput`) and is routed to the independent fresh verifier — the verifier's evidence contract is what makes the resumed work trustworthy. Alternative — fresh spawn with the decisions: rejected, it re-pays the child's whole context (the current cost sink).

**D5 — Context discipline with an explicit trust boundary.** Every implementer/verifier prompt carries: "CONTEXT DISCIPLINE: the PRIMER and RECENT HANDOFFS summarize prior decisions and work — consult them FIRST; re-read design/spec sections ONLY when the primer is insufficient for your assigned task. They are guidance: files and the CLI are the truth." The boundary is load-bearing: the primer must never become a source of authority over the files (the false-positive lesson from the first pilot's verifier).

**D6 — DEFERRED: nested sub-agent decomposition + `steer_subagent`.** The mechanism (an implementer spawning its own scoped children for sub-steps, with roll-up and mid-turn steering) is recorded as deferred. **Revisit trigger:** when measured runs show individual implementation tasks exceeding the implementer's context budget — concretely, tasks touching more than ~5 files, or implementer context overflow/failure attributed to context exhaustion. Until then, the two-level structure (pipeline → implementer/verifier) is the right complexity. The deferral was reviewed against ADR-0001 (one-level composition is the family norm; nesting is an opt-in engine capability) and ADR-0002 (verifier separation is unaffected — nested children roll up to the implementer, and the verifier stays external).

## Risks / Trade-offs

- [Handoff/primer staleness poisons later agents] → Trust boundary stated verbatim in every prompt (guidance, never authority); evidence contracts still require reading real files; cap prevents sprawl.
- [Flash-tier quality regression on hard tasks] → Verifier evidence contract + host review remain the gates; args allow per-run model promotion; measured pilots record quality alongside cost.
- [Primer agent produces a bad distillation] → Primer schema requires the design's decision headings be represented; the first implementer's handoff flags primer gaps (its prompt asks: "was anything missing from the primer?").
- [Resume semantics change agent behavior] → Resumed output is text and goes through the same independent verifier; the engine guarantees the child keeps its context (gated-fix.js pattern, engine-documented).
- [Nested decomposition deferred too long] → The revisit trigger is measurable (context overflow attribution); it is recorded in the ADR and this design.

## Migration Plan

1. `openspec-apply-change.js`: args + primer agent + schema extensions + resume + prompt lines (tasks 1.1–1.5).
2. `openspec-plan-change.js`: model tiers + context-discipline line (task 2.x).
3. README args contracts + history; ADR-0002 deferred-mechanism note (task 3.x).
4. Gates: syntax + prek (task 4.x); strict validate (task 5.x).
5. The next production run (resuming add-cgc-session-lifecycle-gate at 12/16) is the measured validation: same change, same remaining tasks, flash-tier agents + primer + handoffs — token count compared against the stopped run's 4.8M.

## Open Questions

- Flash model choice per provider may need tuning after the first measured resume run (deepseek-flash vs qwen-flash for implementer quality) — decide on pilot evidence, not preference.
- Whether the primer should also cover the *previous* change's learnings in multi-change production runs — deferred to the host's `priorLearnings` arg (kept out of scope here).
