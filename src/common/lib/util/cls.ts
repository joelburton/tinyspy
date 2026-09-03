// cs-fixed-deep

/**
 * Tiny class-name combiner. Hand-rolled rather than clsx/classnames
 * because there is nothing to depend on: the whole thing is the one
 * expression below.
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
