// cs-unmet

/**
 * SPELLING IS AMERICAN — everywhere, and checked rather than remembered.
 *
 * The rule is the first line of CLAUDE.md and has been for months. It was swept
 * once and then decayed: by 2026-08-28 there were 150 British spellings across
 * 89 files, in comments, test names, CSS, docs, plans and one piece of UI copy a
 * player reads. Nothing had gone wrong; nothing had checked.
 *
 * That is the same finding as `--radius-md` rotting while the guarded color
 * tokens did not. A convention with a guard holds; a convention with a note
 * about it decays at whatever rate people forget, which for prose written at
 * length is fast — the writer is thinking about the sentence, not the letters.
 * An author who gets `--outcomes-won-ink-color` right a dozen times can write
 * "colour" in the line beside it, because the token made them look at the
 * string and the sentence did not.
 *
 * ─── Why a LIST and not a pattern ────────────────────────────
 *
 * Every entry below is a word that is actually wrong. There is no `-ise` rule,
 * because `advertise`, `surprise`, `compromise`, `otherwise` and two dozen more
 * are correct in both spellings; a pattern would flag them and the allowlist
 * needed to quiet it would be longer than this map. Same for the doubled `l`:
 * `controlled` and `compelled` are correct everywhere, `cancelled` is not.
 *
 * The list does not have to be exhaustive to work. It has to cover the words
 * this codebase actually reaches for, and it grows when one gets through.
 *
 * ─── Why there are no prose exemptions ───────────────────────
 *
 * A doc explaining this rule wants to SAY "colour" as the example of what not to
 * write — and then the guard needs an exemption, and the exemption is a hole
 * shaped exactly like the thing being guarded. So CLAUDE.md states the rule by
 * pattern instead (`-or` over `-our`), and where an example is genuinely needed,
 * the instruction is to reach for a rarity this list omits — `gaol`,
 * `connexion`. Those will never be written by accident, so leaving them out
 * costs nothing and buys an absolute list.
 *
 * WORD DATA is the one exemption, and it is not a hole: a dictionary containing
 * `LITRE` is correct, and a puzzle whose answer is `SOMBRERO` is not a spelling
 * choice anyone made.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * Files whose CONTENT is words rather than prose about words. A dictionary, a
 * puzzle's answers, a solver's expected output — British spellings in these are
 * data, and "correcting" them would break the fixtures they exist to pin.
 */
const WORD_DATA = ['supabase/data/', '.fixture.ts', '.jsonl']

/** Binary and generated files, where a match would be a coincidence of bytes. */
const NOT_TEXT = ['.png', '.jpg', '.ico', '.puz', '.ipuz', '.woff', '.woff2', '.ttf']

/**
 * THIS FILE, which is the only prose exemption and cannot not be: the map below
 * spells out every British form on purpose, so a guard that read itself would
 * report a hundred hits and never pass. Nothing else is exempt — see the header
 * for why a doc wanting to SHOW a British spelling reaches for `gaol` instead.
 */
const SELF = 'src/guards/americanSpelling.test.ts'

/** British → American. Explicit pairs; see the header for why not a pattern. */
const PAIRS: Record<string, string> = {
  // -our → -or
  colour: 'color', colours: 'colors', coloured: 'colored', colouring: 'coloring',
  colourful: 'colorful', behaviour: 'behavior', behaviours: 'behaviors',
  behavioural: 'behavioral', favour: 'favor', favours: 'favors', favoured: 'favored',
  favourite: 'favorite', favourites: 'favorites', honour: 'honor', honours: 'honors',
  honoured: 'honored', labour: 'labor', labours: 'labors', neighbour: 'neighbor',
  neighbours: 'neighbors', neighbouring: 'neighboring', neighbourhood: 'neighborhood',
  humour: 'humor', rumour: 'rumor', armour: 'armor', flavour: 'flavor',
  flavours: 'flavors', vapour: 'vapor', harbour: 'harbor', endeavour: 'endeavor',
  vigour: 'vigor', splendour: 'splendor',
  // -re → -er
  centre: 'center', centres: 'centers', centred: 'centered', centring: 'centering',
  metre: 'meter', metres: 'meters', theatre: 'theater', litre: 'liter', litres: 'liters',
  fibre: 'fiber', fibres: 'fibers', calibre: 'caliber', lustre: 'luster',
  sombre: 'somber', spectre: 'specter', manoeuvre: 'maneuver',
  // -ise → -ize, -yse → -yze
  organise: 'organize', organised: 'organized', organising: 'organizing',
  organisation: 'organization', recognise: 'recognize', recognised: 'recognized',
  recognises: 'recognizes', recognising: 'recognizing', realise: 'realize',
  realised: 'realized', realises: 'realizes', realising: 'realizing',
  apologise: 'apologize', apologised: 'apologized', summarise: 'summarize',
  summarised: 'summarized', categorise: 'categorize', categorised: 'categorized',
  normalise: 'normalize', normalised: 'normalized', normalisation: 'normalization',
  initialise: 'initialize', initialised: 'initialized', minimise: 'minimize',
  minimised: 'minimized', maximise: 'maximize', maximised: 'maximized',
  optimise: 'optimize', optimised: 'optimized', prioritise: 'prioritize',
  prioritised: 'prioritized', specialise: 'specialize', standardise: 'standardize',
  utilise: 'utilize', emphasise: 'emphasize', analyse: 'analyze', analysed: 'analyzed',
  analyses: 'analyzes', analysing: 'analyzing', paralyse: 'paralyze',
  // -ce → -se
  licence: 'license', defence: 'defense', offence: 'offense', pretence: 'pretense',
  // doubled l where American keeps one
  cancelled: 'canceled', cancelling: 'canceling', travelling: 'traveling',
  travelled: 'traveled', labelled: 'labeled', labelling: 'labeling',
  modelling: 'modeling', modelled: 'modeled', signalled: 'signaled',
  fuelled: 'fueled', marvellous: 'marvelous', levelled: 'leveled',
  // single l where American doubles
  fulfil: 'fulfill', fulfils: 'fulfills', skilful: 'skillful', wilful: 'willful',
  appal: 'appall', distil: 'distill', enrol: 'enroll',
  // the rest
  grey: 'gray', greys: 'grays', greyed: 'grayed', greying: 'graying',
  greyscale: 'grayscale', judgement: 'judgment', judgements: 'judgments',
  acknowledgement: 'acknowledgment', ageing: 'aging', draught: 'draft',
  storey: 'story', tyre: 'tire', plough: 'plow', sceptic: 'skeptic',
  sceptical: 'skeptical', mould: 'mold', smoulder: 'smolder', moustache: 'mustache',
  cheque: 'check', programme: 'program', aluminium: 'aluminum', whilst: 'while',
  learnt: 'learned', spelt: 'spelled', burnt: 'burned', dreamt: 'dreamed',
  speciality: 'specialty', orientated: 'oriented', practise: 'practice',
}

const RX = new RegExp(
  `\\b(${Object.keys(PAIRS).sort((a, b) => b.length - a.length).join('|')})\\b`,
  'gi',
)

/** Every file git tracks, minus data and binaries. */
function textFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => f !== SELF)
    .filter((f) => !WORD_DATA.some((k) => f.includes(k)))
    .filter((f) => !NOT_TEXT.some((e) => f.endsWith(e)))
}

describe('American spelling', () => {
  it('finds files to read at all', () => {
    // Without this, a broken `git ls-files` would make the guard below pass
    // while checking nothing — the failure mode a guard must not have.
    expect(textFiles().length).toBeGreaterThan(400)
  })

  it('has no British spelling anywhere outside word data', () => {
    const found: string[] = []
    for (const f of textFiles()) {
      let src: string
      try {
        src = readFileSync(join(ROOT, f), 'utf8')
      } catch {
        continue // a symlink or a file git knows and disk does not
      }
      src.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(RX)) {
          const brit = m[0].toLowerCase()
          found.push(`${f}:${i + 1}  ${m[0]} → ${PAIRS[brit]}`)
        }
      })
    }
    expect(found, 'CLAUDE.md: spelling is American, everywhere').toEqual([])
  })

  it('maps every entry to something different', () => {
    // A typo in the map — `colour: 'colour'` — would make that word
    // unfixable-looking: the guard reports it and the fix it suggests is the
    // thing it just rejected.
    const same = Object.entries(PAIRS).filter(([brit, amer]) => brit === amer)
    expect(same, 'a pair whose "fix" is the same word').toEqual([])
  })

  it('never lists an American spelling as the British one', () => {
    // The other direction of the same typo, and worse: it would demand a
    // British spelling in place of a correct American one.
    const inverted = Object.keys(PAIRS).filter((brit) => Object.values(PAIRS).includes(brit))
    expect(inverted, 'a key that is itself an American spelling').toEqual([])
  })
})
