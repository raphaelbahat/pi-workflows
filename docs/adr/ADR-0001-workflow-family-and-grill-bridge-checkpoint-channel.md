# ADR-0001: Workflow family with a grill-bridge checkpoint channel for OpenSpec integration

## Status

Accepted (2026-09-06). Supersedes the earlier "needs_input digests only" checkpoint plan from the same campaign's deliberation.

## Context

This repository holds pi-subagents workflow scripts for the Pi coding agent. A planning campaign investigated orchestrating OpenSpec's life cycle with the `SubagentWorkflow` tool and produced, besides a four-model sub-agent analysis, one decisive lived datum: a 10-change OpenSpec campaign run manually in a single session proved that read-only validation sweeps parallelize well (12 validator sub-agents, 5 real corrections caught) while main-session context growth was the primary cost.

Two structural facts constrain any integration:

1. OpenSpec's life cycle is checkpoint-shaped. Recipes interview the user (grill rounds), `apply` pauses on blockers, `archive` requires confirmations and must run its delta-spec sync inline before moving the change root. Sub-agents cannot ask the user questions, and `agent()` returns `null` for both failure and user skip — a workflow structurally cannot conduct an interview by itself.
2. Pi exposes programmatic surfaces that make the constraint optional rather than absolute. Extensions share an in-process `pi.events` bus across the main session and its sub-agent sessions (pi-subagents `docs/rpc.md`); extensions can request user interaction through `ctx.ui.select()/confirm()/input()/editor()`, which translate to the blocking Extension UI Protocol in RPC mode (pi `packages/coding-agent/docs/rpc.md`); and the SDK exposes equivalent session embedding with a shared event bus.

## Decision

1. **A family of small phase-shaped workflows, composed one level deep — not one mega-workflow, not per-recipe wrappers, not per-schema forks.** Workflows drive OpenSpec's machine contract (`openspec status --json` / `instructions --json`) so they stay schema-agnostic. The host session permanently owns user interviews, `archive` (including its inline delta-spec sync), and final approvals. The first member is `openspec-validate-change`, a read-only sweep; `openspec-plan-change`, `openspec-apply-change`, and an `openspec-campaign` orchestrator follow only behind measured pilots.
2. **The checkpoint channel is a `grill-bridge` pi extension.** Sub-agent sessions call an `ask_user` tool; the bridge relays the questions over the in-process `pi.events` bus to the main session's `ctx.ui` dialogs and returns the answers as the tool result, so a grill round happens inside the workflow where OpenSpec's skills expect it. Structured `needs_input` returns remain the fallback when no host session is armed, on dialog timeout or cancellation, and in headless runs.
3. **Scope discipline.** Workflow agents expose the bridge narrowly through agent frontmatter (`extensions: [grill-bridge]`); ordinary agents do not gain a user-facing channel by accident.

## Consequences

- **Easier:** grill rounds preserve the human's scope authority inside workflows; validation sweeps and mechanical fix loops leave the main session's context; the family degrades gracefully (timeout/cancel → `needs_input`) in headless runs; the same bridge design works unchanged if a session is later hosted under `pi --mode rpc` or the SDK, because `ctx.ui` dialogs translate to the Extension UI Protocol.
- **Harder:** a new extension surface to maintain — host-claim lifecycle across session start/shutdown, serial dialog queueing when several sub-agent sessions ask at once, and timeout budgets. A pending dialog blocks that agent's `agent()` call, bounded by timeouts. Concurrent askers queue serially at the host, so workflows should batch questions into one `ask_user` call.
- **Follow-ups:** prototype the bridge before workflow adoption (this repository, `extensions/grill-bridge/`); gate each additional workflow on a measured pilot against the archived 10-change campaign; revisit RPC-mode hosting when embedding into IDE/UI clients.

## Alternatives considered

- **`needs_input` digests only** (the superseded plan): correct and simple, but every ambiguity costs a full workflow round-trip, interview load concentrates away from the point of need, and blocked stages resume through journal replays. Retained as the fallback, not the channel.
- **RPC-subprocess relay between separate pi processes**: rejected for the interactive TUI case — the main session and its sub-agents already share one process and one bus, so subprocess plumbing adds failure modes without adding capability. RPC mode remains the path for future external embeddings.
- **One mega-workflow / per-recipe wrappers / per-schema forks / a generic artifact-graph walker**: rejected in the campaign's deliberation — they swallow OpenSpec's deliberately unequal checkpoint semantics, hard-code `--yes`, or rot on the first custom schema.

## Amendment (2026-09-06, post-implementation)

Live integration testing corrected one design assumption: `pi.events` is **session-scoped in practice**. A request emitted on a sub-agent session's bus never reached the main session's listener (attempts 1–2: tool timeout with no host reply and no TUI change), while the `globalThis` host claim demonstrably crossed sessions in the same process. The shipped relay therefore uses a **process-global bus** — a `Symbol.for("grill-bridge:bus")` EventEmitter on `globalThis`, the same mechanism as the claim — plus a fire-and-forget `ctx.ui.notify` receipt so request arrival is observable independently of dialog rendering.

Attempt 3 then proved the full channel end-to-end in a real pi 0.85.1 process: sub-agent `ask_user` call → global-bus relay → main-session TUI dialog → human answer → tool result `{"status":"ok","answers":[...]}` in ~17 s. Headless `pi -p` separately confirmed the `no-host` fallback. All other decision content stands unchanged.
