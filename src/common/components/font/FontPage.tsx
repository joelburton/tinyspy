// cs-unmet

import { useState, type CSSProperties } from 'react'
import { cls } from '../../lib/util/cls'
import { FONT, GRADES, LINE, SAMPLE, SIZES, TILE_WORDS, WEIGHTS, WIDTHS } from './fontSpecimen'
import styles from './FontPage.module.css'

/**
 * The font page — the app's face, shown doing the jobs this app asks of it.
 *
 * The twin of `/palette`, and for the same reason: a decision you cannot look
 * at is a decision nobody can check. Type `/font` to see it; it is not linked
 * from anywhere, needs no session, and renders nothing but text.
 *
 * WHAT TO LOOK AT, in the order the page runs:
 *
 * - **against the system font** — the honest baseline, because every size in
 *   this app was tuned by eye against the system face. The question is not
 *   "is this nice" but "is this better, or merely different";
 * - **width** — the one that motivated the whole exercise. A word on a
 *   psychicnum or connections tile can only get SMALLER today. Narrower at
 *   full size is the alternative, and the tile row is where to judge how far
 *   it can go before it stops reading;
 * - **grade** — ink without width. The right edges of those lines are
 *   identical, which is the whole point: it can change on a dark page without
 *   moving a single character. Open the page in midnight to judge it, because
 *   it is a correction for exactly that;
 * - **slant** — we use italics in nine places, one of which carries meaning
 *   (crosswords renders `<em>` out of the puzzle source). This font has no
 *   drawn italic, so the question is whether its own slant is good enough, and
 *   the third line is what a browser does when it has nothing to work with;
 * - **optical size** — whether text tunes itself usefully across the range
 *   this app spans, from a 0.75rem label to a 3rem tile letter. It is the
 *   dial that costs the most bytes, so it is the one with a decision attached.
 *
 * The top block is live: drag the dials and the specimen follows. That is
 * deliberately first, because a static grid answers the questions someone
 * thought to ask and a live one answers the rest.
 */
export function FontPage() {
  const [size, setSize] = useState(16)
  const [weight, setWeight] = useState(400)
  const [width, setWidth] = useState(100)
  const [grade, setGrade] = useState(0)
  const [slant, setSlant] = useState(0)
  const [optical, setOptical] = useState(true)
  const [boxWidth, setBoxWidth] = useState(9)

  /**
   * The playground drives every dial through `font-variation-settings`, which
   * is the low-level control and wins for the axes it names. Optical size is
   * deliberately NOT named there — leaving it out is what keeps the browser's
   * automatic behavior in play, so the toggle below has something to toggle.
   */
  const live: CSSProperties = {
    fontSize: `${size}px`,
    fontVariationSettings: `'wght' ${weight}, 'wdth' ${width}, 'GRAD' ${grade}, 'slnt' ${slant}`,
    fontOpticalSizing: optical ? 'auto' : 'none',
  }

  return (
    <div className={cls('card', styles.page)}>
      <h1>Font — {FONT.family}</h1>
      <p className={cls('muted', styles.systemFont)}>
        <strong>{FONT.family}</strong> is the app's font now — everything on this page is set in it
        except this paragraph, which is pinned to the system font so there is always a baseline on
        screen. Served from <code>{FONT.file}</code> ({FONT.sizeKB} KB), built by{' '}
        <code>scripts/subset-font.py</code>.{' '}
        <a href="/font?theme=daylight">daylight</a> · <a href="/font?theme=midnight">midnight</a>
      </p>

      <div className={cls(styles.costs, styles.systemFont)}>
        {FONT.costs.map((c) => (
          <span key={c.dials}>
            {c.dials}: <strong>{c.kb} KB</strong>
          </span>
        ))}
      </div>

      <div>
        {/* ── The live one ─────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Every dial at once</h2>
          </div>

          <div className={styles.controls}>
            <label className={styles.control}>
              size <span className={styles.controlValue}>{size}px</span>
              <input
                type="range"
                min={8}
                max={96}
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
              />
            </label>
            <label className={styles.control}>
              weight <span className={styles.controlValue}>{weight}</span>
              <input
                type="range"
                min={100}
                max={1000}
                step={25}
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
              />
            </label>
            <label className={styles.control}>
              width <span className={styles.controlValue}>{width}%</span>
              <input
                type="range"
                min={25}
                max={151}
                step={0.5}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
            </label>
            <label className={styles.control}>
              grade <span className={styles.controlValue}>{grade}</span>
              <input
                type="range"
                min={-200}
                max={150}
                step={10}
                value={grade}
                onChange={(e) => setGrade(Number(e.target.value))}
              />
            </label>
            <label className={styles.control}>
              slant <span className={styles.controlValue}>{slant}°</span>
              <input
                type="range"
                min={-10}
                max={0}
                value={slant}
                onChange={(e) => setSlant(Number(e.target.value))}
              />
            </label>
            <label className={styles.control}>
              tile box <span className={styles.controlValue}>{boxWidth}rem</span>
              <input
                type="range"
                min={4}
                max={20}
                step={0.5}
                value={boxWidth}
                onChange={(e) => setBoxWidth(Number(e.target.value))}
              />
            </label>
            <label className={styles.control}>
              <span>
                optical <span className={styles.controlValue}>{optical ? 'auto' : 'off'}</span>
              </span>
              <input
                type="checkbox"
                checked={optical}
                onChange={(e) => setOptical(e.target.checked)}
              />
            </label>
          </div>

          <div className={styles.stage}>
            <div style={live}>{SAMPLE}</div>
            <div className={styles.tileRow}>
              {TILE_WORDS.map((word) => (
                <div key={word} className={styles.tile} style={{ width: `${boxWidth}rem` }}>
                  <span style={live}>{word}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Against the system font ──────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Against the system font</h2>
            <span className={styles.rowLabel}>
              Same words, same size. The top line is what the app looked like before this landed. The width
              slider above drives the bottom line, and the reason to reach for it here is that
              this face sets NARROWER than the system one — so the comparison to make is not only
              against 100%. Somewhere a little above it is the width at which the two hold the
              same amount of text, and that is a candidate for the app's resting width rather
              than a squeeze.
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>system-ui</span>
            <span className={styles.systemFont}>{SAMPLE}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>
              {FONT.family} · {width}%
            </span>
            <span style={{ fontStretch: `${width}%` }}>{SAMPLE}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{FONT.family} · 100%</span>
            <span>{SAMPLE}</span>
          </div>
        </section>

        {/* ── Sizes ────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Sizes</h2>
            <span className={styles.rowLabel}>
              The three steps of the font-size vocabulary, and the sizes above them.
            </span>
          </div>
          {SIZES.map((s) => (
            <div key={s.label} className={styles.row}>
              <span className={styles.rowLabel}>
                {s.label} · {s.css}
              </span>
              <span style={{ fontSize: s.css }}>{LINE}</span>
            </div>
          ))}
        </section>

        {/* ── Weights ──────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Weights</h2>
            <span className={styles.rowLabel}>
              Greyed rows are hundreds the app does not currently write.
            </span>
          </div>
          {WEIGHTS.map((w) => (
            <div key={w.w} className={styles.row}>
              <span className={cls(styles.rowLabel, !w.used && styles.unused)}>
                {w.w}
                {w.used ? '' : ' · unused'}
              </span>
              <span style={{ fontWeight: w.w }}>{LINE}</span>
            </div>
          ))}
        </section>

        {/* ── Width ────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Width</h2>
            <span className={styles.rowLabel}>
              The same line squeezed. Somewhere down this list it stops reading as ordinary text
              and starts reading as condensed — that boundary is the number worth knowing.
            </span>
          </div>
          {WIDTHS.map((w) => (
            <div key={w} className={styles.row}>
              <span className={styles.rowLabel}>{w}%</span>
              <span style={{ fontStretch: `${w}%` }}>{LINE}</span>
            </div>
          ))}
        </section>

        {/* ── The tile problem ─────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>The tile problem</h2>
            <span className={styles.rowLabel}>
              A fixed box, a word too long for it. Today the only lever is the first row: make the
              text smaller. The rows under it keep the text at full size and take the space out of
              the letters instead.
            </span>
          </div>
          {[
            { label: 'shrink · 0.7rem', style: { fontSize: '0.7rem' } },
            { label: 'squeeze · 80%', style: { fontSize: '1.1rem', fontStretch: '80%' } },
            { label: 'squeeze · 62.5%', style: { fontSize: '1.1rem', fontStretch: '62.5%' } },
            { label: 'both · 75% + 0.9rem', style: { fontSize: '0.9rem', fontStretch: '75%' } },
          ].map((variant) => (
            <div key={variant.label} className={styles.row}>
              <span className={styles.rowLabel}>{variant.label}</span>
              <div className={styles.tileRow}>
                {TILE_WORDS.map((word) => (
                  <div key={word} className={styles.tile} style={{ width: `${boxWidth}rem` }}>
                    <span style={variant.style as CSSProperties}>{word}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* ── Grade ────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Grade</h2>
            <span className={styles.rowLabel}>
              Ink without width — every line below ends at exactly the same place. Judge it in
              midnight, where light text on a dark ground reads heavier than the same weight does
              here.
            </span>
          </div>
          {GRADES.map((g) => (
            <div key={g} className={styles.row}>
              <span className={styles.rowLabel}>
                GRAD {g > 0 ? `+${g}` : g}
                {g === 0 ? ' · as drawn' : ''}
              </span>
              <span style={{ fontVariationSettings: `'GRAD' ${g}` }}>{LINE}</span>
            </div>
          ))}
        </section>

        {/* ── Slant ────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Slant, and the italic we do not have</h2>
            <span className={styles.rowLabel}>
              The third line is the browser inventing an italic by skewing the upright letters,
              which is what we would get if we never asked for the slant dial.
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>upright</span>
            <span>singer of Heigh-Ho? (5)</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>slnt −10 · the font's own</span>
            <span style={{ fontVariationSettings: `'slnt' -10` }}>singer of Heigh-Ho? (5)</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>synthesized italic</span>
            <span style={{ fontStyle: 'italic' }}>singer of Heigh-Ho? (5)</span>
          </div>
        </section>

        {/* ── Optical size ─────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Optical size</h2>
            <span className={styles.rowLabel}>
              Each pair is the same text at the same size — once with the font adjusting itself to
              that size, once pinned to its default drawing. This is the dial that costs 156 KB, so
              the question is whether the pairs differ enough to buy.
            </span>
          </div>
          {['0.75rem', '1rem', '3rem'].map((css) => (
            <div key={css}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{css} · auto</span>
                <span style={{ fontSize: css, fontOpticalSizing: 'auto' }}>{LINE}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{css} · pinned</span>
                <span style={{ fontSize: css, fontOpticalSizing: 'none' }}>{LINE}</span>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
