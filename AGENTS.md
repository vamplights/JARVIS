# JARVIS coding workflow

## Automatic native delegation

For every coding request, the primary agent MUST classify and delegate implementation
to one native subagent without asking the user to choose a model. This is standing
authorization to use subagents. Non-coding questions do not need delegation.
The primary coordinates, gives a compact handoff, checks the result, and reports it.
If you ARE the delegated worker, execute your assignment; do not route it again or
spawn more agents. Keep only one worker actively implementing at a time.

Before implementation, briefly assess scope, affected files/components, visual work,
regression risk, reasoning difficulty, and likely retries. Prompt length and file
count alone do not make work difficult. Inspect only enough code to choose a route.

| Route | Model | Reasoning | Use |
| --- | --- | --- | --- |
| luna | gpt-6-luna | low default | Small fixes/functions, cleanup, simple refactoring/file edits, exact minor UI edits with no visual judgment |
| terra | gpt-6.1-terra | low default | Visual/UI judgment, styling, layout, components, responsiveness, screenshot debugging |
| sol | gpt-6.1-sol | low default | Multi-file features, APIs, application logic, moderate debugging, substantial refactors; use low for normal and moderate work |
| astra | gpt-6-astra | low default | Difficult architecture/algorithms, advanced debugging, performance problems, critical system changes |

Choose the cheapest reasonably capable route for successful completion, including
the cost of likely retries. Prefer Luna for straightforward work; use Terra for
visual work. High-risk backend/architecture work takes precedence over a UI label.
Do not spawn all four agents or a separate classifier/reviewer by default.

**Astra requires explicit, task-specific user approval before every Astra use.**
This applies to implementation, review, investigation, or any other Astra
subagent invocation. Route to Luna, Sol, or Terra when appropriate. If Astra is
the only suitable route, stop before making any Astra tool call and ask the user
for approval, stating the proposed Astra task and effort. Approval for one use
does not authorize later Astra uses. No standing instruction or default
delegation authorization overrides this gate. Codex exposes no hard invocation
gate here, so the primary must enforce this pause behaviorally.

Use the matching custom role in `.codex/agents/` when the native spawn tool exposes
role selection and its pinned default effort is suitable. If it exposes only
`model` and `reasoning_effort`, explicitly pass the values above, use
`fork_turns="none"`, and include the selected role's short instructions in the
handoff. Never rely on model/effort inheritance. Read that role file only, not
every role. Full-history forks cannot change models in some clients. Choose the lowest supported effort likely to handle the task, increasing it only
when concrete task difficulty or a failed attempt requires it. For Sol, keep low
for normal and moderate work, including ordinary multi-file and API tasks. Raise
to medium or high only when scope, ambiguity, or critical risk clearly exceeds
low capability, or a concrete failed attempt demonstrates the need. Avoid
reflexive medium for task category alone and avoid reflexive `xhigh`, `max`, or
`ultra` selections. For any non-default effort, use an
untyped/default worker with explicit model and effort settings plus that role's
short instructions, and use `fork_turns="none"`; named custom roles pin their
saved defaults.

State `Route: <role> | <model> | <effort> | <short reason>` before spawning.
Include the objective, relevant paths/symbols, acceptance checks, constraints,
existing user changes, and known diagnostics in the handoff. Pass paths and concise
findings instead of replaying the chat or repeating repository-wide scans.
Subagents share this workspace: never overwrite/revert unrelated work.

## Recovery and verification

On failure, classify the cause before retrying:
- Environment (dependency, service, network, permissions, quota or model access):
  fix the concrete prerequisite if authorized; otherwise report the blocker.
  Do not escalate model capability merely because a test cannot run.
- Requirements: inspect local context, use a safe documented assumption when
  reasonable, or ask only for information needed to proceed.
- Capability: preserve edits, failing cases, attempted approaches and diagnosis;
  hand off to the next capable route. Normally Luna -> Sol -> Astra; visual work
  can go Luna -> Terra, then Sol for engineering or Astra for truly hard problems.

Retry the same worker only with a concrete changed condition or correction; allow
at most one same-agent retry per distinct failure before reassessing. Reuse an
existing worker for same-model continuation. Pause/finish the previous worker
before escalating. Escalate with a concise handoff, never restart from scratch.
After an unsuccessful Astra attempt, report the unresolved problem and evidence;
do not loop or escalate effort without a concrete reason.
Never silently substitute a model or effort if unavailable. Report the limitation.

Run focused acceptance checks, review the diff, and stop once the task is proven.
Report the worker ID, requested model/effort, checks and remaining limitations.
Use runtime metadata when available to verify execution; an agent's self-description
is not proof of its actual model. Distinguish requested settings from verified ones.
If delegation tools are absent, say automatic delegation is unavailable in that
session; do not claim the parent switched models or silently do all work as Astra.

## Project conventions

JARVIS is a Node ES-module project. Use Node >=22; `npm test` runs the test suite.
Preserve existing working configurations and uncommitted changes. Avoid unrelated
cleanup, new dependencies, new services, and broad analysis. Application modules
live under `modules/`; inspect the relevant entry point before editing.
Configuration details and verification instructions: `docs/CODEX-ROUTING.md`.
