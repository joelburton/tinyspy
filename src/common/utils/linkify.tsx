// cs-met-utils

import type { ReactNode } from 'react'

// A URL runs to the first whitespace — which means a match also swallows any
// punctuation ending the sentence it sits in. TRAIL_RE is what gives that back.
const URL_RE = /https?:\/\/\S+/g
const TRAIL_RE = /[.,!?;:)\]}>]+$/

/**
 * Make the URLs inside a chat message clickable.
 *
 * Hand it the message text and render what comes back in place of it —
 * `{linkify(text)}`. That is an array of plain strings and `<a>` elements, or
 * the bare empty string for empty input; React renders either shape the same
 * way, so there is nothing for a caller to unwrap. Text with no URL in it comes
 * back as a one-element array, not a string.
 *
 * Trailing punctuation is split off the URL and re-emitted as text, so
 * "see https://example.com." links the address and not the period. The cost is
 * a URL that really ends in one of those characters — a closing paren is the
 * plausible case — links to the address without it.
 *
 * Only `http:` and `https:` are recognized. That is also what stops a
 * `javascript:` URL typed into chat from becoming an anchor, which matters
 * because the input here is another player's text.
 *
 * Pure — it reads its argument and nothing else, so calling it during a render
 * is safe.
 */
export function linkify(text: string): ReactNode {
  const parts: ReactNode[] = []
  let last = 0
  let key = 0
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index!
    if (start > last) parts.push(text.slice(last, start))
    let url = match[0]
    let trail = ''
    const trailMatch = url.match(TRAIL_RE)
    if (trailMatch) {
      trail = trailMatch[0]
      url = url.slice(0, -trail.length)
    }
    parts.push(
      <a key={key++} href={url} target="_blank" rel="noopener noreferrer">
        {url}
      </a>,
    )
    if (trail) parts.push(trail)
    last = start + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 0 ? text : parts
}
