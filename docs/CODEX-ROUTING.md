# Native Codex routing for JARVIS

Configured November 1, 2026 (America/Los_Angeles). No API proxy, external router,
paid service, new dependency, scheduler, or application runtime change is involved.

## What happens on a coding request

The primary reads `AGENTS.md`, briefly classifies the request, and delegates its
implementation to one suitable native worker. You do not need to name the worker.
The primary checks the outcome and handles any follow-up or escalation. Workers
do not recursively delegate. Ordinary non-coding questions stay with the primary.

| Agent | Exact model | Default effort | Permitted effort | Typical work |
| --- | --- | --- | --- | --- |
| Luna | `gpt-6-luna` | `low` | `low`, `medium`, `high`, `xhigh`, `max` | Simple fixes, edits, cleanup and small functions |
| Terra | `gpt-6.1-terra` | `low` | `low`, `medium`, `high`, `xhigh`, `max`, `ultra` | Visual design, layouts, frontend and responsive UI |
| Sol | `gpt-6.1-sol` | `low` | `low`, `medium`, `high`, `xhigh`, `max`, `ultra` | Multi-file features, API logic and moderate debugging; use low for normal and moderate work |
| Astra | `gpt-6-astra` | `low` | `low`, `medium`, `high`, `xhigh`, `max`, `ultra` | Hard architecture, algorithms, advanced debugging and critical changes |

An exact minor UI text/value edit can use Luna; visual judgment belongs to Terra.
Complex backend or critical architecture work is not downgraded just because a
request mentions UI. Long prompts alone do not justify an expensive model.

### Astra approval gate

Every Astra invocation requires explicit approval from the user for that specific
use, including implementation, review, and investigation. The primary must pause
before calling any Astra tool and ask the user, describing the proposed task and
effort. Approval applies only to that invocation. This is not a blanket change to
the rule delegating coding work to one native worker: choose a suitable non-Astra
route where possible, and wait for approval only when Astra is the proposed route.
Codex has no hard native per-role invocation approval setting in the project
configuration inspected here; this gate is enforced through primary-agent
instructions and validator checks, and is therefore behavioral rather than a
runtime-enforced block. The Astra role instructions also require stopping if the
primary invokes it without the task-specific approval.

The four standalone agent files pin their defaults. If the spawn interface exposes
custom roles, select the role when its default effort fits. If it exposes only
model and effort, pass both explicitly and supply the role instructions, using a
compact fresh handoff (`fork_turns="none"`). For any non-default effort, use an untyped/default worker with explicit model
and effort plus the role instructions (`fork_turns="none"`); named roles keep
their pinned defaults. Choose the lowest supported effort likely to handle the task and
increase only for concrete need. Sol should stay at low for normal and moderate
work, including ordinary multi-file and API tasks. Use medium or high only when
scope, ambiguity, or critical risk clearly exceeds low capability, or a concrete
failed attempt demonstrates the need; task category alone is not enough. Avoid
reflexive medium and reflexive `xhigh`, `max`, or `ultra`.

## Automation and its limits

This is instruction-driven automatic delegation using native Codex tools, not a
deterministic middleware classifier or a pre-submit hook. `AGENTS.md` is standing
authorization for delegation on future coding tasks in this project. A fresh
test coordinator can read it and perform routing without per-task model choices.
Higher-priority policies, unavailable tools, explicit user overrides, or untrusted
project configuration can prevent routing; the primary must disclose that.

`.codex/config.toml` defaults the primary and fallback subagents to Luna/Low.
Existing global configuration is preserved. The active chat stays on its already selected model; there is no automatic mid-chat
parent model switching. Explicit desktop/CLI model selections can override project
defaults. If an existing chat remains on Astra, selecting Luna/Low once or starting a new
project chat with the project defaults avoids Astra coordinator cost. Worker selection itself does not require manual choices.

All role files and instructions persist on disk. A fresh Codex session reloads
them. Existing sessions may retain cached configuration; this session used explicit
spawn settings while fresh native prompt inspection confirmed role discovery.
The repository already has trusted status locally. On another machine, Codex must
trust the project before its project configuration takes effect.

Only one worker should actively implement at a time. The native limit of four
open subagent threads leaves room for retained workers and escalation handoffs;
it is not a request to run four concurrent implementations.

## Recovery

The primary distinguishes capability, environment and requirements problems.
Missing packages, denied localhost access, unavailable models or missing test
services are not reasons to buy a stronger model. A retry needs a concrete changed
condition. There is at most one same-worker retry per distinct failure before
reassessment. Capability escalation usually follows Luna -> Sol -> Astra; Terra
handles visual work, with later escalation determined by the actual problem.
Previous edits, exact failures and diagnostics are passed forward. Do not restart
from scratch or silently change model/effort. Raise effort only when concrete task
difficulty or a failed attempt requires it.

## Files

- `AGENTS.md`: persistent task classification, delegation and recovery instructions.
- `.codex/config.toml`: project coordinator and subagent defaults.
- `.codex/agents/{luna,terra,sol,astra}.toml`: four native specialized roles.
- `.gitignore`: permits only the project config and these four role files under
  `.codex/`; other local Codex state stays ignored.
- `scripts/verify-codex-routing.py`: dependency-free configuration validator.
- `docs/CODEX-ROUTING-VALIDATION.json`: compact recorded verification evidence.
- `work/codex-routing/`: ignored diagnostic logs, generated schemas and isolated
  smoke fixtures. These are not application files or production dependencies.

The configuration is eligible for version control but is not automatically
committed. Global `~/.codex/config.toml`, existing application sources and existing
uncommitted changes were preserved.

## Verify the setup

Observed results on the installed desktop runtime `0.165.0-alpha.1.2` and CLI
`0.163.0`:

- Both native configuration probes passed 47/47 checks. Fresh native prompt
  inspection loaded `AGENTS.md` and discovered all four custom roles.
- A fresh Luna/Extra High coordinator selected and dispatched Luna/Extra High,
  Sol/Medium and Terra/High for the simple, moderate and UI fixture requests.
- All six validation-related subagent runs matched the allowed model/effort pairs
  in both the runtime threads table and their turn-context records, including
  Astra/High. No Luna effort reduction or Astra increase was observed.
- Seven isolated coding assertions/tests passed across the simple fix, API retry
  behavior and Astra's directed-graph handoff. Terra's UI checks were static;
  browser policy prevented observing local-file rendering.
- Environment/requirements/capability recovery decisions were simulated. Astra
  successfully continued a synthetic failed-algorithm handoff; a natural cheaper
  model capability failure and its automatic escalation were not observed.
- The existing application suite passed 562/562 tests with authorized localhost
  access. In the restricted sandbox, 559 passed and three API tests failed with
  localhost `EACCES`; changing access resolved those without application edits.
- Hash comparison of 281 pre-existing paths found only the intentional
  `.gitignore` modification. Application files and prior user edits were unchanged.

From the project directory with Python 3.11 or later:

```powershell
python scripts/verify-codex-routing.py
```

This parses all five TOML files, checks exact role names/models/default efforts,
validates project defaults and compares every permitted role effort against the
installed desktop model catalog. A
cached catalog confirms supported settings, not actual inference access.

For native effective configuration, provide the absolute Codex executable path
from your current installation (the path changes with desktop updates):

```powershell
python scripts/verify-codex-routing.py --codex 'C:\path\to\codex.exe'
```

This starts a temporary local app-server with `--strict-config`, performs only
`initialize` and `config/read`, verifies the active project layer and defaults,
then stops it. It creates no coding chat or model turn. It needs normal access to
Codex's own local state directory. The JSON report goes to
`work/codex-routing/validation.json`; failures exit nonzero.

To inspect native role discovery without running a coding task:

```powershell
codex debug prompt-input 'Configuration inspection only' > work/codex-routing/prompt-input.json
```

The output should include the project instructions and all four role descriptions
with exact models and pinned efforts. Keep this ignored file local: it includes
your session instructions and tool context. `--strict-config` is not supported
by `debug`; strict validation is performed by the app-server probe instead.

During work, inspect the spawn call/activity card or open the subagent in Codex's
Subagents view. The primary reports the worker ID and requested model/effort.
Do not trust a worker merely saying "I am Luna". For this validation, execution
was checked independently against the desktop runtime's read-only SQLite
`threads` records (`id`, `agent_path`, `model`, `reasoning_effort`) and turn metadata.
That database is an internal diagnostic format and may change between versions;
no runtime database was edited. Recorded IDs are in the verification report.

## Cost expectations

Routing optimizes likely total task cost using a heuristic; measured dollar
savings or a globally optimal route are not proven. Costs include the primary's
classification/review tokens, the worker's instructions/tools, reasoning, tests,
retries and escalation. Luna's required Extra High can cost more than a lower
effort setting, especially for tiny edits. Fresh compact handoffs, one active
worker, focused reads and no default extra reviewer reduce overhead. Existing
plugins/tools remain enabled, so their context overhead remains. Subscription
usage is not the same as multiplying public API token prices.

## Official references

- [Native subagents and custom role settings](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- [Current model identifiers and capabilities](https://developers.openai.com/api/docs/models)

See the verification report for actual observed results and unverified limits;
supported configuration should not be confused with a guarantee on every future
task or a proven natural capability-failure escalation.
