// Shared HTTP scaffolding for every edge function. `_shared/` is importable by
// the deployed functions but is not itself deployed as a function (the `_`
// prefix). Centralizing this kills the copy-per-function drift the review
// flagged — e.g. a header added to `Access-Control-Allow-Headers` used to be
// stamped five times.

/** Permissive CORS for the browser client. `apikey` + `authorization` cover the
 *  anon key and the caller's JWT; `x-client-info` is supabase-js's own header. */
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** JSON response with CORS + content-type. */
export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

/** Handle the CORS preflight. Returns the `OPTIONS` response to short-circuit,
 *  or `null` to proceed with the real request. */
export const preflight = (req: Request): Response | null =>
  req.method === 'OPTIONS' ? new Response('ok', { headers: cors }) : null
