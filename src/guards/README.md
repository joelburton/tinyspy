# `src/guards/` — the repo-wide invariant guards

Every other test in this repo sits beside its subject: `waffle/lib/colors.test.ts`
next to `colors.ts`, `common/pdf/frame.test.ts` next to `frame.ts`. Co-location is
the convention, and it decides placement for you.

These ten have no subject to sit beside. Each one sweeps the **whole repository** —
every stylesheet, every game folder, every edge function, every markdown file — so
there is no module to co-locate with. That's the single thing they have in common,
and it's why they piled up loose at the root of `src/` until this folder existed.

See [docs/testing.md → Repo-wide invariant guards](../../docs/testing.md#repo-wide-invariant-guards)
for the roster and what each one sweeps. Each file's own docstring carries the real
argument for why it exists — most were written after the bug they now prevent.

## Writing a new one

**Read the repo with `process.cwd()`-relative paths.** The CWD is the repo root, so
`join(process.cwd(), 'src')` survives the file being moved. `__dirname`-relative
paths do not — `edgeFnErrorKeys` used one and broke when this folder was created.

**`import.meta.glob` is file-relative, and its keys carry the pattern verbatim.**
`setupRows` globs `'../*/lib/setupSummary.ts'`, so its keys are
`../<game>/lib/setupSummary.ts`. A lookup built from the wrong prefix matches
nothing — and if the guard does `if (!mod) continue`, it skips every assertion and
passes green. Pair a glob with a "we found *something*" assertion, the way
`logos.test.ts` asserts `logos.length > 0`.

**Prove a new guard can fail before trusting it.** Plant the violation it claims to
catch, watch it go red, then remove the plant. A guard that cannot fail is worse
than no guard, because it reads as coverage.

## Where a new guard does NOT go

- **`src/common/`** — that's the shared shell games build on: runtime code that
  ships. `common/test/` holds test *helpers* imported by tests, not tests.
- **`e2e/`** — different runner. Playwright matches `*.e2e.ts` there; these are
  Vitest under `npm run test:fe`. (`schemaExposure.e2e.test.ts` is named
  confusingly but is a Vitest test — it hits the live stack, hence the infix.)
- **`supabase/tests/`** — that's pgTAP under `npm run test:db`, even for the two
  guards whose subject is `supabase/`.

## `tsconfig` placement is per-file

`tsconfig.app.json` excludes, and `tsconfig.node.json` includes, **individual
files** here — not the folder. That looks like a list waiting to drift, but it
can't be a folder rule: a guard that imports app code (`games.ts`, a manifest,
anything in `common/`) pulls the browser half of the app into whichever project
holds it. In the node project that means no `dom` lib, no `jsx`, and no
`vite/client` — hundreds of errors. Only a guard that reads the repo and imports
nothing from `src/` can move over; today that's `cssTokens` alone.

Guards that use `node:fs` *and* import from `src/` (`deployLists`,
`serverErrorKeys`, `gameStatusLabels`) stay in the app project and typecheck fine —
`node:fs` resolves through `@types/node` regardless of the `types` array.
