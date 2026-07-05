import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * Registered game folders in this monorepo. Single source of truth for
 * the cross-feature import-direction rules below. When a new game
 * arrives (e.g. boggle), append its name here AND in `src/games.ts`.
 *
 * This list SHOULD be derived from `src/games.ts` so the two can't drift —
 * and they did: for a while this list was missing five games, silently
 * unguarding their cross-game imports (nothing fails when a game is simply
 * absent from the forbidden list). Generating it from the registry is
 * tracked in deferred.md. Until then, adding a game means editing both.
 */
// Keep in registry order, mirroring `src/games.ts`. All ten folders must be
// listed — a missing one silently unguards cross-game imports of it.
const GAMETYPES = [
  'codenamesduet',
  'psychicnum',
  'connections',
  'spellingbee',
  'bananagrams',
  'waffle',
  'wordle',
  'stackdown',
  'scrabble',
  'boggle',
  'crosswords',
]

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
  globalIgnores(['dist', 'supabase/functions/boggle-build-board/wordlist.ts']),
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
