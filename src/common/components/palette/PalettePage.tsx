import { FAMILIES, tokenOf, type Family } from './palette'
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
 * SQUARES ONLY, so far. Every variant should also render DOING ITS JOB — an ink
 * as text at real size, a bar as a 7px segment in a list row, a fill as a filled
 * tile, a wash as a pill background with words — because the orange lesson (an
 * ink that doesn't READ as its color) is invisible on a color chip. That is the
 * next pass on this page, not a thing it does yet.
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
    </section>
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
