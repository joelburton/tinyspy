// cs-audited-simple-page

import type { ReactNode } from 'react'
import { Link } from '../routing/Link'
import { diagnosticsLine } from '../supabase/dbLog'
import { cls } from '../utils/cls'
import type { NotOkEnvelope } from '../supabase/envelope'
import styles from './ErrorPage.module.css'

type Props = {
  // The sentence a player reads — what went wrong, in words.
  message: ReactNode
  // The `k=v` line, read ALOUD to whoever debugs. Required, not optional: a
  // page that says "something went wrong" and nothing else leaves nothing to
  // diagnose, and every caller either has a classified failure to hand
  // (`faultDiagnostics`) or can write the line itself, the way the homepage's
  // no-clubs fault does.
  diagnostics: string
  // An extra action beside "← Back home" — the error boundary's Reload.
  action?: ReactNode
}

/**
 * The error page built from a not-ok envelope — reach for this one whenever a
 * failure is in hand, and for `ErrorPage` only when the sentence is written
 * here rather than received.
 *
 * It derives `message` and `diagnostics` from the envelope instead of asking a
 * caller to pair them up, so every failed read presents the same way. `action`
 * is passed through.
 */
export function EnvelopeErrorPage({ envelope, action }: { envelope: NotOkEnvelope; action?: ReactNode }) {
  return (
    <ErrorPage
      message={envelope.message}
      // No `call` or `status`: this is built during RENDER, long after the
      // request, and the line's fixed shape is a promise that a blank means
      // something. The wrapper wrote the full line when it happened; `detail`
      // names the call, which is what survives into the envelope.
      // `?? undefined` because an envelope always CARRIES these keys, null when
      // it has nothing to say, while a `[db]` field says nothing by being left
      // out — see `DiagFields`.
      diagnostics={diagnosticsLine('FAULT', {
        call: '(read)',
        severity: envelope.severity,
        dbcode: envelope.dbcode ?? undefined,
        detail: envelope.detail ?? undefined,
      })}
      action={action}
    />
  )
}

/**
 * A dead end, drawn as the page: the route cannot render and waiting will not
 * help. The club failed to load, the game does not exist, a render crashed.
 *
 * Takes the sentence and the diagnostics line already written; `action` adds a
 * second way out beside "← Back home", which every one of these carries.
 * Callers holding a not-ok envelope want `EnvelopeErrorPage` above instead.
 *
 * Page or modal is the choice `doc.md` explains.
 */
export function ErrorPage({ message, diagnostics, action }: Props) {
  return (
    <div className={cls('card', 'pageMain', styles.page)}>
      <h1 className={styles.heading}>Error</h1>
      <p className={styles.message}>{message}</p>
      <p className={styles.diagnostics}>{diagnostics}</p>
      <p className={styles.actions}>
        <Link to="/" className="link-button">
          ← Back home
        </Link>
        {action}
      </p>
    </div>
  )
}
