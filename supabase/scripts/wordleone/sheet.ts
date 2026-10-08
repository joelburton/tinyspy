#!/usr/bin/env -S npx tsx
// cs-unmet

/**
 * A printable sheet of Wordle in 1 puzzles, to try by hand before any game
 * code exists (plans/wordleone.md → First step). This is
 * `npm run _wordleone:sheet`; it writes one HTML page to STDOUT and its
 * progress to stderr, so the page lands wherever the shell sends it:
 *
 *   npm run _wordleone:sheet -- [perCell] [seed] > ~/Downloads/wordleone-sheet.html
 *
 *   perCell  puzzles per band × tier cell (default 4)
 *   seed     first seed; the sheet is reproducible from it (default 1)
 *
 * The cards are blind: each shows its number, its band and the starter's
 * five colored tiles, with an empty row to write in. A card's answer sits AT
 * its band, not at or below it (`answerAtBand`), so a band-6 card is a band-6
 * word and not a band-1 word unique among band 6. The tier is on the key,
 * the last page, beside the answer and the generator's scores, so a rating by
 * hand can be compared with the tier the generator assigned rather than led
 * by it. The card order is shuffled for the same reason.
 *
 * Played in a browser rather than on paper, each card's rating and miss count
 * are live inputs, and the box at the foot of the page encodes every entry as
 * one line per card (`#n tier misses`) to paste back; see `SCRIPT`.
 *
 * Reads the five-letter words from `common.words` over psql (`SUPABASE_DB_URL`,
 * default the local stack); needs a seeded list (`gmake all-words ENV=local`).
 */

import { execFileSync } from 'node:child_process'
import { mulberry32 } from '../../../src/common/utils/mulberry32.ts'
import { buildPuzzle, type Puzzle, type Tier, type WordRow } from '../../functions/wordleone-build-board/gen.ts'

const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const PER_CELL = Number(process.argv[2] ?? 4)
const SEED = Number(process.argv[3] ?? 1)
if (!Number.isInteger(PER_CELL) || PER_CELL < 1 || !Number.isInteger(SEED)) {
  console.error('usage: npm run _wordleone:sheet -- [perCell] [seed] > sheet.html')
  process.exit(1)
}

/** Bands 5 and 6 are nearly one pool, so the sheet samples the plan's five. */
const BANDS = [1, 2, 3, 4, 6]
const TIERS: Tier[] = ['easy', 'medium', 'hard']

// ─── The words ──────────────────────────────────────────────
const raw = execFileSync(
  'psql',
  [
    '-X', // skip ~/.psqlrc, whose echoed settings would read as rows
    DB_URL,
    '-tAc',
    `select word, band, wordle, (slur = 0 and crude = 0 and american and not slang), coalesce(root_word, '')
       from common.words where len = 5 order by word`,
  ],
  { encoding: 'utf8' },
)
const words: WordRow[] = raw
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [word, band, isAnswerList, isClean, root] = line.split('|')
    return { word, band: Number(band), isAnswerList: isAnswerList === 't', isClean: isClean === 't', root: root || null }
  })
if (words.length === 0) {
  console.error('No five-letter words found — run `gmake all-words ENV=local` first.')
  process.exit(1)
}
console.error(`${words.length} five-letter words`)

// ─── The puzzles ────────────────────────────────────────────
interface Card {
  n: number
  band: number
  puzzle: Puzzle
}

const puzzles: Array<{ band: number; puzzle: Puzzle }> = []
// A starter or an answer seen once on the sheet would give the second card away.
const seen = new Set<string>()
let k = 0
for (const band of BANDS) {
  for (const tier of TIERS) {
    let made = 0
    let attempts = 0
    while (made < PER_CELL && attempts < PER_CELL * 10) {
      attempts++
      const puzzle = buildPuzzle(words, { answerBand: band, tier, random: mulberry32(SEED + k++), answerAtBand: true })
      if (puzzle === null) continue
      if (seen.has(puzzle.starter) || seen.has(puzzle.answer)) continue
      seen.add(puzzle.starter)
      seen.add(puzzle.answer)
      puzzles.push({ band, puzzle })
      made++
    }
    console.error(`band ${band} ${tier.padEnd(6)} ${made}/${PER_CELL}`)
  }
}

// Shuffle the cards so the tiers interleave; the key is in card order.
const random = mulberry32(SEED)
for (let i = puzzles.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1))
  ;[puzzles[i], puzzles[j]] = [puzzles[j], puzzles[i]]
}
const cards: Card[] = puzzles.map((p, i) => ({ n: i + 1, ...p }))

// ─── The page ───────────────────────────────────────────────
/** The fills are wordle's (`src/common/core-css/fixed.css`), copied because this page has no stylesheet. */
const FILL: Record<string, string> = { g: '#66a45f', y: '#bd9f35', x: '#8b8f91' }

const tiles = (word: string, colors: string | null) =>
  [...word]
    .map((ch, i) =>
      colors === null
        ? `<span class="tile blank"></span>`
        : `<span class="tile" style="background:${FILL[colors[i]]}">${ch.toUpperCase()}</span>`,
    )
    .join('')

const cardHtml = (c: Card) => `
  <div class="card">
    <div class="head"><b>#${c.n}</b> <span class="band">band ${c.band}</span></div>
    <div class="row">${tiles(c.puzzle.starter, c.puzzle.colors)}</div>
    <div class="row">${tiles('     ', null)}</div>
    <div class="notes">misses <input class="misses" type="number" min="0" max="9" data-n="${c.n}"></div>
    <div class="notes">rating ${TIERS.map((t) => `<label><input type="radio" name="r${c.n}" value="${t}" data-n="${c.n}"> ${t}</label>`).join(' ')}</div>
  </div>`

/**
 * Keeps the ratings: every tick or miss count is written to the box at the
 * foot of the page as one line per rated card (`#n tier misses`), ready to
 * paste, and to localStorage under the sheet's seed so a reload keeps them.
 * Plain JS in a plain string: no `${}` here, so the page template leaves it be.
 */
const SCRIPT = `
  var KEY = 'wordleone-sheet-' + document.body.dataset.seed + '-' + document.body.dataset.perCell;
  var out = document.getElementById('ratings');
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  document.querySelectorAll('input[data-n]').forEach(function (el) {
    var s = saved[el.dataset.n];
    if (!s) return;
    if (el.type === 'radio') el.checked = el.value === s.tier;
    else el.value = s.misses || '';
  });
  function render() {
    var byCard = {};
    document.querySelectorAll('input[data-n]').forEach(function (el) {
      var n = el.dataset.n;
      byCard[n] = byCard[n] || {};
      if (el.type === 'radio') { if (el.checked) byCard[n].tier = el.value; }
      else if (el.value !== '') byCard[n].misses = el.value;
    });
    var lines = [];
    Object.keys(byCard).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
      var r = byCard[n];
      if (r.tier === undefined && r.misses === undefined) return;
      lines.push('#' + n + ' ' + (r.tier || '-') + ' ' + (r.misses === undefined ? '-' : r.misses));
    });
    out.value = 'wordleone sheet seed ' + document.body.dataset.seed + ', ' + document.body.dataset.perCell + ' per cell\\n' + lines.join('\\n');
    try { localStorage.setItem(KEY, JSON.stringify(byCard)); } catch (e) {}
  }
  document.addEventListener('input', render);
  out.addEventListener('focus', function () { out.select(); });
  render();
`

const keyRow = (c: Card) =>
  `<tr><td>#${c.n}</td><td>${c.puzzle.starter.toUpperCase()}</td><td class="mono">${c.puzzle.colors}</td><td><b>${c.puzzle.answer.toUpperCase()}</b></td><td>${c.band}</td><td>${c.puzzle.tier}</td><td>${c.puzzle.greens}g ${c.puzzle.yellows}y</td><td>${c.puzzle.positiveSpace}</td><td>${c.puzzle.loadBearing}</td></tr>`

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Wordle in 1 — sheet (seed ${SEED})</title>
<style>
  @page { size: letter; margin: 0.5in; }
  * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body { font: 11pt/1.3 -apple-system, system-ui, sans-serif; color: #222; margin: 0; }
  h1 { font-size: 14pt; margin: 0 0 6pt; }
  p.rules { margin: 0 0 10pt; color: #444; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10pt 14pt; }
  .card { break-inside: avoid; border: 1px solid #ccc; border-radius: 4pt; padding: 6pt 8pt; }
  .head { display: flex; justify-content: space-between; margin-bottom: 4pt; }
  .band { color: #666; }
  .row { display: flex; gap: 3pt; margin: 3pt 0; }
  .tile { width: 26pt; height: 26pt; display: inline-flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 15pt; color: #fff; border-radius: 2pt; }
  .tile.blank { background: #fff; border: 1.5pt solid #d3d6da; }
  .notes { color: #666; font-size: 9pt; margin-top: 4pt; }
  .notes label { margin-right: 6pt; }
  .misses { width: 3em; font: inherit; }
  .key { break-before: page; }
  .ratings { margin-top: 14pt; }
  #ratings { width: 100%; max-width: 480pt; height: 160pt; font: 9.5pt ui-monospace, Menlo, monospace; }
  table { border-collapse: collapse; font-size: 9.5pt; }
  td, th { padding: 1.5pt 8pt 1.5pt 0; text-align: left; }
  th { border-bottom: 1px solid #999; }
  .mono { font-family: ui-monospace, Menlo, monospace; }
</style>
</head>
<body data-seed="${SEED}" data-per-cell="${PER_CELL}">
<h1>Wordle in 1 — ${cards.length} puzzles (seed ${SEED}, ${PER_CELL} per band × tier)</h1>
<p class="rules">The colored row is a starter word scored against a hidden five-letter word: green right letter right spot,
yellow in the word elsewhere, gray not in the word. Exactly one word at or below the card's band fits. Write it in the empty
row, count your misses, and rate it. The key is on the last page.</p>
<div class="cards">${cards.map(cardHtml).join('')}</div>
<div class="key">
<h1>Key</h1>
<table>
<tr><th>#</th><th>starter</th><th>colors</th><th>answer</th><th>band</th><th>tier</th><th>greens / yellows</th><th>positive space</th><th>load-bearing</th></tr>
${cards.map(keyRow).join('\n')}
</table>
</div>
<div class="ratings">
<h1>Ratings</h1>
<p class="rules">One line per rated card: number, tier ticked, misses entered (<span class="mono">-</span> for neither). Copy and paste the box.</p>
<textarea id="ratings" readonly></textarea>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`
process.stdout.write(html)
console.error(`${cards.length} puzzles on the sheet`)
