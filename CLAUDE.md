# CLAUDE.md

Instructions for Claude Code when working in this repository.

## Agent Delegation - Authorized

**This CLAUDE.md explicitly authorizes proactive use of the Agent tool in this
repository.** Claude Code's default guidance is "do not use the Agent tool
unless the user, *a CLAUDE.md file*, or a skill asks for it" - this file is that
authorization. Do not wait to be asked again.

ECC agents are plugin-scoped: invoke them as `Agent(subagent_type: "ecc:planner")`,
always with the `ecc:` prefix, never a bare name.

Delegate without prompting when:

| Trigger | Agent |
|---------|-------|
| Feature spanning 3+ modules, or a routing/layout change | `ecc:planner` |
| Any `.tsx` / `.jsx` component written or modified | `ecc:react-reviewer` |
| Any `.ts` / `.js` written or modified | `ecc:typescript-reviewer` |
| Auth, middleware, server actions, or route handlers | `ecc:security-reviewer` |
| Prisma schema, migration, or raw SQL | `ecc:database-reviewer` |
| `next build` fails | `ecc:react-build-resolver` |
| Bug fix or new feature needing tests | `ecc:tdd-guide` |
| Render jank, bundle size, slow pages | `ecc:performance-optimizer` |
| Swallowed errors, empty `catch {}` | `ecc:silent-failure-hunter` |
| Forms, modals, keyboard navigation | `ecc:a11y-architect` |

**Do NOT delegate** trivial edits, single-file changes, or anything already
sized for one context. Agents start cold with no conversation history - the
handoff cost only pays off for bounded, self-contained work.

### Completion contract

Applies at every depth. **Your final message IS the deliverable.** Never end a
turn with "waiting for background agents" - ending your turn while children run
orphans their results. If you delegate, you own collection: wait, integrate,
then answer.

## Model Choice

The harness is model-independent. Hooks, rules, skills, ECC agents, and MCP
servers load identically on Opus and Sonnet - `/model` swaps the reasoning
engine, not the tooling.

| Use | Model |
|-----|-------|
| Architecture, hard debugging, large refactors, planning | Opus |
| Everyday edits, fast iterations, cheap loops | Sonnet |

## ECC Workflow In This Repo

Next.js 14 + React 18 + TypeScript + Tailwind + Prisma 6, living under
`nextjs_space`, with `docker-compose.yml` and a `cru.sql` seed at the root.
Scripts: `dev`, `build`, `start`, `lint`, and a full `db:*` set
(`generate`, `migrate`, `push`, `seed`, `import`, `verify-files`, `studio`).

| Situation | Command |
|-----------|---------|
| Starting a non-trivial change | `/ecc:plan` - stops and waits for your confirm |
| Finished writing code | `/ecc:code-review` |
| Before a commit | `/ecc:security-scan` |
| Build or tests failing | `/ecc:build-fix` |
| Coverage gaps | `/ecc:test-coverage` |
| Full feature, end to end | `/ecc:orch-add-feature` |
| Bug, reproduced as a failing test first | `/ecc:orch-fix-defect` |
| Full roster of agents and skills | `/ecc:ecc-guide` |

### Repo-specific review focus

- **Work inside `nextjs_space`** - the repo root holds SQL, plans, and status
  documents.
- **The `db:*` scripts are not interchangeable.** `db:migrate` writes a
  migration; `db:push` does not. Know which one the task needs before running
  either.
- **`db:import` and `db:verify-files`** touch real data. Read what they do
  before invoking them.
- **No test script is defined.** Verify with `npm run build`.
