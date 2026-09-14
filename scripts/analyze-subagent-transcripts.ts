#!/usr/bin/env bun
// analyze-subagent-transcripts.ts — deterministic diagnostics for pi workflow runs.
//
// Usage (via Optique):
//   bun scripts/analyze-subagent-transcripts.ts [SESSIONS_DIR]
//        [--days N] [--top N] [--last-n N] [--range A..B]
//        [--json | --plain]            (default: pretty — tables + charts)
//
// A "workflow run" = one `wf_*.workflow.jsonl` journal under
// /tmp/pi-subagents-1000/**/tasks/; its sub-agent children = sidechain session
// files created within (prev run end, this run end]. Role per child is
// classified from the FIRST user prompt (implementer / verifier / status /
// load / primer / final / escalate / selffix / reverify / pause-discovery /
// gate / reviewer / compose / snapshot / resolve / other — main-session files
// carry no workflow signature and are excluded).

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { argument, option } from "@optique/core/primitives";
import { object } from "@optique/core/constructs";
import { optional } from "@optique/core/modifiers";
import { string, integer } from "@optique/core/valueparser";
import { message } from "@optique/core/message";
import { run } from "@optique/run";
import { Table } from "console-table-printer";
import { chart, renderToAnsi } from "@crafter/charts";

interface CliOptions {
  sessionsDir?: string;
  days: number;
  top: number;
  lastN?: number;
  range?: readonly [number, number];
  json: boolean;
  plain: boolean;
}

const cli = object(
  {
    sessionsDir: optional(argument(string({ metavar: "SESSIONS_DIR", description: message`pi sessions directory (default: this project's dir under ~/.pi/agent/sessions, else the most recently active one)` }))),
    days: optional(option("--days", integer({ metavar: "N", description: message`only runs whose journals were modified within the last N days` }), { description: message`lookback window in days (default: 14)` })),
    top: optional(option("--top", integer({ metavar: "N" }), { description: message`rows in the "top children by tokens" table — the largest consumers / loop suspects (default: 10)` })),
    lastN: optional(option("--last-n", integer({ metavar: "N" }), { description: message`process only the N most recent workflow runs, newest first (default: all runs in the lookback window)` })),
    range: optional(option("--range", string({ metavar: "A..B", description: message`1-based inclusive ordinal slice of the newest-first run list, e.g. 2..4` }), { description: message`slice of recent runs (applied after --last-n)` })),
    json: option("--json", { description: message`machine-readable JSON report (for agents/programmatic use)` }),
    plain: option("--plain", { description: message`plain text report (no tables/charts)` }),
  },
  { description: message`Deterministic diagnostics over pi workflow runs: per-run and per-role token stats (total/avg/min/max/median), tool distribution, loop signatures, ctx_* adoption. Default output: pretty (tables + sparkline charts).` },
);
const opts: CliOptions = run(cli, {
  help: "both",
  description: message`Deterministic diagnostics over pi workflow runs: per-run and per-role token stats (total/avg/min/max/median), tool distribution, loop signatures, and ctx_* adoption. Output modes: default pretty (tables + sparkline charts), --plain (text), --json (programmatic).`,
  examples: message`bun scripts/analyze-subagent-transcripts.ts --days 3 --plain
  bun scripts/analyze-subagent-transcripts.ts /home/bahat/.pi/agent/sessions/--home-bahat-projects-pi-codegraphcontext-- --last-n 2
  bun scripts/analyze-subagent-transcripts.ts --last-n 5 --range 1..3 --json`,
}) as CliOptions;
if (opts.days == null) opts.days = 14;
if (opts.top == null) opts.top = 10;
if (opts.range) {
  const m = opts.range.split("..");
  const a = Number(m[0]);
  const b = m.length > 1 ? Number(m[1]) : a;
  if (!Number.isFinite(a) || a < 1 || !Number.isFinite(b) || b < a) {
    console.error(`--range expects A..B with 1 <= A <= B, got: ${opts.range}`);
    process.exit(2);
  }
  opts.range = [a, b] as const;
}

// ── resolve paths ───────────────────────────────────────────────────────────
let dir = opts.sessionsDir;
if (!dir) {
  const base = join(homedir(), ".pi/agent/sessions");
  const slug = "--" + process.cwd().replaceAll("/", "-") + "-";
  dir = join(base, slug);
  if (!existsSync(dir)) {
    // fall back to the project dir with the most recently modified .jsonl
    let best: string | null = null;
    let bestM = -1;
    for (const e of readdirSync(base, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const d = join(base, e.name);
      let m = -1;
      try {
        for (const f of readdirSync(d)) {
          if (f.endsWith(".jsonl")) m = Math.max(m, statSync(join(d, f)).mtimeMs);
        }
      } catch { /* skip unreadable */ }
      if (m > bestM) {
        bestM = m;
        best = d;
      }
    }
    if (best) dir = best;
  }
}
const tmpRoot = join(process.env.TMPDIR || "/tmp", "pi-subagents-1000");

// ── collect workflow run journals (newest first) ────────────────────────────
interface Journal { path: string; mtime: number; id: string }
function findJournals(root: string, out: Journal[]): void {
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(root, e.name);
    if (e.isDirectory()) findJournals(p, out);
    else if (e.name.endsWith(".workflow.jsonl")) {
      out.push({ path: p, mtime: statSync(p).mtimeMs, id: e.name.replace(/\.workflow\.jsonl$/, "") });
    }
  }
}
const journals: Journal[] = [];
findJournals(tmpRoot, journals);
journals.sort((a, b) => b.mtime - a.mtime);
let selected = journals.filter(j => Date.now() - j.mtime <= opts.days * 86_400_000);
if (opts.lastN != null) selected = selected.slice(0, opts.lastN);
if (opts.range) selected = selected.slice(opts.range[0] - 1, opts.range[1]);

// ── collect sidechain child sessions ────────────────────────────────────────
interface Child { path: string; name: string; created: number; tokens: number; calls: Record<string, number>; prompts: string[]; resultBytes: number }
const children: Child[] = [];
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".jsonl")) continue;
  const p = join(dir, f);
  const child: Child = { path: p, name: f, created: 0, tokens: 0, calls: {}, prompts: [], resultBytes: 0 };
  const m = f.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  if (m) child.created = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`);
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let r: { isSidechain?: boolean; parentSession?: string; message?: { role?: string; content?: unknown; usage?: { totalTokens?: number } } };
    try { r = JSON.parse(line); } catch { continue; }
    if (!child.isChildSet) {
      child.isChildSet = true;
      child.isChild = !!r.isSidechain || !!r.parentSession;
    }
    if (!child.isChild) continue;
    const msg = r.message ?? {};
    if (msg.role === "user") {
      const t = typeof msg.content === "string" ? msg.content : (Array.isArray(msg.content) ? (msg.content as Array<{ text?: string }>).map(x => x.text ?? "").join(" ") : "");
      if (t.trim()) child.prompts.push(t);
    }
    if (msg.role === "assistant") {
      child.tokens += msg.usage?.totalTokens ?? 0;
      if (Array.isArray(msg.content)) {
        for (const c of msg.content as Array<{ type?: string; name?: string }>) {
          if (c.type === "toolCall" && c.name) child.calls[c.name] = (child.calls[c.name] ?? 0) + 1;
        }
      }
    }
    if (msg.role === "toolResult") {
      const t = typeof msg.content === "string" ? msg.content : (Array.isArray(msg.content) ? (msg.content as Array<{ text?: string }>).map(x => x.text ?? "").join("\n") : "");
      child.resultBytes += t.length;
    }
  }
  if (child.prompts.length || child.tokens) children.push(child);
}
interface ChildX extends Child { isChild?: boolean; isChildSet?: boolean }

function classifyFirst(first: string): string {
  if (/Assigned task:/.test(first)) return "implementer";
  if (/Verify task /.test(first)) return "verifier";
  if (/Re-run: .*instructions apply/.test(first)) return "status";
  if (/Final apply state/.test(first)) return "final";
  if (/Load the apply state/.test(first)) return "load";
  if (/Produce the CONTEXT PRIMER/.test(first)) return "primer";
  if (/escalation channel for a blocked/.test(first)) return "escalate";
  if (/retry-pause\+discovery|Reply with exactly: paused/.test(first)) return "pause-discovery";
  if (/Run the strict CLI gate/.test(first)) return "gate";
  if (/read-only reviewer dimension/.test(first)) return "reviewer";
  if (/composing a validation scorecard/.test(first)) return "compose";
  if (/Snapshot the OpenSpec change/.test(first)) return "snapshot";
  if (/resolve the artifact graph/.test(first)) return "resolve";
  return "other";
}
function classify(child: ChildX): string {
  // First prompt only: children are dispatched with their role in prompt 1.
  // Main-session files quote workflow phrases in later prompts — first-prompt
  // gating excludes them.
  let role = classifyFirst(child.prompts[0] ?? "");
  const joined = child.prompts.join(" | ");
  if (role === "implementer" && /UNANSWERED/.test(joined)) role = "implementer-selffix";
  if (role === "verifier" && /Re-verify task/.test(joined)) role = "verifier-reverify";
  return role;
}

// ── assign children to runs by time window ──────────────────────────────────
interface Run extends Journal { end: number; start: number; children: ChildX[] }
const runs: Run[] = selected.map((j, i) => ({ ...j, end: j.mtime, start: i + 1 < selected.length ? selected[i + 1].mtime : 0, children: [] }));
const excludedInteractive: ChildX[] = [];
for (const child of children as ChildX[]) {
  if (classify(child) === "other") { excludedInteractive.push(child); continue; }
  const run = runs.find(r => child.created <= r.end + 60000 && (!r.start || child.created > r.start - 60000)) ?? runs[runs.length - 1];
  if (run && child.created <= run.end + 60000) run.children.push(child);
}

// ── stats helpers ───────────────────────────────────────────────────────────
interface Stats { total: number; avg: number; min: number; max: number; median: number; n: number }
function stats(arr: number[]): Stats {
  if (!arr.length) return { total: 0, avg: 0, min: 0, max: 0, median: 0, n: 0 };
  const s = arr.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return {
    total: arr.reduce((a, b) => a + b, 0),
    avg: arr.reduce((a, b) => a + b, 0) / arr.length,
    min: s[0],
    max: s[s.length - 1],
    median: s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2,
    n: arr.length,
  };
}
const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

// ── build the structured report ─────────────────────────────────────────────
interface RoleAgg { role: string; stats: Stats }
interface RunReport { id: string; endedAt: string; children: number; stats: Stats; roles: RoleAgg[] }
interface Report {
  runsProcessed: number; journalsFound: number; childrenClassified: number;
  interactiveExcluded: number; days: number;
  runs: RunReport[];
  roleAggregates: RoleAgg[];
  overall: { tokensPerRun: Stats; tokensPerChild: Stats; grandTotal: number };
  ctxAdoption: { adopted: number; total: number };
  topChildren: Array<{ name: string; role: string; tokens: number }>;
}

const roleAggMap = new Map<string, number[]>();
let grandTotal = 0;
const runReports: RunReport[] = [];
for (const run of runs) {
  const toks = run.children.map(c => c.tokens);
  grandTotal += toks.reduce((a, b) => a + b, 0);
  const byRole = new Map<string, number[]>();
  for (const c of run.children) {
    const role = classify(c);
    (byRole.get(role) ?? byRole.set(role, []).get(role)!).push(c.tokens);
    (roleAggMap.get(role) ?? roleAggMap.set(role, []).get(role)!).push(c.tokens);
  }
  const roles: RoleAgg[] = [...byRole.entries()]
    .map(([role, arr]) => ({ role, stats: stats(arr) }))
    .sort((a, b) => b.stats.total - a.stats.total);
  runReports.push({
    id: run.id, endedAt: new Date(run.end).toISOString(), children: toks.length,
    stats: stats(toks), roles,
  });
}
const roleAggregates: RoleAgg[] = [...roleAggMap.entries()]
  .map(([role, arr]) => ({ role, stats: stats(arr) }))
  .sort((a, b) => b.stats.total - a.stats.total);
const runTotals = runs.map(r => r.children.reduce((a, c) => a + c.tokens, 0));
const report: Report = {
  runsProcessed: runs.length, journalsFound: journals.length,
  childrenClassified: (children as ChildX[]).length, interactiveExcluded: excludedInteractive.length, days: opts.days,
  runs: runReports, roleAggregates,
  overall: { tokensPerRun: stats(runTotals), tokensPerChild: stats((children as ChildX[]).filter(c => classify(c) !== "other").map(c => c.tokens)), grandTotal },
  ctxAdoption: { adopted: (children as ChildX[]).filter(c => Object.keys(c.calls).some(k => k.startsWith("ctx_"))).length, total: (children as ChildX[]).length },
  topChildren: (children as ChildX[])
    .filter(c => classify(c) !== "other")
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, opts.top ?? 10)
    .map(c => ({ name: c.name.slice(11, 24), role: classify(c), tokens: c.tokens })),
};

// ── chart helpers (add-fallback-retry-pause era: numeric x + formatted axes) ─
const compact = (v: number): string => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : String(Math.round(v));
function indexXAxis(labels: string[]) {
  return { format: (v: number): string => labels[Math.round(v)] ?? "" };
}

// ── output modes ────────────────────────────────────────────────────────────
if (opts.json) {
  console.log(JSON.stringify(report, null, 2));
} else if (opts.plain) {
  const L: string[] = [];
  L.push(`# Workflow run diagnostics — ${report.runsProcessed} run(s) (of ${report.journalsFound} journals, last ${opts.days}d)`);
  L.push(`# children: ${report.childrenClassified} (workflow-signatured: ${report.childrenClassified - report.interactiveExcluded}; interactive/main excluded: ${report.interactiveExcluded})`);
  for (const r of report.runs) {
    L.push(`\n## Run ${r.id.slice(0, 18)} — ${r.endedAt} — ${r.children} children, ${fmt(r.stats.total)} tokens`);
    if (!r.children) { L.push("  (no sidechain children found in window)"); continue; }
    L.push(`  tokens/child: total ${fmt(r.stats.total)} | avg ${fmt(r.stats.avg)} | min ${fmt(r.stats.min)} | max ${fmt(r.stats.max)} | median ${fmt(r.stats.median)}`);
    for (const ra of r.roles) L.push(`    ${ra.role.padEnd(22)} n=${String(ra.stats.n).padStart(3)}  total ${fmt(ra.stats.total)} | avg ${fmt(ra.stats.avg)} | median ${fmt(ra.stats.median)}`);
  }
  L.push(`\n## Per-role aggregates`);
  for (const ra of report.roleAggregates) L.push(`  ${ra.role.padEnd(22)} n=${String(ra.stats.n).padStart(3)}  total ${fmt(ra.stats.total)} | avg ${fmt(ra.stats.avg)} | min ${fmt(ra.stats.min)} | max ${fmt(ra.stats.max)} | median ${fmt(ra.stats.median)}`);
  L.push(`\n## Overall`);
  L.push(`  tokens/run: total ${fmt(report.overall.tokensPerRun.total)} | avg ${fmt(report.overall.tokensPerRun.avg)} | min ${fmt(report.overall.tokensPerRun.min)} | max ${fmt(report.overall.tokensPerRun.max)} | median ${fmt(report.overall.tokensPerRun.median)}`);
  L.push(`  grand total: ${fmt(report.overall.grandTotal)} tokens across ${report.overall.tokensPerChild.n} children in ${report.runsProcessed} run(s)`);
  L.push(`\n## Top ${report.topChildren.length} children by tokens (loop/hog suspects)`);
  for (const t of report.topChildren) L.push(`  ${fmt(t.tokens).padStart(12)}  ${t.role.padEnd(20)}  ${t.name}`);
  L.push(`\n## ctx_* adoption: ${report.ctxAdoption.adopted}/${report.ctxAdoption.total}`);
  console.log(L.join("\n"));
} else {
  // ── pretty: tables + charts ───────────────────────────────────────────────
  console.log(`\n\x1b[1m▌ Workflow run diagnostics\x1b[0m — ${report.runsProcessed} run(s), last ${opts.days}d · children ${report.childrenClassified} (interactive excluded: ${report.interactiveExcluded})\n`);

  const runsTable = new Table({ title: "Runs (newest first)", columns: [
    { name: "run", alignment: "left" }, { name: "ended", alignment: "left" },
    { name: "children", alignment: "right" }, { name: "total tokens", alignment: "right" },
    { name: "avg", alignment: "right" }, { name: "median", alignment: "right" },
  ]});
  for (const r of report.runs) {
    runsTable.addRow({ run: r.id.slice(0, 18), ended: r.endedAt.slice(0, 16).replace("T", " "), children: r.children, "total tokens": fmt(r.stats.total), avg: fmt(r.stats.avg), median: fmt(r.stats.median) });
  }
  runsTable.printTable();

  // tokens-per-run bar chart (x = run index, labels via xAxis format; exact values in the table above)
  if (report.runs.length > 1) {
    const ids = report.runs.map(r => r.id.slice(3, 9));
    const rows = report.runs.map((r, i) => ({ x: i, tokens: r.stats.total }));
    const maxY = Math.max(...rows.map(r => r.tokens));
    console.log("\n\x1b[1mtokens per run\x1b[0m\n");
    console.log(renderToAnsi(chart({ width: 64, height: 8 }).data(rows, { xKey: "x" }).yDomain([0, maxY]).bar({ key: "tokens", color: "cyan" }).xAxis(indexXAxis(ids)).yAxis({ format: compact })));
  }

  for (const r of report.runs) {
    if (!r.roles.length) continue;
    const t = new Table({ title: `Run ${r.id.slice(0, 18)} — ${r.children} children`, columns: [
      { name: "role", alignment: "left" }, { name: "n", alignment: "right" },
      { name: "total", alignment: "right" }, { name: "avg", alignment: "right" },
      { name: "median", alignment: "right" },
    ]});
    for (const ra of r.roles) t.addRow({ role: ra.role, n: ra.stats.n, total: fmt(ra.stats.total), avg: fmt(ra.stats.avg), median: fmt(ra.stats.median) });
    t.printTable();
  }

  const rolesTable = new Table({ title: "Per-role aggregates (all runs)", columns: [
    { name: "role", alignment: "left" }, { name: "n", alignment: "right" },
    { name: "total", alignment: "right" }, { name: "avg", alignment: "right" },
    { name: "min", alignment: "right" }, { name: "max", alignment: "right" }, { name: "median", alignment: "right" },
  ]});
  for (const ra of report.roleAggregates) rolesTable.addRow({ role: ra.role, n: ra.stats.n, total: fmt(ra.stats.total), avg: fmt(ra.stats.avg), min: fmt(ra.stats.min), max: fmt(ra.stats.max), median: fmt(ra.stats.median) });
  rolesTable.printTable();

  if (report.roleAggregates.length > 2) {
    const names = report.roleAggregates.map(ra => ra.role.slice(0, 9));
    const rows = report.roleAggregates.map((ra, i) => ({ x: i, tokens: ra.stats.total }));
    const maxY = Math.max(...rows.map(r => r.tokens));
    console.log("\n\x1b[1mtokens by role\x1b[0m\n");
    console.log(renderToAnsi(chart({ width: 64, height: 8 }).data(rows, { xKey: "x" }).yDomain([0, maxY]).bar({ key: "tokens", color: "green" }).xAxis(indexXAxis(names)).yAxis({ format: compact })));
  }

  const topTable = new Table({ title: `Top ${report.topChildren.length} children by tokens (loop/hog suspects)`, columns: [
    { name: "tokens", alignment: "right" }, { name: "role", alignment: "left" }, { name: "session", alignment: "left" },
  ]});
  for (const t of report.topChildren) topTable.addRow({ tokens: fmt(t.tokens), role: t.role, session: t.name });
  topTable.printTable();

  console.log(`\nGrand total: \x1b[1m${fmt(report.overall.grandTotal)}\x1b[0m tokens across ${report.overall.tokensPerChild.n} children in ${report.runsProcessed} run(s) · ctx_* adoption ${report.ctxAdoption.adopted}/${report.ctxAdoption.total}\n`);
}