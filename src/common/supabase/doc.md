# supabase

How the app talks to Supabase, and the one shape every answer comes back in.
The single client and its `common`-schema handle live here, and so do the three
wrappers a call site uses instead of the client's own methods, which hand back
an envelope whatever the call did. The Deno files that build and read the same
envelope on the other side of the wire sit in `supabase/functions/_shared/`.

## Design

Everything the app knows lives in Postgres, and every change to it is a request
over the network: an RPC through PostgREST, a table read, or an edge function
that does some work and then calls an RPC itself. Each of those can succeed,
can be turned down by a rule the server enforces, or can fail in a way nobody
wrote a line of code for, from a raw Postgres error to a phone that lost its
signal halfway through. Without a layer in between, every call site would have
to tell those apart on its own, and each would do it a little differently. This
folder is that layer. It owns the one client the app talks through, and it
promises that whatever a call did, the call site gets back one thing: an
envelope.

An envelope is a small object with a fixed set of keys, every key always
present and null when it has nothing to say. It is either `ok`, carrying the
payload and perhaps a message and how that message should read, or `not-ok`,
carrying a message, a severity that says what kind of trouble this is, and a
code that identifies exactly where it came from. The server writes one when it
can: a SQL handler turns a raise into one, and an edge function answers in one.
When the server could not, because Postgres spoke in its own error shape or
nothing answered at all, this folder builds one in the same shape, so a call
site never has to know which sort of failure it is looking at. The type itself
sits alone in `envelope.ts`, with no runtime behind it, so the Deno side can
import the very same definition and be checked against it.

The work is split across three layers, and the line between them is the idea
worth understanding. At the bottom, `dbFetch` is the fetch every request goes
through. It is the only place that can see whether a failing body parsed as
JSON, so it is where "who answered" is decided: Postgres, our gateway with
nothing behind it, or something that is not our server at all. But all it knows
is a URL, and a call can want silence for one answer and a modal for another,
so it never words anything and never shows anything. It writes its verdict into
a field that survives the client library untouched, logs what nothing else
will, and hands the response on exactly as it arrived. Above it, `dbEnvelope`
is where every sentence a player might read for one of these failures is
chosen, once, and where a fault is reported: a line in the console, and the
fault modal unless the caller said it would show its own. At the top,
`dbResult` holds the three wrappers, `runRpc`, `readRows` and `runEdgeFn`. They
await the call, read the answer, and are the only place a modal is decided,
because they are the first layer to hold the parsed envelope and know what it
means.

The edge functions mirror this in Deno. A function that has decided something
answers with an envelope built by `_shared/envelope.ts`, and it always answers
HTTP 200, faults included, because the status says whether the function ran
and the envelope says what it decided. A function that calls an RPC reads the
answer through `_shared/dbResult.ts`, a smaller twin of the frontend's
`runRpc` with no modal to raise. Only the type crosses between the two
runtimes. The frontend's wrappers reach into the browser, the fault store and
the fetch layer, none of which Deno has or wants.

Every call leaves exactly one line in the console under the `[db]` stamp,
written by whichever layer knows the most about it, in a fixed shape where a
blank field is itself information. That trail exists because a call site that
renders a failure just renders and returns, and a report of "it said an error
on my phone" would otherwise have nothing to read back. `dbLog` formats the
line and has no opinion about what any of it means.

## Details

**Three classes of code, one sequence for two of them.** A `PA` code is a raise
that becomes `ok`; a `PN` code is one that becomes `not-ok`; both are allocated
max+1 across SQL, Deno and the frontend together, and
`src/guards/raiseCodes.test.ts` reads all three sources so a number is never
reused. `FE` codes are the frontend's own, for the failures where our server
never answered, and cannot collide with a SQLSTATE.

**A `not-ok` always names a code.** Both `isEnvelope` predicates, the
frontend's and Deno's, reject a `not-ok` without one, because every builder we
have writes one unconditionally and a codeless `not-ok` can only be a hand-built
shape.

**`status: 0` means nothing answered.** postgrest-js sets it on a rejected
fetch and only there, and `edgeFnTransport` reports the same value for the same
case, so one predicate, `nothingAnswered`, covers both transports.

**The verdict travels in `statusText`.** It is the one response field the
client library passes through untouched, so `dbFetch` writes an `FE` code there
and the wrapper reads it back with `situationFor`. Nothing else in the app
writes that field.

**`presentFaults: false` means "I will show my own", never "drop it."** The
`[db]` line is written either way. `src/guards/callSiteShape.test.ts` names each
caller that opts out and holds it to the promise.

**Zero rows is `ok`.** Only a caller can know an empty result is impossible.
`readRows` does fault on a non-array payload, which is what pointing it at an
RPC produces; `src/guards/dbCallShape.test.ts` is the compile-time half of that
check.

**The `.ts` extension on `envelope.ts`'s one import is load-bearing.** The file
is part of the edge runtime's module graph, which does no extensionless
resolution, and `deno check` does not catch its absence. Without it every edge
function fails to boot.

**In dev, the client follows the page's host.** When the configured Supabase
URL is loopback but the page was opened from a LAN address, `supabase.ts`
rewrites the host to match, which is what lets a phone on the same network
reach the local stack.

**The realtime instrumentation is installed here but belongs to `realtime/`.**
The client is created in this folder, so this is where its channel factory is
wrapped; what the wrapper does is `realtimeDiag`'s.
