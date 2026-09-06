# grill-bridge

A pi extension that lets sub-agent sessions ask the human user questions
through the main session's UI — the checkpoint channel from
[ADR-0001](../../docs/adr/ADR-0001-workflow-family-and-grill-bridge-checkpoint-channel.md).

## How it works

pi-subagents spawns sub-agent sessions in the **same process** as the main
session, and every session activates this extension, so all instances share
one in-process `pi.events` bus.

1. On `session_start` each instance tries to claim the host role via a
   `globalThis` symbol. The main session always starts first, so **first claim
   wins = main session hosts**.
2. A sub-agent calls the `ask_user` tool with a batch of questions.
3. The agent instance emits `grill-bridge:request` on the bus.
4. The host instance renders each question as a `ctx.ui.select` (when options
   are given) or `ctx.ui.input` dialog — one dialog at a time (requests queue
   serially so concurrent askers never interleave).
5. Answers return as `grill-bridge:response` and become the tool result.

Timeouts: per-question dialogs auto-dismiss after 180s (or the call's remaining
budget); the whole call defaults to a 300s budget.

## Fallback contract

`ask_user` never throws for environmental reasons. It returns a structured
result the caller can branch on:

| status | meaning | expected caller behavior |
|---|---|---|
| `ok` | user answered every question | proceed |
| `timeout-or-cancelled` | user dismissed a dialog (or it timed out) | proceed with answers so far, or fall back to needs_input |
| `timeout` | call budget expired | fall back to `needs_input` |
| `cancelled` | tool call aborted | stop gracefully |
| `no-host` | no main session armed (headless/print mode) | fall back to `needs_input` |
| `error` | host-side dialog failure | fall back to `needs_input` |

Workflows should treat every non-`ok` status as *"produce a structured
`needs_input` return instead of guessing."*

In RPC mode the host's `ctx.ui` dialogs translate to the Extension UI Protocol
(`extension_ui_request` / `extension_ui_response`), so the same design serves
IDE/UI embeddings without changes.

## Scope discipline

Do not expose `ask_user` to every agent. In custom agent frontmatter, load the
extension narrowly:

```yaml
extensions: [grill-bridge]
```

`extensions: [grill-bridge]` arms the relay; add `tools: "*, ext:grill-bridge"`
in agents that should be able to *call* `ask_user`.

## Smoke test

```bash
node extensions/grill-bridge/smoke.mjs
```

Runs three in-process scenarios (hosted relay, local-host call, no-host
fallback) against a mocked bus and UI — no pi process needed.
