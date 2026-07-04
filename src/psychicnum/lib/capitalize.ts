/** Sentence-case a message's first letter. Server errors come back lowercase
 *  (`'setup.guesses is required'`); local feedback should read as a sentence.
 *  Used by psychicnum's guess dispatch + info-column action handlers, which
 *  surface raw RPC error messages through the shared `stickyPill`. */
export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
