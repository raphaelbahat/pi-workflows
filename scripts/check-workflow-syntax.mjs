#!/usr/bin/env node
// Syntax gate for pi-subagents workflow scripts.
//
// These scripts are NOT plain Node modules: pi-subagents compiles them as an
// async arrow body — `new vm.Script("(async () => {\n" + script + "\n})()")`
// (pi-subagents scripted-workflow.ts) — so a top-level `return` and top-level
// `await` are legal, while the `export const meta = {...}` header is loader
// metadata stripped before compilation. Plain `node --check` therefore always
// rejects them ("Illegal return statement").
//
// This gate reproduces the engine's actual validation: meta extraction and
// pure-literal checks are ported from the upstream resolver (tintinweb/
// pi-subagents src/workflow/meta.ts, MIT — see scripts/lib/workflow-meta.mjs
// for the full attribution), and the body-shape check wraps the extracted body
// in `(async () => { ... })()` and runs `node --check` on it, mirroring the
// engine's `new vm.Script("(async () => {\n" + script + "\n})()")` compilation.
// The scripts themselves are never modified.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { extractMeta, WorkflowMetaError } from './lib/workflow-meta.mjs'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: check-workflow-syntax.mjs <file.js> ...')
  process.exit(2)
}

const tmp = mkdtempSync(join(tmpdir(), 'pi-workflow-check-'))
let failed = false
try {
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    let body
    try {
      // Upstream resolver semantics: meta must exist, be a pure literal
      // (evaluated in an empty node:vm context with a 100ms bound), and carry
      // the required fields. Throws WorkflowMetaError with author-facing text.
      ;({ body } = extractMeta(src))
    } catch (error) {
      failed = true
      console.error(`FAIL ${file}`)
      console.error(error instanceof WorkflowMetaError ? error.message : error)
      continue
    }
    const wrapped = `(async () => {\n${body}\n})();\n`
    const out = join(tmp, file.replace(/[^\w.-]/g, '_') + '.mjs')
    writeFileSync(out, wrapped)
    const r = spawnSync(process.execPath, ['--check', out], { encoding: 'utf8' })
    if (r.status !== 0) {
      failed = true
      console.error(`FAIL ${file}`)
      if (r.stderr) process.stderr.write(r.stderr)
    } else {
      console.log(`OK   ${file}`)
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
