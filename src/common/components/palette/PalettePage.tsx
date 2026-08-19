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
 * A cell shows the swatch, the token, and the resolved value, because a token
 * whose value you can't see is a token you can't check. The value is written
 * straight into the node by a ref callback rather than held in state: it comes
 * from `getComputedStyle`, which can only be read after the browser has resolved
 * the cascade, and the alternative is a `useEffect` that calls `setState` — which
 * this repo bans outright (docs/code-conventions.md).
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
        Every color family in <code>common/theme.css</code>. A member missing a variant is a bug in
        what "family" means — see <code>palette.ts</code>.
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
      {cells.map((cell) => {
        const token = tokenOf(cell)
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
