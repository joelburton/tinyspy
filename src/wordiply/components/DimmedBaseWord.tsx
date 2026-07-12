import { cls } from '../../common/lib/util/cls'
import styles from './DimmedBaseWord.module.css'

/**
 * Renders a word with its BASE (the starter fragment) shown dimmer than
 * the letters the player added around it — the wordiply spec's "the base
 * is highlighted" cue, so at a glance you see what you contributed vs the
 * given letters.
 *
 * The base is split out at its **first** occurrence (per the spec — only
 * the first is dimmed even if the base repeats, e.g. base `ana` in
 * `banana` dims only the first `ana`). If the word doesn't (yet) contain
 * the base — e.g. while the player is still typing the opening letters —
 * nothing is dimmed and the whole string renders plain.
 *
 * One component, used by both the completed guess rows and the live entry,
 * so the two can never drift.
 */
export function DimmedBaseWord({
  word,
  base,
  className,
}: {
  word: string
  base: string
  className?: string
}) {
  const upper = word.toUpperCase()
  const at = base ? word.toLowerCase().indexOf(base.toLowerCase()) : -1

  if (at < 0) {
    return <span className={cls(styles.word, className)}>{upper}</span>
  }

  const prefix = upper.slice(0, at)
  const mid = upper.slice(at, at + base.length)
  const suffix = upper.slice(at + base.length)
  return (
    <span className={cls(styles.word, className)}>
      {prefix}
      <span className={styles.base}>{mid}</span>
      {suffix}
    </span>
  )
}
