/**
 * Tiny class-name combiner. Hand-rolled because clsx/classnames
 * are overkill for the handful of conditional class composition
 * sites we have — and we'd rather not add a dependency for ~30
 * lines of usage.
 *
 *   <div className={cls(
 *     styles.tile,
 *     revealed && styles.tileRevealed,
 *     isPending && styles.tilePending,
 *   )} />
 *
 * Filters out falsy values (false / null / undefined / empty
 * strings) and joins the rest with single spaces.
 */
export function cls(
  ...args: Array<string | false | null | undefined>
): string {
  return args.filter(Boolean).join(' ')
}
