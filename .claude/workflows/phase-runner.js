export const meta = {
  name: 'phase-runner',
  description: 'Run one docs/IMPROVEMENT_PLAN.md phase: Fable research, sequential tier-routed implementation, Opus review loop, Fable final gate',
  whenToUse: 'Executing a whole phase of the FabricDesigner improvement plan in one session. args: {phase: "Phase 2 - Data safety (highest user value)", notes: "optional carry-over items or constraints"}',
  phases: [
    { title: 'Research', detail: 'Plan section + repo state -> ordered, tier-routed task list', model: 'fable' },
    { title: 'Implement', detail: 'One task at a time, strictly sequential, model per task from the plan tier column', model: 'sonnet' },
    { title: 'Review', detail: 'Full suite + acceptance criteria + feature-inventory regression, bounded fix loop', model: 'opus' },
    { title: 'Finalize', detail: 'Independent read-only final gate + phase report', model: 'fable' },
  ],
}

// ── Inputs ────────────────────────────────────────────────────────────────────
const phaseName = (args && args.phase) || ''
if (!phaseName) throw new Error('Pass args: {phase: "Phase N - Title"} matching a phase heading in docs/IMPROVEMENT_PLAN.md.')
const notes = (args && args.notes) || 'none'

// ── Schemas ───────────────────────────────────────────────────────────────────
const TASKS_SCHEMA = {
  type: 'object',
  required: ['phaseSummary', 'acceptance', 'tasks'],
  properties: {
    phaseSummary: { type: 'string', description: '5-10 sentences: what this phase delivers and the constraints binding it' },
    acceptance: { type: 'string', description: 'The acceptance criteria of every planned item, close to verbatim, prefixed with the item ID' },
    openQuestions: { type: 'array', items: { type: 'string' } },
    tasks: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        required: ['itemId', 'title', 'detail', 'files', 'verify', 'model'],
        properties: {
          itemId: { type: 'string', description: 'The plan work-item ID this task serves, e.g. "2.1"' },
          title: { type: 'string' },
          detail: { type: 'string', description: 'What to build, which existing seams to extend, what NOT to touch' },
          files: { type: 'array', items: { type: 'string' } },
          verify: { type: 'string', description: 'A shell command or concrete check proving the task done' },
          model: { type: 'string', enum: ['sonnet', 'opus'], description: 'From the plan tier column: sonnet for implementation/tests/mechanical work, opus for design and cross-cutting work' },
        },
      },
    },
  },
}

const RESULT_SCHEMA = {
  type: 'object',
  required: ['status', 'summary', 'filesTouched', 'verifyEvidence'],
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    summary: { type: 'string', description: '3-6 sentences of what was actually done' },
    filesTouched: { type: 'array', items: { type: 'string' } },
    verifyEvidence: { type: 'string', description: 'The verify command run and its relevant output' },
    flags: { type: 'array', items: { type: 'string' }, description: 'Anything the operator must know, including manual QA steps if browser verification was unavailable' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'evidence', 'findings'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    evidence: { type: 'string', description: 'Test/lint/build commands run and their result lines' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'summary'],
        properties: {
          severity: { type: 'string', enum: ['blocking', 'minor'] },
          file: { type: 'string' },
          summary: { type: 'string' },
          suggestedFix: { type: 'string' },
        },
      },
    },
  },
}

const FINAL_SCHEMA = {
  type: 'object',
  required: ['ready', 'report'],
  properties: {
    ready: { type: 'boolean', description: 'true only if every planned item\'s acceptance criteria are demonstrably met' },
    report: { type: 'string', description: 'The full phase report in markdown, one sentence per physical line' },
    operatorActions: { type: 'array', items: { type: 'string' } },
  },
}

// ── Shared rules injected into every implementation-capable agent ─────────────
const HOUSE_RULES = `Hard rules (docs/IMPROVEMENT_PLAN.md section 2 binds all work):
- Never remove or degrade any feature listed in plan section 3. Features are only improved or extended.
- npm test, npm run lint, and npm run build must all be green when you finish.
- Keep the light visual theme and the existing interaction vocabulary (tools, hints, ruler, toasts).
- Bugs with a runtime surface must be reproduced end-to-end in the running app (npm run dev, real browser) BEFORE the fix is written.
- UI-affecting changes are verified in a real browser. Load browser tools via ToolSearch (chrome-devtools or claude-in-chrome MCP) if reachable; if not, say so in flags and list the exact manual QA step instead of claiming verification.
- Plain dash "-" only; never type the em dash character (U+2014) in any authored text, code, doc, or commit.
- No fake completion: no ${'TO' + 'DO'} placeholders, no test.${'skip'} / .${'only'}, no stubbed branches. Implement fully or return status blocked.
- Update docs/IMPROVEMENT_PLAN.md as you work: set your item's status, and append-only entries to the decision log (section 7). Never rewrite existing doc content; only append or flip your own status cell.
- Do NOT touch the phase-review item (the "N.R" row); the operator session closes that after this workflow returns.
- Commits: conventional prefix (fix:/feat:/refactor:/test:/docs:), imperative subject, plan item ID referenced in the body, NO co-author or generated-with lines. Commit only after verification passes. Design-only tasks commit just the doc update with a docs: prefix.`

// ── Phase 1: Research (Fable, one agent) ──────────────────────────────────────
phase('Research')
log(`Researching "${phaseName}"`)
const research = await agent(
  `You are the research scout for one phase of an improvement plan. The repo is the current working directory: FabricDesigner, a client-only React SPA (React 19 + Vite 8 + Tailwind v4) that colorizes B&W textile images using band logic.

Target phase: "${phaseName}" in docs/IMPROVEMENT_PLAN.md.
Operator notes: ${notes}

Do this:
1. Read docs/IMPROVEMENT_PLAN.md fully. Focus on the target phase's work-item table, the findings register entries those items reference, section 2 (hard constraints), section 3 (feature inventory), and section 7 (decision log, including inherited decisions that must not be relitigated).
2. Check each work item's status: plan ONLY items that are todo or in-progress; skip done/skipped items. Respect the dependencies noted in the plan and in the operator notes. If a dependency from an earlier phase is not done, put that in openQuestions and exclude the dependent task.
3. Inspect repo state: git log --oneline -10, git status --short, and read the files each planned item touches so tasks reference real seams, not guesses.
4. Run npm test and npm run lint once and record the baseline result. If the baseline is red, report it in openQuestions and plan a first task to restore green.

Then return a dependency-ordered breakdown of AT MOST 8 tasks (fewer is better), generally one task per work item. Items whose tier column says "opus (design) then sonnet (implement)" become exactly two consecutive tasks: a design task (model "opus") whose deliverable is a written design appended to the plan's decision log, then an implementation task (model "sonnet") that implements that design verbatim. Every task carries its plan itemId, concrete file paths, a concrete verify check, and its model from the tier column.

${HOUSE_RULES}`,
  { label: 'research', phase: 'Research', model: 'fable', schema: TASKS_SCHEMA },
)
if (!research) throw new Error('Research agent returned nothing; cannot plan the phase.')
log(`${research.tasks.length} tasks planned`)

// ── Phase 2: Implement (strictly sequential, model per task - no fan-out) ─────
phase('Implement')
const done = []
for (let i = 0; i < research.tasks.length; i++) {
  const t = research.tasks[i]
  log(`Task ${i + 1}/${research.tasks.length} [${t.itemId}, ${t.model}]: ${t.title}`)
  const prior = done.length
    ? done.map((d, j) => `${j + 1}. [${d.itemId}] ${d.task} [${d.status}]: ${d.summary}`).join('\n')
    : 'none yet'
  const r = await agent(
    `You are executing exactly ONE task of "${phaseName}" for FabricDesigner (repo at the current working directory). Read docs/IMPROVEMENT_PLAN.md before touching anything; it is the single source of truth.

Phase context: ${research.phaseSummary}

Acceptance criteria for the planned items (your task serves these):
${research.acceptance}

Tasks already completed this phase (do not redo them; build on them):
${prior}

YOUR TASK (plan item ${t.itemId}): ${t.title}
Detail: ${t.detail}
Files in scope: ${t.files.join(', ')}
Definition of done: ${t.verify}

Stay strictly inside this task's scope. If you notice adjacent problems, add them to the plan's findings register (next free ID) and mention them in flags instead of fixing them. If your task is a design task, append the design to the plan's decision log, leave the item in-progress, and do not write implementation code. If your task completes its work item, flip the item's status to done in the plan before committing. Before returning, prove your work: run the definition-of-done check and any directly relevant unit tests (not the full suite; the review stage runs that) and include the command plus its relevant output as verifyEvidence.

${HOUSE_RULES}`,
    { label: `${t.itemId}: ${t.title.slice(0, 40)}`, phase: 'Implement', model: t.model, schema: RESULT_SCHEMA },
  )
  done.push(
    r
      ? { itemId: t.itemId, task: t.title, ...r }
      : { itemId: t.itemId, task: t.title, status: 'blocked', summary: 'Agent failed or was skipped.', filesTouched: [], verifyEvidence: '', flags: ['agent did not return'] },
  )
}

// ── Phase 3: Review (Opus) with a bounded fix loop ────────────────────────────
phase('Review')
const changelogText = done
  .map((d, j) => `${j + 1}. [${d.itemId}] ${d.task} [${d.status}]: ${d.summary}${d.flags && d.flags.length ? ' | flags: ' + d.flags.join('; ') : ''}`)
  .join('\n')

const MAX_FIX_ROUNDS = 2
let review = null
for (let round = 0; round <= MAX_FIX_ROUNDS; round++) {
  review = await agent(
    `You are the reviewer for "${phaseName}" of FabricDesigner (repo at the current working directory). Implementation is complete; you wrote none of it. Be adversarial and evidence-driven. Read docs/IMPROVEMENT_PLAN.md first.

What was implemented this phase:
${changelogText}

Acceptance criteria for the planned items:
${research.acceptance}

Do this, in order:
1. Run the FULL suite: npm test, npm run lint, npm run build. Quote the result lines in evidence.
2. Review the changes (git log --oneline for this phase's commits, git diff against the pre-phase baseline) against each item's acceptance criteria and the plan's section 2 hard constraints.
3. Regression-check the plan section 3 feature inventory, prioritizing features whose code was touched. Exercise UI-affecting changes in a real browser (npm run dev; load browser tools via ToolSearch if reachable); note in evidence anything you could only verify statically.
4. Hunt fake completion: grep the touched files for ${'TO' + 'DO'}, ${'FIX' + 'ME'}, test.${'skip'}, .${'only'}, and stubbed/unreachable branches.
5. Verify the plan doc itself was maintained: statuses match reality, decision-log entries appended, no history rewritten, no em dash characters introduced.
6. Check every blocked or partial task above: is the blockage legitimate (owner decision needed) or dodged work?

Verdict 'fail' ONLY for blocking findings (broken suite, unmet acceptance criteria, constraint violations such as a removed/degraded feature, fake completion, plan doc corruption). Style nits are 'minor' and never fail the review.${round > 0 ? '\n\nThis is re-review round ' + round + ' after a fix pass; confirm earlier blocking findings are actually resolved.' : ''}`,
    { label: round === 0 ? 'review' : `re-review ${round}`, phase: 'Review', model: 'opus', schema: REVIEW_SCHEMA },
  )
  if (!review) throw new Error('Review agent returned nothing.')
  if (review.verdict === 'pass') break
  if (round === MAX_FIX_ROUNDS) {
    log('Blocking findings remain after final fix round; passing them to the finalizer unresolved.')
    break
  }
  const blocking = review.findings.filter((f) => f.severity === 'blocking')
  log(`Review failed with ${blocking.length} blocking finding(s); fix round ${round + 1}`)
  await agent(
    `You are fixing the blocking review findings for "${phaseName}" of FabricDesigner (repo at the current working directory). Read docs/IMPROVEMENT_PLAN.md first. Fix ONLY these findings; change nothing else.

Findings:
${blocking.map((f, j) => `${j + 1}. [${f.file || 'unspecified file'}] ${f.summary}${f.suggestedFix ? ' | suggested: ' + f.suggestedFix : ''}`).join('\n')}

Phase context: ${research.phaseSummary}

After fixing, run the directly affected tests to confirm, commit per the commit rules (reference the related item ID), and report exactly what you changed.

${HOUSE_RULES}`,
    { label: `fix round ${round + 1}`, phase: 'Review', model: 'sonnet', schema: RESULT_SCHEMA },
  )
}

// ── Phase 4: Finalize (Fable, independent read-only gate) ─────────────────────
phase('Finalize')
const final = await agent(
  `You are the independent final gate for "${phaseName}" of FabricDesigner (repo at the current working directory). Trust nothing you are told below without re-checking it yourself. Read docs/IMPROVEMENT_PLAN.md first.

Implementation changelog:
${changelogText}

Reviewer verdict: ${review.verdict}
Reviewer evidence: ${review.evidence}
Unresolved findings: ${review.findings.length ? review.findings.map((f) => `[${f.severity}] ${f.summary}`).join('; ') : 'none'}
Open questions from research: ${research.openQuestions && research.openQuestions.length ? research.openQuestions.join('; ') : 'none'}

Do this:
1. Re-run npm test, npm run lint, and npm run build yourself, and independently spot-verify each item's acceptance criteria below with real commands (browser checks included where feasible), not by trusting the changelog:
${research.acceptance}
2. Grep the touched files once more for ${'TO' + 'DO'}/${'FIX' + 'ME'}/test.${'skip'}/.${'only'} and for the em dash character.
3. Confirm the plan doc is consistent: item statuses truthful, decision log appended, findings register updated with anything flagged, and the phase-review item (N.R) still untouched (the operator closes it).
4. Write the phase report in markdown, one sentence per physical line, covering: what shipped per item with evidence, the commits made (git log), deviations from the plan, how review findings were resolved or why they stand, and operatorActions the owner must do personally (decisions, manual QA steps, closing the N.R item).
5. Set ready=true only if every planned item's acceptance criteria are demonstrably met right now.

Do NOT commit or modify any files; you are a gate, not an author.`,
  { label: 'final gate', phase: 'Finalize', model: 'fable', schema: FINAL_SCHEMA },
)
if (!final) throw new Error('Finalizer returned nothing.')

return {
  phase: phaseName,
  ready: final.ready,
  report: final.report,
  operatorActions: final.operatorActions || [],
  reviewVerdict: review.verdict,
  reviewFindings: review.findings,
  tasks: done,
  openQuestions: research.openQuestions || [],
}
