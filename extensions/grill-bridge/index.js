// grill-bridge — a pi extension that lets sub-agent sessions ask the human
// user questions through the main session's UI.
//
// Design (docs/adr/ADR-0001-*.md): pi-subagents spawns sub-agent sessions in
// the SAME process as the main session, and every session activates this
// extension, so all instances share one in-process pi.events bus. An agent
// session calls the `ask_user` tool; the request travels over the bus to the
// instance that owns the host claim (the main session — it always starts
// first), which renders the questions as ctx.ui dialogs and emits the answers
// back. `needs_input`-style structured returns remain the fallback when no
// host is armed, on timeout, or on cancellation — workflows degrade
// gracefully in headless runs (ctx.hasUI false in print/JSON mode).
//
// This file is loaded by pi's jiti loader; plain ESM JavaScript, no build
// step. The only dependency is typebox (from the repo root package.json),
// used for the tool's parameter schema.

import { Type } from 'typebox'

const NS = 'grill-bridge'
const REQUEST = `${NS}:request`
const RESPONSE = `${NS}:response`
// Cross-instance host claim. Symbol.for keeps it shared across jiti module
// instances of this file within the one pi process.
const HOST_CLAIM = Symbol.for(`${NS}:host-claim`)

const DEFAULT_TIMEOUT_MS = 300_000 // overall budget for one ask_user call
const DIALOG_TIMEOUT_MS = 180_000 // per-question dialog budget
let requestCounter = 0

function sessionRef(ctx) {
  try {
    const file = ctx?.sessionManager?.getSessionFile?.()
    return file || `ephemeral-${process.pid}-${requestCounter}`
  } catch {
    return `unknown-${process.pid}`
  }
}

function hostSessionId() {
  return globalThis[HOST_CLAIM]?.sessionId ?? null
}

function dialogTimeoutFor(request) {
  return Math.max(5_000, Math.min(DIALOG_TIMEOUT_MS, request.dialogTimeoutMs ?? DIALOG_TIMEOUT_MS))
}

// Render one batch of questions as dialogs. Returns {status, answers}.
// `undefined` from a dialog means timeout or dismissal.
async function runDialogs(questions, ctx, dialogTimeoutMs) {
  const answers = []
  for (const q of questions) {
    let answer
    if (Array.isArray(q.options) && q.options.length > 0) {
      answer = await ctx.ui.select(q.question ?? 'Choose one:', q.options.map(String), { timeout: dialogTimeoutMs })
    } else {
      answer = await ctx.ui.input(q.question ?? 'Answer:', q.placeholder ?? 'type your answer…', { timeout: dialogTimeoutMs })
    }
    if (answer === undefined) {
      return { status: 'timeout-or-cancelled', answers }
    }
    answers.push({ question: q.question, answer })
  }
  return { status: 'ok', answers }
}

export default function (pi) {
  const state = {
    sessionId: null,
    ctx: null,
    queue: Promise.resolve(), // host-side serial dialog queue (one dialog at a time)
    listeners: [], // bus listeners owned by this instance, removed on shutdown
  }

  const bus = pi.events
  const on = (event, handler) => {
    bus.on(event, handler)
    state.listeners.push({ event, handler })
  }
  const off = (event, handler) => {
    if (typeof bus.off === 'function') bus.off(event, handler)
    else if (typeof bus.removeListener === 'function') bus.removeListener(event, handler)
  }

  function claimHostIfFree() {
    if (!globalThis[HOST_CLAIM]) {
      globalThis[HOST_CLAIM] = { sessionId: state.sessionId, pid: process.pid }
    }
  }

  function releaseHostIfMine() {
    const claim = globalThis[HOST_CLAIM]
    if (claim && claim.sessionId === state.sessionId && claim.pid === process.pid) {
      delete globalThis[HOST_CLAIM]
    }
  }

  pi.on('session_start', (_event, ctx) => {
    state.sessionId = sessionRef(ctx)
    state.ctx = ctx
    // The main session always runs session_start before any sub-agent session
    // can exist, so first claim wins = main session hosts.
    claimHostIfFree()
  })

  pi.on('session_shutdown', () => {
    releaseHostIfMine()
    for (const l of state.listeners) off(l.event, l.handler)
    state.listeners = []
    state.ctx = null
  })

  // Host side: every instance hears requests; only the claim owner acts, and
  // it serializes dialogs so concurrent askers queue instead of interleaving.
  on(REQUEST, (request) => {
    if (!request || hostSessionId() !== state.sessionId) return
    state.queue = state.queue
      .then(async () => {
        const ctx = state.ctx
        if (!ctx || !ctx.hasUI) {
          bus.emit(RESPONSE, { requestId: request.requestId, status: 'no-host', answers: [] })
          return
        }
        const result = await runDialogs(request.questions ?? [], ctx, dialogTimeoutFor(request))
        bus.emit(RESPONSE, { requestId: request.requestId, ...result })
      })
      .catch((err) => {
        bus.emit(RESPONSE, {
          requestId: request.requestId,
          status: 'error',
          answers: [],
          error: String(err?.message ?? err),
        })
      })
  })

  // Agent side: the tool the LLM calls.
  pi.registerTool({
    name: 'ask_user',
    label: 'Ask the user (grill bridge)',
    description:
      "Ask the human user one or more questions and wait for their answers. The questions are relayed to the main session's UI by the grill-bridge extension; batch related questions into one call. Use this for genuine ambiguities that would materially change what you produce — never for information you can obtain from files or the openspec CLI. Returns {\"status\": \"ok\"|\"timeout-or-cancelled\"|\"timeout\"|\"cancelled\"|\"no-host\"|\"error\", \"answers\": [{\"question\", \"answer\"}], \"note\"?}.",
    promptSnippet: 'ask_user relays questions to the human user via the main session and waits for answers',
    promptGuidelines: [
      'Use ask_user when a requirement is ambiguous and the answer would materially change your output; batch all questions into a single call and keep each question answerable in one line.',
    ],
    parameters: Type.Object({
      questions: Type.Array(
        Type.Object({
          question: Type.String(),
          options: Type.Optional(Type.Array(Type.String())),
          placeholder: Type.Optional(Type.String()),
        }),
        { minItems: 1 },
      ),
      timeoutMs: Type.Optional(Type.Number()),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const questions = params?.questions ?? []
      const timeoutMs = Math.max(5_000, params?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
      const dialogTimeoutMs = Math.max(5_000, Math.min(DIALOG_TIMEOUT_MS, timeoutMs))

      const noHost = {
        status: 'no-host',
        answers: [],
        note: 'No main session has the grill bridge armed (headless run, or host session gone). Fall back to a structured needs_input return instead of guessing.',
      }

      // This instance IS the host (the main session's own model called the
      // tool): answer locally instead of looping through the bus.
      if (hostSessionId() === state.sessionId && state.ctx?.hasUI) {
        return { content: [{ type: 'text', text: JSON.stringify(await runDialogs(questions, state.ctx, dialogTimeoutMs)) }] }
      }

      // No armed host at all (headless run, or the host session is gone).
      if (!hostSessionId() || hostSessionId() === state.sessionId) {
        return { content: [{ type: 'text', text: JSON.stringify(noHost) }] }
      }

      // Relay to the host instance over the shared bus.
      const requestId = `${NS}:${process.pid}:${requestCounter++}`
      const result = await new Promise((resolve) => {
        const cleanup = () => {
          clearTimeout(timer)
          if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort)
          off(RESPONSE, onResponse)
        }
        const finish = (value) => {
          cleanup()
          resolve(value)
        }
        const timer = setTimeout(() => {
          finish({
            status: 'timeout',
            answers: [],
            note: `The user did not answer within ${Math.round(timeoutMs / 1000)}s. Fall back to a structured needs_input return instead of guessing.`,
          })
        }, timeoutMs)
        const onAbort = () => finish({ status: 'cancelled', answers: [], note: 'Tool call aborted.' })
        const onResponse = (response) => {
          if (!response || response.requestId !== requestId) return
          finish(response)
        }
        if (signal) {
          if (signal.aborted) return finish({ status: 'cancelled', answers: [], note: 'Tool call aborted.' })
          if (typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort)
        }
        bus.on(RESPONSE, onResponse)
        bus.emit(REQUEST, {
          requestId,
          questions,
          dialogTimeoutMs,
          from: sessionRef(ctx),
        })
      })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    },
  })
}
