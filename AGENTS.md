# JARVIS coding workflow

## Default model and execution policy

GPT-6.1 Sol with low reasoning is the primary and default coding model.

For every coding request, the primary agent should normally implement the task directly using Sol Low. Do not delegate merely to classify, route, or implement a routine task.

The goal is to minimize total token consumption, latency, duplicated context, and unnecessary agent calls without sacrificing correctness.

Non-coding questions do not require delegation.

Before implementation, briefly assess scope, affected files/components, visual work, regression risk, reasoning difficulty, and likely retries. Prompt length and file count alone do not make work difficult. Inspect only the code needed to perform the task.

Do not perform a separate classification pass or spawn a routing agent. Classification should be lightweight and part of normal task planning.

## Model routing

| Route | Model | Reasoning | Use |
| --- | --- | --- | --- |
| sol | gpt-6.1-sol | low default | Primary model for all ordinary coding, features, APIs, debugging, refactoring, application logic, and multi-file changes |
| luna | gpt-6-luna | low default | Trivial or highly mechanical tasks where delegation offers a meaningful efficiency advantage |
| terra | gpt-6.1-terra | low default | Specialized visual/UI judgment, styling, layout, responsiveness, and screenshot debugging when Sol is insufficient or Terra offers a clear advantage |
| astra | gpt-6-astra | low default | Exceptionally difficult architecture, algorithms, advanced debugging, performance problems, or critical system changes requiring explicit user approval |

### Routing priorities

1. Default to Sol Low and execute directly.
2. Keep Sol Low for normal and moderately complex tasks.
3. Do not switch models simply because a task matches another model's specialty.
4. Switch only when there is a concrete, task-specific advantage that justifies the additional delegation overhead.
5. Prefer improving task context or diagnostics before escalating model capability.
6. Consider total cost, including delegation overhead, context duplication, retries, and verification.
7. Do not spawn a classifier, coordinator subagent, or reviewer by default.
8. Do not spawn multiple implementation agents for the same task.
9. Do not delegate work that the primary agent can reasonably complete directly.
10. If no specialized model is needed, remain on Sol Low for the entire task.

### Luna usage

Luna is optional, not mandatory for simple work.

Use Luna only when the task is straightforward and delegating it is likely to reduce overall cost or improve efficiency.

Examples include isolated mechanical edits, repetitive cleanup, and narrowly scoped transformations.

If Sol can finish the task faster without a handoff, keep it on Sol.

### Terra usage

Use Terra when specialized visual reasoning provides a clear benefit.

Examples include difficult layout issues, responsive design problems, visual comparisons, and screenshot-based debugging.

Ordinary frontend logic, minor CSS edits, and straightforward UI changes should remain on Sol Low.

### Astra approval requirement

Astra requires explicit, task-specific user approval before every Astra use.

This applies to implementation, review, investigation, debugging, or any other Astra subagent invocation.

If Astra is the only suitable route, stop before making any Astra tool call and ask the user for approval, stating the proposed task and reasoning effort.

Approval for one Astra use does not authorize later uses.

No standing instruction, automatic delegation policy, or previous approval overrides this requirement.

Codex exposes no hard invocation gate here, so the primary must enforce this pause behaviorally.

## Reasoning effort policy

Use the lowest supported reasoning effort likely to complete the task successfully.

Sol Low is the default for ordinary and moderately complex work, including multi-file changes, APIs, application logic, and debugging.

Do not increase effort merely because a task involves several files or sounds complicated.

### Sol

- Default: low
- Medium: concrete complexity, ambiguity, or failed attempts justify additional reasoning
- High: substantial reasoning difficulty or critical risk clearly exceeds lower effort
- Avoid xhigh, max, and ultra unless exceptionally justified and supported

### Luna

- Default: low
- Medium: concrete complexity warrants additional reasoning
- High, xhigh, or max: reserve for exceptional need
- Prefer Sol instead of escalating Luna when the task exceeds Luna's efficient capability

### Terra

- Default: low
- Increase effort only for concrete visual reasoning complexity
- Do not raise effort automatically for all UI tasks

### Astra

- Default: low
- Increase effort only when concrete complexity or a failed attempt warrants it
- Never exceed high reasoning
- Every invocation requires explicit, task-specific user approval

Task category alone does not justify an effort increase.

Avoid reflexive medium, high, xhigh, max, or ultra reasoning.

## Native subagent delegation

Delegation is optional and should be used only when justified.

The primary Sol agent should perform normal coding tasks directly.

When delegation is justified:

1. Choose the most suitable specialized model.
2. Keep only one worker actively implementing at a time.
3. Give the worker a compact, targeted handoff.
4. Avoid duplicating full conversation history or repository scans.
5. Let the delegated worker complete its assigned task.
6. Review the result and perform focused verification.
7. Do not spawn additional agents unless concrete evidence justifies it.

If you ARE the delegated worker, execute your assignment. Do not route it again or spawn additional agents.

Use the matching custom role in `.codex/agents/` when the native spawn tool exposes role selection and its pinned default effort is suitable.

If it exposes only `model` and `reasoning_effort`, explicitly pass the selected model and effort, use `fork_turns="none"`, and include the selected role's short instructions in the handoff.

Never rely on model or effort inheritance.

Read only the relevant role file, not every role.

Full-history forks cannot change models in some clients.

For non-default reasoning effort, use an untyped/default worker with explicit model and effort settings plus the role's short instructions, and use `fork_turns="none"`.

Named custom roles pin their saved defaults.

When delegating, state:

Route: <role> | <model> | <effort> | <short reason>

Include the objective, relevant paths/symbols, acceptance checks, constraints, existing user changes, and known diagnostics.

Pass paths and concise findings instead of replaying the chat or repeating repository-wide scans.

Subagents share this workspace. Never overwrite or revert unrelated work.

## Recovery and verification

On failure, classify the cause before retrying.

### Environment failures

Examples include dependencies, services, network access, permissions, quotas, or model availability.

Fix the concrete prerequisite if authorized; otherwise report the blocker.

Do not escalate model capability merely because a test cannot run.

### Requirements failures

Inspect relevant local context, use a safe documented assumption when reasonable, or ask only for information needed to proceed.

Do not spawn another agent to resolve a simple missing requirement.

### Capability failures

Preserve existing edits, failing cases, attempted approaches, and diagnostics.

First determine whether the current model can resolve the problem using better context or a corrected approach.

For ordinary Sol failures, consider increasing Sol reasoning to medium when justified before delegating.

For visual problems, consider Terra.

For exceptionally difficult problems, consider Astra, subject to explicit approval.

Do not escalate automatically.

Retry the same worker only with a concrete changed condition or correction.

Allow at most one same-agent retry per distinct failure before reassessing.

Reuse an existing worker for same-model continuation.

Pause or finish the previous worker before escalating.

Escalate with a concise handoff; never restart from scratch unnecessarily.

After an unsuccessful Astra attempt, report the unresolved problem and evidence.

Do not loop or escalate effort without a concrete reason.

Never silently substitute a model or reasoning effort if unavailable. Report the limitation.

## Token efficiency

Minimize unnecessary token consumption throughout the workflow.

- Do not spawn subagents for routine work.
- Do not perform separate routing or classification calls.
- Do not repeatedly inspect unchanged files.
- Do not reread the entire repository when relevant files are already known.
- Do not duplicate large amounts of context between agents.
- Do not run multiple agents to solve the same problem by default.
- Do not automatically request independent reviews for small changes.
- Do not increase reasoning effort without concrete justification.
- Do not repeat failed approaches without changing the conditions.
- Prefer targeted file inspection over broad repository scans.
- Prefer concise handoffs containing relevant findings and paths.
- Reuse existing context when available.
- Stop once the requested task is implemented and verified.

Token efficiency must not override correctness, safety, or required verification.

## Verification and reporting

Run focused acceptance checks, review the diff, and stop once the task is proven.

For directly executed tasks, report the implementation, relevant checks, and remaining limitations.

For delegated tasks, also report the worker ID, requested model and reasoning effort, and verification results.

Use runtime metadata when available to verify execution.

An agent's self-description is not proof of its actual model.

Distinguish requested settings from verified settings.

If delegation tools are absent, continue directly with Sol when appropriate.

Do not claim delegation occurred or that the primary switched models when it did not.

If Astra is required but unavailable or unapproved, report the limitation rather than silently substituting it.

## Project conventions

JARVIS is a Node ES-module project.

Use Node >=22.

`npm test` runs the test suite.

Preserve existing working configurations and uncommitted changes.

Avoid unrelated cleanup, new dependencies, new services, and broad analysis.

Application modules live under `modules/`.

Inspect the relevant entry point before editing.

Configuration details and verification instructions:
`docs/CODEX-ROUTING.md`
