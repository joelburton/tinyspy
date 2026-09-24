# supabase — todo

## Bugs

## Soon

- **Nothing tests what a DEAD CONNECTION does, on either transport.** Every
  failure test in this folder feeds a failure the SERVER produced — a non-2xx, a
  refused envelope, an unparseable body — and none feeds the case where the
  request never went out. That gap hid a real bug for as long as edge functions
  have existed: with the network off, `edgeFnTransport` read
  `FunctionsFetchError.context` as the `Response` a non-2xx carries, threw while
  reading it, threw AGAIN inside its own catch, and the rejection escaped past
  `runEdgeFn` — so no fault was reported, no modal appeared, and the failure
  survived only as a console line in the caller's single-flight catch. Joel found
  it by pulling the network in Chrome and pressing New game (2026-09-10); Restart,
  which goes over the database transport, showed the modal correctly.

  `edgeFnTransport.test.ts` now pins that one case. What is still owed is the
  matrix: for BOTH transports (`runRpc`, `runEdgeFn`) and each way a request can
  fail to be answered — offline, DNS failure, a socket that dies mid-flight, a
  timeout, a gateway 502 — assert that a caller gets a not-ok envelope back and
  that exactly one fault reaches the modal. **The property worth asserting is the
  one that failed: a wrapper never throws.** Every call site awaits these inside
  a fire-and-forget handler, so a rejection is invisible by construction, which
  is precisely why the bug lasted.

## Someday

- **Tell a relay failure from a function that threw.** functions-js raises
  `FunctionsRelayError` when the request never reached our code (and sets
  `x-relay-error`), and `FunctionsHttpError` when our function answered.
  `edgeFnTransport` reads neither distinction, so both become the same fault.
  The first is the platform's problem and reads like a `service-error`; the
  second is ours.

## Maybe

- **Carry the HTTP status on the envelope.** The wrappers know it and log it on
  the call's `[db]` line, then return the envelope without it, so
  `reportUnhandled` leaves `status=` blank for a not-ok (a declared refusal
  arrives 200, a raw fault 4xx). A tenth key would fix it, but every builder in
  SQL, Deno and TypeScript writes every key, so it first means deciding whether
  the wire shape and the shape a call site reads are still one type. A
  `WeakMap` side channel was considered and rejected.

## Won't do
