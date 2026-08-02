import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const SRC = join(dirname(fileURLToPath(import.meta.url)), 'src')

/**
 * Registered game folders in this monorepo — the input to the cross-feature
 * import-direction rules below. **Derived, not hand-maintained.**
 *
 * This used to be a literal array, which drifted twice: once missing five
 * games, later missing wordwheel + wordiply. Drift here is *silent* by
 * construction — a game absent from the forbidden list simply produces no
 * lint error, so nothing fails and nobody notices. Hence deriving it.
 *
 * We read `src/games.ts` (the registry, and the app's own single source of
 * truth) rather than importing it: this config is plain JS loaded by Node,
 * and `games.ts` pulls in every game's manifest, which pulls in React
 * components. A regex over the import specifiers costs nothing and can't
 * fail on a broken game.
 *
 * Matching `from './<name>/manifest'` means a game contributes exactly one
 * entry however many manifests it exports (psychicnum's coop + compete pair
 * ship from one import), and the result comes out in registry order.
 */
const GAMETYPES = [
  ...new Set(
    Array.from(
      readFileSync(join(SRC, 'games.ts'), 'utf8').matchAll(
        /from '\.\/([a-z0-9]+)\/manifest'/g,
      ),
      (m) => m[1],
    ),
  ),
]

/**
 * Cross-check the derived list against the filesystem, and fail loudly on a
 * mismatch.
 *
 * Deriving alone fixes the *copy* that drifts, but not the case the rule
 * actually cares about: a `src/<game>/` folder that exists on disk and isn't
 * in the registry is still unguarded. A game folder is exactly one with a
 * `manifest.ts` (`common/` and `types/` have none), so the two sets must
 * agree in both directions. Throwing at config-load time turns what was a
 * silent hole into a broken `npm run lint` — the whole point of the exercise.
 */
const manifestFolders = readdirSync(SRC, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(SRC, e.name, 'manifest.ts')))
  .map((e) => e.name)

const missing = manifestFolders.filter((g) => !GAMETYPES.includes(g))
const extra = GAMETYPES.filter((g) => !manifestFolders.includes(g))
if (missing.length || extra.length) {
  throw new Error(
    `eslint.config.js: the game registry and src/ disagree.\n` +
      (missing.length
        ? `  Folders with a manifest.ts but NOT in src/games.ts: ${missing.join(', ')}\n` +
          `  (their cross-game imports would be unguarded — register them.)\n`
        : '') +
      (extra.length
        ? `  In src/games.ts but no src/<name>/manifest.ts: ${extra.join(', ')}\n` +
          `  (a half-finished removal? the app won't build either.)\n`
        : ''),
  )
}

/**
 * Build the `patterns` array for `no-restricted-imports` that blocks
 * imports reaching into any of `forbidden` game folders.
 *
 * Each game gets two patterns:
 *   - `**` + `/<name>/` + `**`  — catches `../codenamesduet/Root`,
 *                                  `../../codenamesduet/hooks/useGame`, etc.
 *   - `**` + `/<name>`           — catches `../codenamesduet` (folder index
 *                                  imports, no trailing path).
 *
 * Picomatch (ESLint's matcher) treats `..` as an ordinary path segment,
 * so `**` happily eats it across `../`/`../../` depths.
 */
const forbidGameImports = (forbidden, fromContext) =>
  forbidden.map((g) => ({
    group: [`**/${g}/**`, `**/${g}`],
    message:
      `Cross-feature import of \`src/${g}/\` from ${fromContext}. ` +
      `Games must stay independent; common/shell code reaches games ` +
      `through the registry (\`src/games.ts\`). See docs/naming.md.`,
  }))

export default defineConfig([
  // wordlist.ts is a ~1 MB generated base64 blob (see generate-boggle-wordlist.ts).
  // supabase/.temp is the CLI's scratch dir — it appears whenever the local
  // stack is running and holds generated TS we don't author, which otherwise
  // fails `npm run lint` with ~190 bogus prefer-const errors.
  globalIgnores(['dist', 'supabase/.temp', 'supabase/functions/boggle-build-board/wordlist.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // Cross-feature import-direction rules — see docs/naming.md.
  //
  // The rule of thumb: removing a game from this repo should be three
  // actions (delete its folder, delete its line in `src/games.ts`, drop
  // its Postgres schema). If common/shell/another-game code reached
  // into the game's folder, that property would silently break. ESLint
  // catches the violation at lint time, before it lands in main.
  // ────────────────────────────────────────────────────────────────────

  // common/ may not import from any game folder.
  {
    files: ['src/common/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: forbidGameImports(GAMETYPES, '`src/common/`') },
      ],
    },
  },

  // The shell — App.tsx, main.tsx, test-setup.ts — stays game-agnostic.
  // Games are reached via the registry (`src/games.ts`), which is the
  // ONE allowed exception (it lives at the top level of `src/` and is
  // not matched by any of these file-blocks).
  {
    files: ['src/App.tsx', 'src/main.tsx', 'src/test-setup.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: forbidGameImports(GAMETYPES, 'the shell') },
      ],
    },
  },

  // Each game folder may not import from any OTHER game folder. With ten
  // games registered, each block forbids the other nine — so a stray
  // `import … from '../scrabble/…'` inside `src/wordle/` fails at lint time.
  ...GAMETYPES.flatMap((self) => {
    const others = GAMETYPES.filter((g) => g !== self)
    if (others.length === 0) return []
    return [
      {
        files: [`src/${self}/**/*.{ts,tsx}`],
        rules: {
          'no-restricted-imports': [
            'error',
            { patterns: forbidGameImports(others, `\`src/${self}/\``) },
          ],
        },
      },
    ]
  }),
])
