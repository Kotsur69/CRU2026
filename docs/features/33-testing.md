---
id: 33
title: Testy i CI
group: F-delivery
status: todo
depends-on: [31]
legacy-tables: []
prisma-models: []
routes: []
---

# 33 — Testy i CI

> **Where we stand (2026-09-24): not started, though unit tests already exist.** There is no CI yet.
>
> - **Done:** Vitest is set up (`yarn test`: 9 files, 97 tests on 2026-09-24). It covers identifiers, risk numbering, history, attachments, groups, navigation and mailing matching.
> - **Not done:** CI, E2E tests and the coverage targets.
> - **Waiting on:** Q81 (CI runner), Q82 and Q83. Depends on spec 31.
> - **Next step:** after Q81, run `tsc`, `yarn test` and `next build` in CI.

## Why

There is **no test framework installed, no test file, and no CI**. `package.json`
has no `test` script, and CLAUDE.md states the consequence plainly: *"No test
script is defined. Verify with `npm run build`."*

`npm run build` type-checks and compiles. It cannot tell you that the identifier
generator produced `/A03` twice, that a scoped user can see a contract they should
not, or that 4,119 records now display an end date of 2099.

The repo's own rules ask for 80% coverage and test-first development. Meeting that
literally, on 28 routes of already-written application code, would take longer than
the remaining feature work and would mostly produce tests of Prisma. This spec
proposes the opposite discipline: **test the handful of places where being wrong is
expensive and invisible**, and let the build carry the rest.

## What deserves a test

Three criteria: pure enough to test cheaply, wrong in a way the build cannot catch,
and expensive when wrong. Six things qualify.

### 1. The identifier grammar — spec 02, 08, 11

The single highest-value target. It is pure, it has 20,137 real inputs to check
against, and a mistake produces a duplicate contract number on a legal document.

| Case | Source |
|---|---|
| All 18 observed shapes parse | spec 02's census |
| `CO/BL/YYYY/NNNN`, `…/PNNNN`, `…/A01` round-trip | spec 02 |
| **`YYYY/L/NNNN`** — risk, letter from the domain, reset per year *and* letter | spec 08 |
| `/A` numbering is `max + 1`, not `count + 1` — 70 parents have gaps | spec 11 |
| Annex sort is numeric: `/A10` after `/A2` | spec 11 |
| The 61 suffix-less 2012 annexes parse to `annex: 0` | spec 11 |
| `businessline.shortName`, never `.name` — the dormant bug at `identifier.ts:110` | spec 02 |
| Year is `null`, not `0`, where legacy's `abs()` returned 0 | spec 02 |

A property test is worth it here: parse every one of the 20,137 live identifiers
and assert the parse is total and round-trips.

### 2. The access query builder — spec 03

```ts
contractScopeWhere(actor): Prisma.ContractWhereInput
```

Pure input, pure output, and the rule is subtle: **no grant in a dimension means
unrestricted in that dimension**, which is the opposite of the intuitive reading
and affects 428 of 452 users.

| Case | Expectation |
|---|---|
| No grants at all | Unrestricted — matches everything |
| One DOMAIN grant | Only that domain; other dimensions unaffected |
| Two dimensions granted | Both must match |
| LOCATION | Matches `primaryLocationId` **or** the join table (spec 12) |
| Admin | Unrestricted |
| `PROJECT_MODULE` | A module entitlement, not a filter |

Assert on the generated `where` object, not on query results — no database needed,
and the assertion says what the rule is.

### 3. The date sentinels — spec 10

`isIndefinite()` and the `1900-01-01` reading. 4,119 records depend on it, six call
sites must agree (spec 10 lists them), and the failure mode is silent: a contract
reads "31.12.2099" or queues to auto-close in 2100.

### 4. The decimal parser — spec 10

`optionalDecimal` handles `1234.56`, `1 234,56`, a non-breaking space from Excel
and a plain comma. It is exactly the kind of defensive code that gets "simplified"
by someone who has not seen a pasted Excel cell.

### 5. The history differ — spec 13

`buildSnapshot` / the label resolver. Getting it wrong writes a wrong audit row, and
nobody notices until someone reads the log in a dispute. Particularly: `giveopinions`
values are raw user ids in the log (spec 16) and must resolve to names.

### 6. Two critical flows, end to end

Not coverage — smoke. If either breaks, the application is unusable and the build
still passes.

- Sign in → `/umowy` → open a record → download an attachment.
- Create a contract → it gets an identifier → it appears in the register → add an
  attachment → edit it → the change appears in Historia zmian.

## What does not deserve one

Stated so the 80% target is consciously set aside rather than quietly missed:

- **Prisma queries.** Testing `findMany` tests Prisma.
- **Register pages.** Nine screens of filters and columns; the SQL in each spec's
  Verification section is the check, and it is better than a unit test because it
  runs against real data.
- **Rendering.** `Badge`, `Section`, `FilterBar`. Visual, low-risk, expensive to
  assert.
- **Server actions, exhaustively.** The authorization branch of each one is worth a
  test; the happy path is covered by the E2E flow.

## The stack

| Layer | Tool | Why |
|---|---|---|
| Unit | **Vitest** | Native TS and ESM, no Babel, fast. Jest needs more configuration for the same result |
| E2E | **Playwright** | Named in the repo's rules; already available as an MCP server in this environment |
| Coverage | `@vitest/coverage-v8` | Reported, not gated — see below |

Three dev dependencies. No test database for the unit layer: everything in the list
above is pure by design, which is the reason those six were chosen.

The E2E layer does need a database. Use a **seeded scratch schema, never the
working one** — `db:seed` plus a handful of fixtures, torn down after.

## CI

GitHub Actions, on push and pull request:

```yaml
- corepack yarn install --frozen-lockfile
- corepack yarn lint          # needs the eslint pin from spec 31 — broken today
- npx tsc --noEmit
- corepack yarn test
- corepack yarn build
```

In that order: lint and types fail in seconds, the build takes a minute.

E2E runs on demand and before a release, not on every push — it needs Postgres and
a built application, and a five-minute pull-request loop will be ignored.

**`yarn lint` must be fixed first** (spec 31): today it errors out on
`'extensions' has been removed`, so adding it to CI would make every build red.

### Coverage

Report it, do not gate on it. A gate on a codebase that is already written produces
tests aimed at the number. Two gates that are worth having:

- `lib/contracts/identifier.ts` — **90%**
- `lib/authz.ts` and the access builder — **90%**

Both are small, pure and central. The repo-wide 80% target is explicitly deferred;
if it is later required, say so and budget for it (Q82).

## Implementation

| Path | Action | Note |
|---|---|---|
| `package.json` | modify | `test`, `test:watch`, `test:e2e`, `test:coverage`; three dev deps |
| `vitest.config.ts` | create | Node environment, `lib/**` coverage |
| `playwright.config.ts` | create | Base URL 3100, one browser to start |
| `lib/contracts/identifier.test.ts` | create | The eight cases plus the 20,137-identifier property test |
| `lib/authz.test.ts` | create | The six scope cases |
| `lib/contracts/dates.test.ts` | create | Both sentinels, six call sites |
| `lib/contracts/form-schema.test.ts` | create | Decimal formats, tri-state, cross-field rules |
| `lib/contracts/history.test.ts` | create | Snapshot diff, label resolution |
| `e2e/read.spec.ts`, `e2e/write.spec.ts` | create | The two flows |
| `.github/workflows/ci.yml` | create | The five steps above |

### The property test

Worth spelling out, because it is the one test that would have caught several of
the findings in this spec set on its own:

```ts
/** Every identifier in the live register must parse, and re-rendering the parse
 *  must reproduce the input. Run against a dump of `Contract.identifier`
 *  (20,137 rows) checked into `fixtures/identifiers.txt`. */
```

It catches: a new shape nobody anticipated, a regression in the risk grammar, and
the `name`/`shortName` mix-up — all silently, in under a second.

## Verification

```bash
# 1. Today's state.
grep -n '"test"' nextjs_space/package.json          # expect: nothing
find nextjs_space -name "*.test.ts" -not -path "*/node_modules/*" | wc -l   # expect 0
ls nextjs_space/.github/workflows 2>/dev/null       # expect: nothing

# 2. After.
corepack yarn test                  # all green
corepack yarn test:coverage         # identifier.ts ≥ 90%, authz ≥ 90%
npx tsc --noEmit                    # clean
corepack yarn lint                  # runs at all — needs spec 31's pin
corepack yarn build                 # 28 routes
```

Manual checks:

- [ ] `yarn test` runs without a database and finishes in seconds
- [ ] The property test parses all 20,137 identifiers with no failures
- [ ] Deliberately changing `identifier.ts:110` from `shortName` to `name` **fails**
      a test — this is the dormant bug from spec 02
- [ ] Deliberately changing the scope builder so an ungranted dimension restricts
      instead of permitting **fails** a test
- [ ] Removing the `2099-12-31` branch from `isIndefinite` **fails** a test
- [ ] Changing annex numbering to `count + 1` **fails** a test
- [ ] Both E2E flows pass against a seeded scratch database
- [ ] E2E never touches the working database
- [ ] CI is red when any step fails and green on a clean checkout

## Open questions

1. **Q81 — is a CI runner available?** GitHub Actions needs the repository to be on
   GitHub with Actions enabled, which it is (`Kotsur69/CRU2026`). If the project
   moves to an internal host, CI moves with it or disappears.
2. **Q82 — is the 80% coverage rule binding here?** This spec deliberately proposes
   targeted coverage of six pure modules instead. On a codebase that is already
   written, the rule as stated costs more than it returns. Recommend accepting the
   narrower target and recording the decision.
3. **Q83 — where does E2E run against?** A seeded scratch schema is assumed.
   Without a staging environment (Q77) the alternative is a developer's machine,
   which makes E2E a local-only ritual rather than a gate.
