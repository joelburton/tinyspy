// cs-unmet

/**
 * Every key the app answers, grouped by where it is handled — read from the
 * code, so it cannot go stale:
 *
 *     gmake dev-keys          (or: npx tsx scripts/list-keys.ts)
 *
 * A key is one of two kinds of row, and both are found by grepping for the
 * row's id as a literal:
 *
 *   - an **action** (`ACTIONS` in `common/actions/registry.ts`), which a
 *     surface offers by calling `useBoundAction('act-…')`;
 *   - a **component key** (`COMPONENT_KEYS` in
 *     `common/keyboard/componentKeys.ts`) — a list's arrows, a ring's Tab,
 *     Escape — which the component handling it names as `'keys-…'` when it
 *     matches or offers it.
 *
 * Each id is grouped by the folder of the file that names it:
 *
 *   - **Everywhere** — `AppActionsHost`, mounted once at the app root.
 *   - **Home page**, **Club page**, **Every game page** — `common/home`,
 *     `common/club` and `common/game-page`. The last includes the standard
 *     actions each game calls `useStandardGameActions` for, so a game that
 *     offers no Concede still shows it here.
 *   - **Every game**, then **each game** — `src/<game>/`; an id all of the
 *     games name is listed once, under Every game.
 *   - **Shared** — any other folder, listed with the games and pages that
 *     reach it through their imports.
 *
 * A listed key is one a surface CAN answer: an action's `describe()` may hide
 * it at a given moment (a coop-only action in a race), which reading the code
 * cannot say. A component key marked "not in Help" works only inside
 * something Help cannot be open beside — an open menu, crosswords' rebus box.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { ACTIONS, type ActionId } from '../src/common/actions/registry'
import { COMPONENT_KEYS, type ComponentKeyId } from '../src/common/keyboard/componentKeys'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')
const TABLE = join(SRC, 'common/keyboard/componentKeys.ts')

type RowId = ActionId | ComponentKeyId

/** Every source file in `src/`, tests and fixtures left out. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    const isSource = /\.tsx?$/.test(name) && !/\.(test|fixture|fake)\.tsx?$/.test(name) && !name.endsWith('.d.ts')
    return isSource ? [path] : []
  })
}

/** An import specifier, resolved to a file in `src/`, or null for a package or a stylesheet. */
function resolveImport(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec)
  else return null
  for (const candidate of [`${base}.ts`, `${base}.tsx`, base]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate
  }
  return null
}

// An action binding names its id as a literal — with one exception, the
// board-cursor hook, whose caller hands its commit action in as `commit: 'act-…',`.
const ACTION = /(?:useBoundAction\(\s*|commit:\s*)'(act-[a-z-]+)'\s*,/g
const COMPONENT_KEY = /'(keys-[a-z-]+)'/g
const IMPORT = /(?:from\s+|import\s*\(\s*)'([^']+)'/g

/** The source with its comments blanked, so a docstring's example is not a use. */
const code = (path: string) =>
  readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const GAMES = readdirSync(SRC).filter((name) => existsSync(join(SRC, name, 'manifest.ts')))

/** The group a file belongs to, by its folder. */
function groupOf(path: string): string {
  const rel = relative(SRC, path)
  if (rel === 'common/actions/AppActionsHost.tsx') return 'Everywhere'
  if (rel.startsWith('common/home/')) return 'Home page'
  if (rel.startsWith('common/club/')) return 'Club page'
  if (rel.startsWith('common/game-page/')) return 'Every game page'
  const top = rel.split('/')[0]
  if (GAMES.includes(top)) return top
  return `Shared: ${dirname(rel)}`
}

const files = sourceFiles(SRC)
const found = new Map<string, Set<RowId>>() // group → ids
const sharedFiles = new Map<string, string>() // shared file naming an id → its group
const importers = new Map<string, string[]>() // file → the files that import it

function record(path: string, id: RowId): void {
  const group = groupOf(path)
  if (!found.has(group)) found.set(group, new Set())
  found.get(group)!.add(id)
  if (group.startsWith('Shared: ')) sharedFiles.set(path, group)
}

for (const path of files) {
  const text = code(path)
  for (const m of text.matchAll(ACTION)) {
    const id = m[1] as ActionId
    if (!(id in ACTIONS)) throw new Error(`${relative(ROOT, path)} binds ${id}, which the registry has no row for`)
    if ((ACTIONS[id].keys ?? []).length > 0) record(path, id)
  }
  if (path !== TABLE) {
    for (const m of text.matchAll(COMPONENT_KEY)) {
      const id = m[1] as ComponentKeyId
      if (!(id in COMPONENT_KEYS)) throw new Error(`${relative(ROOT, path)} names ${id}, which componentKeys.ts has no row for`)
      record(path, id)
    }
  }
  for (const m of text.matchAll(IMPORT)) {
    const target = resolveImport(path, m[1])
    if (target) importers.set(target, [...(importers.get(target) ?? []), path])
  }
}

/**
 * For a shared group: the games and pages whose files reach one of its files,
 * walking importers upward. A game's file is where the walk stops — past it is
 * only the registry that lists every game.
 */
function usedBy(group: string): string[] {
  const users = new Set<string>()
  const seen = new Set<string>()
  const stack = [...sharedFiles].filter(([, g]) => g === group).map(([path]) => path)
  while (stack.length > 0) {
    const path = stack.pop()!
    if (seen.has(path)) continue
    seen.add(path)
    const owner = groupOf(path)
    if (!owner.startsWith('Shared: ') && owner !== 'Everywhere') {
      users.add(owner)
      if (GAMES.includes(owner)) continue
    }
    stack.push(...(importers.get(path) ?? []))
  }
  return [...users].sort()
}

// An id every game names is said once, under Every game.
const gameSets = GAMES.map((game) => found.get(game) ?? new Set<RowId>())
const everyGame = new Set([...gameSets[0]].filter((id) => gameSets.every((s) => s.has(id))))
found.set('Every game', everyGame)
for (const set of gameSets) everyGame.forEach((id) => set.delete(id))

/** A key label as markdown code — fenced wider when the key IS a backtick. */
const codeSpan = (label: string) => (label.includes('`') ? `\`\` ${label} \`\`` : `\`${label}\``)

/** One row of a table: the keys, what they do, the id. Actions first, in
 *  registry order, then component keys in table order. */
function rows(ids: Set<RowId>): string[] {
  const actions = (Object.keys(ACTIONS) as ActionId[]).filter((id) => ids.has(id)).map((id) => {
    const keys = ACTIONS[id].keys!.map((k) => codeSpan(k.label)).join(' / ')
    return `| ${keys} | ${ACTIONS[id].label} | ${id} |`
  })
  const components = (Object.keys(COMPONENT_KEYS) as ComponentKeyId[]).filter((id) => ids.has(id)).map((id) => {
    const row = COMPONENT_KEYS[id]
    const keys = row.keys.map((k) => codeSpan(k.label)).join(' / ')
    return `| ${keys} | ${row.label}${row.inHelp ? '' : ' *(not in Help)*'} | ${id} |`
  })
  return [...actions, ...components]
}

function section(group: string): string {
  const body = rows(found.get(group) ?? new Set())
  const lede = group.startsWith('Shared: ') ? `Used by: ${usedBy(group).join(', ')}\n\n` : ''
  const table = body.length > 0 ? ['| key | what it does | id |', '|---|---|---|', ...body].join('\n') : '*(no keys)*'
  return `## ${group}\n\n${lede}${table}\n`
}

const shared = [...found.keys()].filter((g) => g.startsWith('Shared: ')).sort()
const groups = ['Everywhere', 'Home page', 'Club page', 'Every game page', 'Every game', ...[...GAMES].sort(), ...shared]
console.log(groups.map(section).join('\n'))
