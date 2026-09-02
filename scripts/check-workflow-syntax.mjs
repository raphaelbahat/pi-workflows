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
// This gate reproduces the engine's shape for validation only: strip
// line-leading `export ` keywords, wrap the body in `(async () => { ... })()`,
// and run `node --check` on the wrapped source. The scripts themselves are
// never modified.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: check-workflow-syntax.mjs <file.js> ...')
  process.exit(2)
}

const tmp = mkdtempSync(join(tmpdir(), 'pi-workflow-check-'))
let failed = false
try {
  for (const file of files) {
    const src = readFileSync(file, 'utf8').replace(/^export\s+/gm, '')
    const wrapped = `(async () => {\n${src}\n})();\n`
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
