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
| luna | gpt-6-luna | xhigh ALWAYS | Small fixes/functions, cleanup, simple refactoring/file edits, exact minor UI edits with no visual judgment |
| terra | gpt-6.1-terra | high (xhigh permitted) | Visual/UI judgment, styling, layout, components, responsiveness, screenshot debugging |
| sol | gpt-6.1-sol | medium (high for complicated work) | Multi-file features, APIs, application logic, moderate debugging, substantial refactors |
| astra | gpt-6-astra | high ONLY | Difficult architecture/algorithms, advanced debugging, performance problems, critical system changes |

Choose the cheapest reasonably capable route for successful completion, including
the cost of likely retries. Prefer Luna for straightforward work; use Terra for
visual work. High-risk backend/architecture work takes precedence over a UI label.
Do not spawn all four agents or a separate classifier/reviewer by default.

Use the matching custom role in `.codex/agents/` when the native spawn tool exposes
role selection. If it exposes only `model` and `reasoning_effort`, explicitly pass
the values above, use `fork_turns="none"`, and include the selected role's short
instructions in the handoff. Never rely on model/effort inheritance. Read that role
file only, not every role. Full-history forks cannot change models in some clients.
The pinned custom-role defaults are sufficient normally. For Terra xhigh or Sol
high, use explicit model/effort spawning if supported; if the role file overrides
the effort, use the untyped/default worker with the role instructions instead.
Do not edit the saved defaults just for a task.

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
do not loop or raise Astra above high. Luna must stay xhigh and Terra at least high.
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
