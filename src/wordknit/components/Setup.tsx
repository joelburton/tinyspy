/**
 * Wordknit's per-game setup form. POC placeholder.
 *
 * The future shape is a date picker for which puzzle to play
 * (NYT Connections archive style). For now, every game uses
 * a hardcoded "Words starting with A/B/C/D" board, so there's
 * nothing to choose. We still render the dialog (rather than
 * declaring `setup: null` on the manifest) so the start-flow
 * shape is in place: when puzzle choice lands, the form just
 * gets fields, no plumbing change.
 *
 * Takes no props for now — the dialog's default config is `{}`
 * and stays that way. TypeScript's structural typing lets a
 * zero-arg function satisfy SetupBodyProps's
 * (members, value, onChange) signature via the same
 * contravariance trick used in the manifests with `setup: null`.
 */
export function WordknitSetup() {
  return (
    <div>
      <p className="muted">
        For the POC every game uses the same hardcoded board (four
        words each starting with A, B, C, D — easy to solve in one
        sitting). When we wire up the NYT-archive importer, this
        is where you'll pick a puzzle date.
      </p>
    </div>
  )
}
