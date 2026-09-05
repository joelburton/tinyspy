# session

Who is signed in, whether they have a username yet, and what their profile
says. One hook turns Supabase Auth's session into the three states `App` gates
on; the other holds the signed-in user's profile row in a store every page can
read.

## Design

Being signed in and having a profile are two different facts, kept by two
different systems. Supabase Auth owns `auth.users` and the JWT it hands the
browser; it knows nothing about usernames. Our `common.profiles` row is the
other half, and it does not exist until the person picks a handle on the claim
screen and the `claim_username` RPC writes it. So a signed-in user can be one
of two things, and the app has to know which before it renders anything: someone
who has claimed and gets the home page, or someone who has not and gets the
claim screen and nothing else. `useSession` exists to answer that. It subscribes
to the auth client's state changes, and for every session it sees it looks up
the profiles row for that user. Three resolved states come out: no session, a
session with no row, a session with one. A fourth, `loading`, covers the moment
before the first answer, and the app shows a spinner rather than guessing.
When the claim screen succeeds it calls `refresh()`, which re-runs the lookup so
the gate flips without a sign-out or a reload.

The lookup does not trust the stored JWT first. What is in `localStorage` is
whatever the browser cached at sign-in, and the client library does not
re-verify it on load, so a token can outlive the user it names: a local
`db reset` empties `auth.users` while every open tab still holds a token, and
deleting an account in prod does the same. The hook therefore asks the server
who the token belongs to before asking about a profile. If the server says the
user is gone, or the token cannot be refreshed, the hook signs out, and the
next render is the login screen. The rule is written the strict way round, sign
out unless the failure is provably transient, because a failed refresh does not
always arrive with a status code, and treating an unclassified failure as fine
once left people stranded on the claim screen with a token nobody could claim
with. Transient means a retryable fetch error or a 5xx: the server was
unreachable or unwell, which says nothing about the user, and signing everyone
out each time Supabase hiccups would be worse than one render that a reload
corrects.

The profile lookup itself has a shape worth noticing. Zero rows is the answer
it is there to get, not a failure: no row means unclaimed, and the read is
written as a list query rather than a single-row one precisely so the ordinary
first sign-in is not an error. A read that actually fails is another matter.
The wrapper has already logged it and shown the fault, and the hook is left
with only a guess about where to send the person; today it sends them to the
claim screen.

The second hook is about the row's contents rather than its existence. The
username, the player color and the one permission the app has are read by
several things that do not share a parent, the account menu on every page and
the home page greeting among them, and the color is editable in place. So the
profile lives in a module-level store rather than in any component, and the
hooks subscribe to it with React's external-store hook. There is one signed-in
user per tab, so one slot is the right number. The store loads once per user id
and a remount or a token refresh is a no-op against the cached value, which is
why the menu row does not flicker on navigation. A saved color is pushed into
the store directly, after the RPC has persisted it, so every reader repaints at
once with no refetch. Two hooks read the store: one takes the session and makes
sure the row is loaded, the other only subscribes, for components too far from
the page shell to have a session in hand.

A profile that goes missing after the session said it was there is a distinct
event, and the store treats it as one. The row is keyed by the user id, the
read policy hides nothing, and every consumer renders only after `useSession`
saw a row, so zero rows here can only mean the row was deleted under a live
tab. That is the same condition the claim RPC reports when it runs into a token
whose user is gone, reached by another door. It is reported as a fault that
tells the player to refresh, because refreshing re-probes, finds no profile and
routes them to the claim screen, which is the one place that can either
re-claim or sign them out. Either kind of failure clears the load marker first,
so a later mount retries instead of leaving the menu showing a placeholder for
the rest of the session.

## Details

- **The three resolved states**, from the two booleans `useSession` returns:
  `session: null` is signed out; `session` set with `needsClaim: true` is
  signed in and unclaimed; `session` set with `needsClaim: false` is signed in
  and claimed. `App` renders `<LoginScreen>`, `<ClaimHandleScreen>` or the app
  for them, in that order, after `loading` clears.
- **The lookup runs on every auth event that carries a session**, the hourly
  token refresh included, not only on sign-in.
- **`Profile` is three columns** of `common.profiles`: `username`, `color`,
  `can_edit_words`. Add a column when a consumer arrives. `can_edit_words` has
  no UI for granting it; it is set by hand in SQL and gates the dictionary
  editing entry points.
- **The subscribe-only hook depends on the other having run.** The account
  menu calls the loading hook on every page, so the store is warm before
  `DefinitionView` asks; a cold store reads as "no permission", which is the
  safe reading.
- **The missing-row fault is `PN491`**, the code reserved for a signed-in user
  with no profile row; it is the frontend's own, raised without a server
  round trip.
- **The profiles read policy is `for select to authenticated using (true)`**,
  so both lookups are a point read on the primary key with nothing to filter.
- **The tests mock the auth client, not the network.** `useSession.test.ts`
  captures the callback the hook registers with `onAuthStateChange` and fires
  the events by hand, and collapses the query chain to its terminal call, so a
  case is one event plus one canned answer.
