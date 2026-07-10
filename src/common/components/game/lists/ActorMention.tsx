import { cls } from '../../../lib/util/cls'
import type { Member } from '../../../lib/games'
import { Dot } from '../../text/Dot'
import styles from './ActorMention.module.css'

/**
 * How much of an actor mention to show:
 *   - `auto`  — name + dot on desktop, but the name is DROPPED on phones (the dot
 *               carries identity; see docs/mobile.md). The default for feedback.
 *   - `both`  — always show both (turn logs, where the name is worth the space).
 *   - `name`  — just the name.  `dot` — just the disc.  `none` — nothing.
 */
export type ActorShow = 'auto' | 'both' | 'name' | 'dot' | 'none'

type Props = {
  /** The person who acted. `undefined`/`null` → the `fallback` name + a neutral
   *  disc (a departed member, or a row whose player hasn't loaded yet). Only the
   *  identity fields are needed, so any `Member`-ish value works. */
  actor?: Pick<Member, 'username' | 'color'> | null
  /** Name shown when `actor` is missing. */
  fallback?: string
  /** Merged onto the root — for positioning the mention in its row. */
  className?: string
  /** Which parts to show (see `ActorShow`). Each widget sets its own default. */
  show?: ActorShow
}

/**
 * The shared **actor mention** — a person's name and their identity disc, the
 * app-wide "who did this" marker. Two exported widgets differ only in ORDER, so
 * the pieces (the `.name` span, the `<Dot>`) and the show/hide logic live here
 * once: use `<ActorTag>` when the name reads first (turn logs — "moth ●"),
 * `<ActorDot>` when the disc anchors a peer message ("● moth is guessing").
 *
 * The `show` prop is the point of the pair: keeping the name a real element (not
 * baked into a text string) is what lets us drop it to just a dot on phones —
 * globally, via one `@media (--phone)` rule — so a long username can't blow out a
 * tight feedback pill.
 */
function Mention({
  actor,
  fallback = 'someone',
  className,
  show = 'auto',
  dotFirst,
}: Props & { dotFirst: boolean }) {
  const withName = show === 'auto' || show === 'both' || show === 'name'
  const withDot = show === 'auto' || show === 'both' || show === 'dot'
  const name = withName && (
    <span className={cls(styles.name, show === 'auto' && styles.namePhoneHidden)}>
      {actor?.username ?? fallback}
    </span>
  )
  const dot = withDot && (
    <Dot color={actor?.color} className={dotFirst ? styles.dotBefore : styles.dotAfter} />
  )
  return (
    <span className={cls(styles.mention, className)}>
      {dotFirst ? dot : name}
      {dotFirst ? name : dot}
    </span>
  )
}

/** Name-then-dot ("moth ●"). Default `show="both"` — its main use is turn logs,
 *  which keep their names; feedback callers pass `show="auto"`. */
export function ActorTag(props: Props) {
  return <Mention {...props} dotFirst={false} show={props.show ?? 'both'} />
}

/** Dot-then-name ("● moth"). Default `show="auto"` — a feedback widget, so it
 *  drops the name to just the disc on phones. */
export function ActorDot(props: Props) {
  return <Mention {...props} dotFirst={true} show={props.show ?? 'auto'} />
}
