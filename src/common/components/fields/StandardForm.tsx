// cs-unmet

import type { ComponentPropsWithRef } from 'react'
import { cls } from '../../lib/util/cls'
import styles from './StandardForm.module.css'

/**
 * A FORM YOU FILL IN — fields stacked, one gap between them.
 *
 * `<form>` itself carries no styling, deliberately: it is a SUBMIT BOUNDARY,
 * not a look. Chat's composer and codenamesduet's clue strip are both real
 * forms that submit and neither wants a column of spaced fields, so looking
 * like a form is opt-in — the same reason a bare `<button>` has no chrome and
 * `<StandardButton>` supplies it.
 *
 * What it does NOT own is the space around itself. That is the gap between this
 * form and whatever sits above or below it, which belongs to the container —
 * `<FloatingPanel density>` for a floating panel, the page for a page.
 */
export function StandardForm({ className, ...rest }: ComponentPropsWithRef<'form'>) {
  return <form className={cls(styles.standardForm, className)} {...rest} />
}
