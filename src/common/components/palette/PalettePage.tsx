import { FAMILIES, tokenOf, type Family, type Member } from './palette'
import styles from './PalettePage.module.css'

/**
 * The palette page — every color family, laid out members × variants.
 *
 * Two things to look at:
 *
 * - **Down a column**: does this variant mean the same thing in every member?
 *   (Do the five terminal frames read as one band treatment, or does one shout?)
 * - **Across a row**: is this member a family, or five unrelated colors that
 *   happen to share a name?
 *
 * A cell shows the swatch, the token, the resolved value and the FORMULA. The
 * value because a token whose value you can't see is a token you can't check;
 * the formula because a value without one is stranded — "change the base and let
 * the rest follow" stops being true the moment nobody can say what followed. It
 * also makes an exception legible: four outcome inks near base −0.115 with
 * `near` at −0.037 is a story about gold, and it only reads when the numbers sit
 * in a column under each other.
 *
 * The value is written straight into the node by a ref callback rather than held
 * in state: it comes from `getComputedStyle`, which can only be read after the
 * browser has resolved the cascade, and the alternative is a `useEffect` that
 * calls `setState` — which this repo bans outright (docs/code-conventions.md).
 *
 * EVERY FAMILY RENDERS TWICE. The grid of squares answers "is this a
 * rectangle?"; the strip below it answers "does this value do its job?". Both
 * are needed and neither substitutes: an ink at base −10% is a perfectly good
 * chip and can still fail the moment it is small text on a white page, which is
 * the orange lesson and is invisible on a swatch. So an ink is drawn as text at
 * real size, a bar as a 7px segment in a list row, a fill and its edge as a
 * tile, a wash as a pill with words in it.
 *
 * `base` is drawn too, struck through and labelled — it is the anchor every
 * other cell derives from and NOTHING paints it, so a demo that quietly omitted
 * it would be hiding the one cell whose whole nature is not being used.
 *
 * Not linked from anywhere, but it ships and it needs no session: type `/palette`
 * when you want to see a family. There is nothing to protect — it renders tokens,
 * not data. It lives in `src/` rather than as a static page in `docs/` for a
 * second reason: being real source is what makes it the reader that proves a
 * reserved cell is not dead code. See `palette.ts`.
 */
export function PalettePage() {
  return (
    <div className={`card ${styles.page}`}>
      <h1>Palette</h1>
      <p className={styles.intro}>
        Every color family in <code>common/themes/daylight.css</code>. A member missing a variant is a
        bug in what "family" means — see <code>palette.ts</code>. Read DOWN a column to ask whether a
        variant means the same thing in every member, and ACROSS a row to ask whether a member is a
        family or several unrelated colors sharing a name.
      </p>
      <nav className={styles.index}>
        {FAMILIES.map((f) => (
          <a key={f.name} href={`#${slug(f.name)}`}>
            {f.name}
          </a>
        ))}
      </nav>
      {FAMILIES.map((family) => (
        <FamilyGrid key={family.name} family={family} />
      ))}
    </div>
  )
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '-')

function FamilyGrid({ family }: { family: Family }) {
  return (
    <section className={styles.family} id={slug(family.name)}>
      <h2>
        {family.name}{' '}
        <span className={styles.count}>
          {family.members.length} × {family.variants.length}
        </span>
      </h2>
      <p className={styles.note}>{family.note}</p>
      <div
        className={styles.grid}
        // The one place a number belongs at a use site: the column count is the
        // family's shape, not a style decision.
        style={{ gridTemplateColumns: `max-content repeat(${family.variants.length}, 1fr)` }}
      >
        <div />
        {family.variants.map((v) => (
          <div key={v} className={styles.variantHead}>
            {v}
          </div>
        ))}
        {family.members.map((member) => (
          <Row key={member.name} family={family} name={member.name} cells={member.cells} />
        ))}
      </div>
      <div className={styles.situ}>
        {family.members.map((member) => (
          <div key={member.name} className={styles.situRow}>
            <div className={styles.memberHead}>{member.name}</div>
            <InSitu family={family} member={member} />
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * One member of a family, drawn as the things it actually paints.
 *
 * Every color here arrives as an inline style built from the member's own cells,
 * never from a class — the module holds the SHAPES (a tile is 3rem square with a
 * 2px border) and the family supplies the paint. That split is the same one the
 * app itself uses, and it is also what keeps this file honest: a color literal
 * in PalettePage.module.css would fail the no-unnamed-colors guard, and a color
 * literal here would mean the page had stopped being a view of the theme.
 */
function InSitu({ family, member }: { family: Family; member: Member }) {
  /** A member's cell for one variant, as the `var(--token)` string. */
  const v = (variant: string) => member.cells[family.variants.indexOf(variant)]

  switch (family.demo) {
    case 'outcome':
      return (
        <>
          <Anchor color={v('base')} />
          {/* ink: text at the size a verdict word is actually read at. */}
          <span className={styles.situInk} style={{ color: v('ink') }}>
            {member.name}
          </span>
          {/* fill + edge: a piece, wearing the family's own ink as its label. */}
          <span
            className={styles.situTile}
            style={{ background: v('fill'), borderColor: v('edge'), color: v('ink') }}
          >
            {member.name.slice(0, 2)}
          </span>
          {/* wash: a pill background, with words on it. */}
          <span className={styles.situWash} style={{ background: v('wash'), color: v('ink') }}>
            {member.name} — with words on it
          </span>
          {/* bar: a 7px segment at the left of a log row, which is the only
              place its width is judged. */}
          <span className={styles.situBarRow}>
            <span className={styles.situBar} style={{ background: v('bar') }} />
            <span className={styles.situBarText}>a turn that went {member.name}</span>
          </span>
          {/* terminalFrame: a band around a board, drawn hard against the tiles
              with no whitespace, which is the case it has to survive. */}
          <span className={styles.situBoard} style={{ borderColor: v('terminalFrame') }}>
            <span className={styles.situBoardTile} />
            <span className={styles.situBoardTile} />
            <span className={styles.situBoardTile} />
            <span className={styles.situBoardTile} />
          </span>
        </>
      )

    case 'button':
      return (
        <>
          <Anchor color={v('base')} />
          <span
            className={styles.situButton}
            style={{
              background: v('primary'),
              borderColor: v('primary'),
              color: v('primary-ink'),
            }}
          >
            Submit
          </span>
          <span
            className={styles.situButton}
            style={{
              background: v('primary-hover'),
              borderColor: v('primary-hover'),
              color: v('primary-ink'),
            }}
          >
            Submit
            <em className={styles.situState}>hover</em>
          </span>
          <span
            className={styles.situButton}
            style={{ borderColor: v('secondary'), color: v('secondary') }}
          >
            Cancel
          </span>
          <span
            className={styles.situButton}
            style={{
              background: v('secondary-hover'),
              borderColor: v('secondary'),
              color: v('secondary'),
            }}
          >
            Cancel
            <em className={styles.situState}>hover</em>
          </span>
        </>
      )

    case 'pill':
      // The real pill: the whole border in the tone, the left side thicker, and
      // the tint behind it — which is only judged with text on top of it.
      return (
        <span
          className={styles.situPill}
          style={{ borderColor: v('color'), background: v('tint'), color: v('color') }}
        >
          {member.name} — a message a player reads
        </span>
      )

    case 'tile':
      return (
        <span
          className={styles.situTile}
          style={{ background: v('fill'), borderColor: v('edge') }}
        >
          W
        </span>
      )

    case 'member':
      // A dot beside a bold name, which is how a member is met: in the club list
      // and as the author of a chat line.
      return (
        <>
          <span
            className={styles.situDot}
            style={{ background: v('fill'), borderColor: v('edge') }}
          />
          <span className={styles.situName} style={{ color: v('fill') }}>
            {member.name}
          </span>
        </>
      )

    case 'wordle':
      return (
        <span
          className={styles.situTile}
          style={{ background: v('fill'), borderColor: v('edge'), color: v('ink') }}
        >
          A
        </span>
      )

    case 'toast':
      return (
        <span className={styles.situToast} style={{ borderLeftColor: v('stripe') }}>
          {member.name} — the stripe is the whole of a toast's color
        </span>
      )
  }
}

/**
 * The `base` cell: struck through, because nothing paints it. Drawn rather than
 * skipped — an anchor that vanished from the demo would be an anchor you could
 * forget was there.
 */
function Anchor({ color }: { color: string }) {
  return (
    <span className={styles.situAnchor} style={{ background: color }} title="base — never painted">
      <span className={styles.situStrike} />
    </span>
  )
}

function Row({ family, name, cells }: { family: Family; name: string; cells: string[] }) {
  return (
    <>
      <div className={styles.memberHead}>{name}</div>
      {cells.map((cell, i) => {
        const token = tokenOf(cell)
        const variant = family.variants[i]
        // A per-member formula wins over the column's, because a formula that
        // differs from member to member is the interesting one.
        const formula = family.formulas[`${name}/${variant}`] ?? family.formulas[variant]
        // A token from another bucket. Not automatically wrong — a pill showing a
        // won outcome may well want the won color — but it is never invisible,
        // which is the point: cross-bucket borrowing is the mistake this whole
        // naming scheme exists to make visible at the site.
        const borrowed = !token.startsWith(`--${family.bucket}-`)
        return (
          <div key={token} className={styles.cell}>
            <div className={styles.swatch} style={{ background: cell }} />
            <code className={borrowed ? styles.borrowed : undefined}>
              {borrowed ? '↗ ' : ''}
              {token}
            </code>
            <code className={styles.value} ref={showResolved(token)} />
            <span className={styles.formula}>{formula ?? '—'}</span>
          </div>
        )
      })}
    </>
  )
}

/**
 * Write a token's resolved value into a node. A ref callback, so there is no
 * state and no effect — React calls this once the node is in the document, which
 * is exactly when `getComputedStyle` can answer.
 */
const showResolved = (token: string) => (node: HTMLElement | null) => {
  if (node) node.textContent = getComputedStyle(document.documentElement).getPropertyValue(token)
}
