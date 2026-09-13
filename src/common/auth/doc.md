# auth

The screens shown before the app proper: signing in, and claiming a handle.

## Design

Until the session resolves, `App` draws nothing but a gate: `useSession`
answers signed out, signed in but unclaimed, or signed in and claimed — or that
its profile read failed, which is `error-page`'s to draw — and the first two
each get a screen here, in that order. Nothing else of the app is mounted
behind them — no page chrome, no menu — so whatever a user needs to do from
here, including leaving, has to be on the screen itself.

**Signing in is one email with two ways to use it.** `signInWithOtp` mails a
clickable magic link and a numeric code, and either exchanges for the same
session. The link is the easy path; the code is the one that makes signing in
work across devices, which is the case that actually comes up — the email opens
on a phone while the game is on a laptop. So the form toggles: send me a link,
or I already have a code. Toggling back to the send form doubles as a resend,
since the address is still in state.

The screen never names the code's length. That is a Supabase setting
(`auth.email.otp_length`), and the local `config.toml` and the deployed project
are free to disagree about it — a length-agnostic sentence is true whichever
they hold. The input sets no `maxLength`, so any length pastes.

There is no password flow at all, and there will not be one: passwords are an
account-recovery problem, and this app's whole account is a username and a
color.

A failure here reads differently from the rest of the app. Everywhere else a
refusal is an envelope that can name the field it is about; `supabase.auth`
answers with a message and nothing else, so every refusal on the sign-in screen
lands on the form's own line, and the message is GoTrue's own words. That is a
server's raw sentence shown on purpose, and `noRawServerMessage` carries the
exception by name.

**Claiming a handle is the second half of signing in.** A new account has an
`auth.users` row and nothing else, and until `common.claim_username` runs there
is no profile, no color and no solo club. The username is permanent — it is how
friends refer to you, and a name that moved would make a club's history lie —
which is why it is asked for rather than derived: a handle you did not choose
is one you are stuck with. The local-part of the address seeds a suggestion,
and the color is seeded from a hash of that suggestion, once, at mount. The
color deliberately does not follow the field as you type: a swatch that hops on
every keystroke is a control flickering while you use a different one.

The rules — 3–15 characters, lowercase letters, digits and hyphens, starting
with a letter — are written once and shown twice: as the field's entry help
while they hold, and as its error the moment they don't, because breaking them
is exactly what the help warns against. The regex is checked here for instant
feedback and again by the database, which is the referee; a race between two
people claiming one name can only be settled there.

The claim's refusals split in two. `PN017`, the name is taken, is a refusal a
player can do something about, and the server says so by naming its column —
so it lands under the username box. Everything else says `_`,
which puts it on the form's line beneath the fault modal that has already
appeared. One of them carries an action rather than a sentence: `PN018` means
the `auth.users` row behind the token is gone, and there is nothing to do with
such a session but end it. Which is also the button the screen offers anyway —
"Not you? Sign out". Both exits run the same function, and it does not trust
the auth listener to put the sign-in screen back: a stale session is exactly
what brings people to this screen, and `signOut()`'s SIGNED_OUT event has not
reliably re-rendered from one. So it revokes best-effort and hard-navigates to
`/`, rebuilding the session from a clean slate. An in-app navigation would not
do — this screen is gated on `needsClaim`, not on the path.

The RPC, the profile table and the solo club it creates are
[docs/common.md](../../../docs/common.md#username-claim-flow)'s.
