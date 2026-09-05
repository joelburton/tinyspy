# session

Who is signed in, whether they have a username yet, and what their profile
says. One hook turns Supabase Auth's session into the three states `App` gates
on, filling a store with the profile row it read on the way; the other hands
that profile to anything on the page that asks for it.

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
first sign-in is not an error. A read that actually fails is another matter. It
leaves nobody able to say which of the two states this person is in, and either
guess shows: the claim screen would ask someone to pick a handle they may
already own, and the app behind the gate would greet them as a stranger. So a
failed read is a state of its own. The hook hands the envelope up, the app puts
it on the page in place of the route, and the page offers Try again, which
re-runs the same read. That read is also the one place that asks the wrapper
not to raise its fault modal: where the page is the message, a modal over it
says the same sentence twice.

The row's contents are the other half of the job, and they arrive in the same
read. The username, the player color and the one permission the app has are
wanted by things that do not share a parent — the account menu on every page,
the home page greeting, a definition popover several layers deep — and the
color is editable in place. So the lookup reads the whole row rather than only
asking whether one exists, and hands what it found to a module-level store.
`useProfile` subscribes to that store and takes no arguments, which is what
lets a component far from the page shell read the profile without a session in
hand. There is one signed-in user per tab, so one slot is the right number.

Two things follow from the store being filled by the lookup rather than by its
readers. The value is there before the first page mounts, so no menu row starts
life showing a placeholder and no navigation refetches anything; and every path
that ends signed out empties the store on the way, so a tab that has signed out
is not still showing the last person's name and color. A saved color is pushed
into the store directly, after the RPC has persisted it, so every reader
repaints at once with no refetch.

## Details

- **The four resolved states** `useSession` returns: `session: null` is signed
  out; `session` set with `needsClaim: true` is signed in and unclaimed;
  `session` set with `needsClaim: false` is signed in and claimed; and
  `probeFailed` holding an envelope is "the read failed, so which of those two
  is unknown". `App` renders `<LoginScreen>`, the error page,
  `<ClaimHandleScreen>` or the app itself, in that order, after `loading`
  clears.
- **The lookup runs on every auth event that carries a session**, the hourly
  token refresh included, not only on sign-in.
- **`Profile` is three columns** of `common.profiles`: `username`, `color`,
  `can_edit_words`. Add a column when a consumer arrives. `can_edit_words` has
  no UI for granting it; it is set by hand in SQL and gates the dictionary
  editing entry points.
- **An empty store reads as "signed out or unclaimed"**, which every consumer
  renders as the absence it is — no username, no color, no dictionary editing
  link. That is the safe reading, and it is also the true one: the store is
  empty exactly when there is no claimed profile.
- **The profiles read policy is `for select to authenticated using (true)`**,
  so the lookup is a point read on the primary key with nothing to filter.
- **The tests mock the auth client, not the network.** `useSession.test.ts`
  captures the callback the hook registers with `onAuthStateChange` and fires
  the events by hand, and collapses the query chain to its terminal call, so a
  case is one event plus one canned answer.
