# Workflows — OpenSpec group

Args contracts, runtime disciplines, escalation policy, and model tiers for the OpenSpec
workflow family. See [Development and Maintenance](../development-and-maintenance.md) for the
CI gate, scripts, and distribution mechanics, and the [OpenSpec Index](../openspec-index.md)
for the ADR/spec/change inventory.

## openspec-validate-change

Read-only validation sweep for one OpenSpec change: 4 parallel reviewer dimensions
(completeness / correctness / coherence / unbiased) + strict CLI gate → a
CRITICAL/WARNING/SUGGESTION scorecard report. Reviewers never edit artifacts.

- `change` **(required)** — kebab-case name of an active OpenSpec change
- `repoRoot` — absolute path to the repo holding the change (default: the agents' cwd)
- `reportFile` — scorecard output path (default `.openspec-reports/openspec-validate-report-<change>.md`)
- `verifierModel` / `utilityModel` — model overrides; all child calls are `agentFB`-wrapped (see Model tiers)

## openspec-plan-change

Schema-driven authoring for ONE change: resolve the artifact graph via the CLI, author the
first ready artifact from its template, QA it. Ambiguities go through the checkpoint-bridge
`ask_user_via_host` tool; without the bridge the run returns a structured `needs_input`
instead of guessing. Never applies, never archives.

- `change` **(required)** — kebab-case change name
- `mode` — `one` (default: author exactly the first `ready` artifact), `scaffold` (create +
  report first instructions, no write), or `apply-ready` (loop resolve→author→QA until every
  planning artifact is `done`/`skipped`)
- `maxArtifacts` — apply-ready cap per run (default 12); the return names remaining artifacts
  so a later run resumes idempotently
- `authorModel` / `utilityModel` — flash-tier defaults (`qwen/qwen3.8-flash`; author @ `high`,
  utility @ `low`) — promote per run for demanding artifacts; all calls `agentFB`-wrapped
- `intent` — optional host-authored brief for the author agent
- `repoRoot`, `store` — repo root for the CLI; store id appended as `--store`
- Requires the checkpoint-bridge extension: if `ask_user_via_host` is absent, the run returns
  a friendly `checkpoint-bridge-not-installed` error instead of authoring
  (install: `pi install npm:pi-checkpoint-bridge`)

## openspec-apply-change

Per-task implementation pipeline for ONE planning-complete change.

Pipeline: Load (`openspec instructions apply --json` + secret-free `pi --list-models`
discovery, fail-fast on blocked) → per task an **implementer** agent + a separate
**checkbox-verifier** agent (CLI order, re-queried per dispatch) → ONE batched bridge
escalation on the first blocker → Report. The implementer never marks checkboxes; only the
verifier does, and only for its own task (ADR-0002). Never archives/updates.

- `change` **(required)** — kebab-case name of a planning-complete change
- `implementerModel` / `verifierModel` / `utilityModel` — flash-tier defaults (see Model tiers); promote per run
- `onUnansweredEscalation` — `defer` (default) | `fix` — see Escalation policy
- `testGate` / `testCommand` — gated tests must pass before a task reports implemented
  (`testCommand` required when `testGate` is true)
- `repoRoot`, `store` — as above
- `worktree` — optional isolation; every created worktree path is reported for host integration/removal
- Returns `skipped_tasks` (deferred by unanswered escalation) and `next` for the host when applicable
- Requires the checkpoint-bridge extension for escalations

### Context primer

ONE design/spec distillation per run (≤6,000 chars), authored by a dedicated high-effort
primer child and injected inline into every implementer/verifier prompt. Guidance, not
authority — the files and the CLI are the truth. A pointer-misfire guard rejects
path-like/overshort primers (a flash primer once returned a `/tmp` file path instead of the
text, sending implementers into a fetch loop).

### Handoffs

Rolling (last 2–3, kept per-sub-agent) and injected into subsequent prompts. Each handoff is
≤200 words **written FOR THE NEXT SUB-AGENT** — the implementer's names the verifier for this
task then the next task's implementer; the verifier's names the next task's implementer.
Required content: absolute paths touched + what changed in each; decisions and why; gotchas;
current test state; THE one thing the next sub-agent must know first.

### Runtime disciplines (the shared TOOL block, in order)

1. **One tool call per message** — never batch two or more.
2. **3-strike malformed-call cap** — a rejected call is re-issued cleanly at most 3 times, then
   the child returns its best-effort text. (This killed the production loop class: a glm-5.3-flash
   status child re-emitted a degenerate `StructuredOutput` 2,064×.)
3. **SHELL & SEARCH hard rule** — every command via `ctx_shell`, every content search via
   `ctx_grep`, file reads via `ctx_read`/bounded ranges; native `bash`/`grep`/whole-file `read`
   only when the ctx tool is not found, and the child MUST say so in its final summary.
4. **CTX timing note** — a `not found` ctx tool may be pre-registration (the lean-ctx bridge
   connects asynchronously); use the native fallback and retry the ctx tool after a few turns.
5. **One final answer** — `StructuredOutput` exactly once when available, else plain text
   (raw JSON is fine).

Token-economy disciplines layered on top: task-scoped test runs (`ctx_shell bun test <touched
test file>` first; the full suite once), grep-anchored verifier reads (whole-file reads only
under ~150 lines), and un-schema'd text verdicts parsed by `parseAgentJson` (the QA pattern —
a schema'd child once looped 2,064× on degenerate `StructuredOutput` calls).

## openspec-campaign

Campaign orchestrator for N independent changes: serial `openspec new change` scaffolding
(global-mutating, never parallelized), one-level `workflow('openspec-plan-change')` fan-out
(proposals-only default), per-item outcome tracking, `CAMPAIGN.md` digest. Never
applies/archives/updates.

- `items` — optional array of change names or `{change, intent}` records; omitted → discovery
  via `openspec list`
- `planMode` — `one` (default, proposals-only) or `scaffold`
- `repoRoot`, `store` — as above; `digestFile` — digest name (default `CAMPAIGN.md`, repo root)
- Per-item outcomes `ok`/`needs_input`/`failed` with no blanket retries; the digest never
  contains apply/archive/update instructions

## openspec-apply-campaign

Serial apply of ALL unimplemented changes in a host-provided dependency order: per change
runs `workflow('openspec-apply-change')` (idempotent — checkboxes are the state), fail-soft
per change (one blocked change does not stop the campaign), host-handoff digest. No commits,
no archive — the host reviews, commits, and archives after the digest.

- `changes` **(required)** — array of change names in dependency order
- `repoRoot` — absolute path to the repo holding the changes
- `onUnansweredEscalation` — `defer` | `fix` — forwarded to every per-change apply run
- Digest returns per-change `state`, `tasks_done/total`, `needs_input`, and host-only next steps

## Escalation policy (`openspec-apply-change`)

- ONE batched `ask_user_via_host` on the first blocker; any bridge status **carrying answers**
  is actionable (`fix_guidance` with answers counts — statuses are taken verbatim from the bridge).
- `onUnansweredEscalation` (host-configurable, campaign-forwarded):
  - `defer` (default) — the task goes to `skipped_tasks`, the loop continues, the final report
    lists deferred tasks for the host (`host-complete-skipped-tasks-then-archive`).
  - `fix` — ONE bounded self-guided fix round per task: the implementer resumes with best
    judgment (strict task scope, no specs/tasks.md edits), then a FRESH verifier re-gates the
    checkbox. Still failing → deferred. `selfFixRounds` hard-bounds one round per task.
- The implementer never marks checkboxes; the CLI checkbox state re-queried per dispatch is
  the only truth (ADR-0002).

## Model tiers + cross-provider fallback (ADR-0003)

| Role | Primary (host-overridable) | Effort | Fallback chain |
|---|---|---|---|
| implementer | `deepseek/deepseek-v4.1-flash` | high | `qwen3.8-flash` → `glm-5.3-flash` |
| verifier | `qwen/qwen3.8-flash` | medium | `deepseek-v4-flash` → `glm-5.3-flash` |
| utility (load/primer/status/final) | `qwen/qwen3.8-flash` | low–medium | `deepseek-v4-flash` → `glm-5.3-flash` |
| author (plan) | `qwen/qwen3.8-flash` | high | same chain logic |

`agentFB` wraps every child `agent()` call: when the primary resolves to `null` (terminal
provider error — pi-subagents already retried transient failures internally, e.g. OpenRouter
shared-pool `429`), the SAME call is retried down the chain, each hop logged as
`fallback hop: agent "<label>" returned null on <model> — retrying on: <next>`. Fallback hops
drop `resume`/`gate` (fresh child; prompts are self-contained by construction).


**Retry pause (ADR-0004, `add-fallback-retry-pause`)**: before the first fallback hop,
`agentFB` spends ONE bounded pause — a minimal utility-model "pause child" whose `gate` runs
`sleep <seconds> && true` (`args.retryPauseMs`, default `45000`, `0` disables; deterministic,
no jitter) — then retries the PRIMARY exactly once, and only then enters the chain. Best-effort:
a failed pause child never blocks; log line: `retry pause: <ms>ms before retrying/fallback`.

Run-time discovery (secret-free, LAZY): discovery fires ONCE per run, at the first terminal
fallback need — a combined "pause + discovery" child runs `pi --list-models` and caches the
configured provider/model table (`AUTHENTICATED_MODELS`); `agentFB` filters chains to it.
Never eager at Load (eager discovery made Load children probe the CLI 2–6× per run and ingest
~30 KB of model table on error-free runs). NEVER `auth.json`/`models.json` — they contain user secrets. The
programmatic canonical APIs (SDK `modelRuntime.getAvailable()`, RPC `get_available_models`)
are documented in the pi repo but unreachable from the workflow sandbox — the CLI table is the
workflow-grade surface. Absent discovery is logged and non-blocking; unknown host primaries
get the default chain minus the primary.