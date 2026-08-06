#!/usr/bin/env -S npx tsx
/**
 * Provision a player account BEFORE that person's first sign-in, so they
 * arrive to a handle, a color and a solo club already waiting.
 *
 * The problem this solves: the app is magic-link-only, and a first-time
 * player lands on <ClaimHandleScreen> to pick a username before they can be
 * added to a club. That makes "invite a friend" a two-step dance — they sign
 * in, tell you their handle, and only then can you build the club. Running
 * this first collapses it: you pick the handle, create the club in the app
 * ahead of time, and their first sign-in drops them straight into it.
 *
 * ── Why they still just click a magic link ─────────────────────────────────
 * GoTrue keys accounts by EMAIL. The row created here is a normal, confirmed
 * user with no password; when they later request a magic link for the same
 * address, GoTrue signs them into THIS row, `auth.uid()` resolves to the
 * profile below, and App.tsx skips the claim screen (it renders it only when
 * a session has no `common.profiles` row).
 *
 * ── Why it doesn't fabricate any auth rows ─────────────────────────────────
 * supabase/seed.dev.sql inserts into auth.users + auth.identities directly,
 * and has to hand-set eight token columns to '' because GoTrue reads them as
 * Go strings and errors on NULL. That file says NOT FOR PRODUCTION, and it's
 * right. The Admin API does all of it correctly instead:
 *
 *   1. createUser({ email, email_confirm: true })  — GoTrue writes the token
 *      columns and the identities row itself. Passing no password leaves an
 *      unusable bcrypt hash behind, not an empty one: the password grant
 *      rejects '', ' ' and anything else, so the account stays magic-link-only.
 *   2. generateLink({ type: 'magiclink' })         — mints a single-use OTP
 *      and RETURNS it rather than mailing it, so provisioning is silent.
 *   3. verifyOtp(...)                              — redeems it for a real
 *      session: precisely what clicking the emailed link does.
 *   4. common.claim_username(...) as that user     — the REAL RPC, untouched.
 *
 * Step 4 is the point of the whole shape. `claim_username` is `auth.uid()`-
 * gated, so it can only ever act for the caller — hence the detour through a
 * genuine session. The alternative (reimplementing its four inserts here with
 * a service-role connection) would duplicate what a new player consists of,
 * and that set has already grown once, when clubs_gametypes seeding was
 * added. Driving the real RPC means this script cannot drift from what
 * actually happens at sign-in.
 *
 * The OTP redeemed here is single-use and independent of any link they
 * request later, so it doesn't consume or interfere with their real sign-in.
 *
 * ── Not a club builder ─────────────────────────────────────────────────────
 * Only the account and its solo club (`=<handle>`, which claim_username makes
 * anyway). FRIEND clubs are better made in the app: `common.create_club`
 * resolves usernames → ids and auto-adds the caller, so once this has run you
 * can add the person through the normal "New club" dialog before they have
 * ever signed in.
 *
 * ── Two connections, on purpose ────────────────────────────────────────────
 * Auth work goes over the Admin API (only GoTrue can mint these rows), but
 * the read-only preflight goes over psql. That's not inconsistency: this repo
 * grants table permissions narrowly — `service_role` holds only `usage on
 * schema common`, and `select` on common.profiles is granted to
 * `authenticated` alone. Reading the profile table with the service key fails
 * with "permission denied", and widening a production grant to let a
 * provisioning CLI peek would be a permanent change for a one-off need.
 * SUPABASE_DB_URL is already exported by the same prelude, so it's used
 * instead and nothing about the running app changes.
 *
 * Connection: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY
 * for the API, SUPABASE_DB_URL for the preflight reads (needs psql). All four
 * default to the local stack; `gmake db-add-user ENV=prod` supplies the hosted
 * values via supabase/deploy/env.sh.
 *
 * Usage:  EMAIL=… HANDLE=… [COLOR=…] [DRY=1] npm run _user:add
 *         (public entry: `gmake db-add-user ENV=… EMAIL=… HANDLE=…`)
 */

import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
// The palette is IMPORTED, not restated: one list, already kept in sync with
// the CHECK on common.profiles.color and the claim_username allow-list. This
// module is dependency-free (no React, no CSS), so a node script can read it.
import { MEMBER_COLORS, defaultColorFor } from '../../src/common/lib/color/memberColor'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
// Local-dev defaults — the well-known keys from `supabase status`, the same
// pair the import scripts and e2e fixtures hardcode. Anything other than
// localhost must set both explicitly.
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const EMAIL = (process.env.EMAIL ?? '').trim().toLowerCase()
const HANDLE = (process.env.HANDLE ?? '').trim().toLowerCase()
// PLAYER_COLOR, not COLOR: npm sets COLOR ('0'/'1', its own colour-support
// flag) in the environment of every script it runs, which overwrites whatever
// the Makefile passed. The symptom was `not a valid player color: 0`. Same
// rule as HANDLE-not-USERNAME — don't name a variable something the tooling
// already owns. The make-level flag stays the readable COLOR=…; the Makefile
// renames it on the way in.
const COLOR = (process.env.PLAYER_COLOR ?? '').trim().toLowerCase()
const DRY = !!process.env.DRY

/** The same regex common.claim_username enforces — 3–15 chars, letter-first. */
const HANDLE_RE = /^[a-z][a-z0-9-]{2,14}$/

const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function die(message: string): never {
  console.error(`\nERROR: ${message}`)
  process.exit(1)
}

/**
 * Run one read-only query and return its single scalar result ('' when the
 * query matched nothing). -X skips ~/.psqlrc, whose banner lines would
 * otherwise land in stdout; -tA strips the header, padding and separators so
 * the value arrives bare.
 *
 * Callers pass literals through `lit()` rather than interpolating raw — the
 * inputs here are already regex-validated, but a quoting helper is the kind
 * of thing that should never be the reason a script is unsafe to extend.
 */
function queryScalar(sql: string): string {
  return execFileSync('psql', [DB_URL, '-X', '-tA', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
  }).trim()
}

/** Quote a value as a SQL string literal (doubling any embedded quote). */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * Is this email already an account?
 *
 * There's no getUserByEmail in the Admin API, and `auth` isn't a PostgREST-
 * exposed schema, so this pages listUsers. Fine at friends-and-family scale;
 * the cap exists only so a surprise never turns into an unbounded scan.
 */
async function findUserByEmail(email: string) {
  const PER_PAGE = 200
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) die(`listUsers: ${error.message}`)
    const hit = data.users.find((u) => u.email?.toLowerCase() === email)
    if (hit) return hit
    if (data.users.length < PER_PAGE) return null
  }
  die('more than 5000 users — refusing to keep scanning for a duplicate email')
}

async function main() {
  // ── validate the inputs before touching anything ──
  if (!EMAIL) die('EMAIL is required')
  // Deliberately loose: the real check is whether a magic link arrives, and
  // over-strict email regexes reject valid addresses. This catches typos like
  // a missing @, not exotic-but-legal addresses.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL)) die(`not an email address: ${EMAIL}`)
  if (!HANDLE) die('HANDLE is required (the username they will play under)')
  if (!HANDLE_RE.test(HANDLE)) {
    die(`invalid handle "${HANDLE}" — 3–15 chars, lowercase letters/digits/hyphens, starting with a letter`)
  }

  // An omitted color gets the same deterministic default the claim form
  // pre-selects, so a CLI-provisioned player is indistinguishable from a
  // self-claimed one. They can change it later under "Edit profile".
  const color = COLOR || defaultColorFor(HANDLE)
  if (!(MEMBER_COLORS as readonly string[]).includes(color)) {
    die(`not a valid player color: ${color} (one of: ${MEMBER_COLORS.join(', ')})`)
  }

  // ── preflight: everything DRY reports, and every real run also checks ──
  const existingUser = await findUserByEmail(EMAIL)

  const takenBy = queryScalar(
    `select user_id from common.profiles where username = ${lit(HANDLE)}`,
  )

  console.log(`    email   : ${EMAIL}${existingUser ? '   ALREADY EXISTS' : ''}`)
  console.log(`    handle  : ${HANDLE}${takenBy ? '   ALREADY TAKEN' : ''}`)
  console.log(`    color   : ${color}${COLOR ? '' : '   (deterministic default)'}`)

  if (existingUser) {
    // If they already have an account AND a profile there's nothing to do; if
    // the account exists WITHOUT one, they signed in but never picked a
    // handle, and finishing that from here would fight whatever they're
    // doing on the claim screen. Either way, stop and say which it is.
    const theirProfile = queryScalar(
      `select username || ' (' || color || ')' from common.profiles
        where user_id = ${lit(existingUser.id)}`,
    )
    die(
      theirProfile
        ? `${EMAIL} is already set up as "${theirProfile}" — nothing to do`
        : `${EMAIL} already has an account but no profile — they have signed in and need to pick their own handle on the claim screen`,
    )
  }
  if (takenBy) die(`the handle "${HANDLE}" is already taken by someone else`)

  if (DRY) {
    console.log('\n  DRY RUN — nothing written. Would create:')
    console.log(`    auth user   ${EMAIL} (confirmed, no password)`)
    console.log(`    profile     ${HANDLE} (${color})`)
    console.log(`    solo club   =${HANDLE}`)
    return
  }

  // ── 1. the account ──
  const created = await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true })
  if (created.error || !created.data.user) {
    die(`createUser: ${created.error?.message ?? 'no user returned'}`)
  }
  const userId = created.data.user.id
  console.log(`\n── auth user   ${EMAIL} (confirmed)`)

  // From here on a failure leaves a half-made player — an account with no
  // profile, which would silently route them to the claim screen. Undo it
  // instead, so a failed run leaves nothing behind and can just be re-run.
  try {
    // ── 2 + 3. a real session, via a magic-link OTP that is never mailed ──
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL })
    if (link.error) throw new Error(`generateLink: ${link.error.message}`)
    const otp = link.data.properties?.email_otp
    if (!otp) throw new Error('generateLink returned no email_otp')

    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const verified = await anon.auth.verifyOtp({ email: EMAIL, token: otp, type: 'magiclink' })
    if (verified.error || !verified.data.session) {
      throw new Error(`verifyOtp: ${verified.error?.message ?? 'no session returned'}`)
    }

    // ── 4. the real claim, as them ──
    const asThem = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${verified.data.session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const claimed = await asThem
      .schema('common')
      .rpc('claim_username', { desired: HANDLE, chosen_color: color })
    if (claimed.error) throw new Error(`claim_username: ${claimed.error.message}`)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    // claim_username is one plpgsql function, so it's all-or-nothing: a
    // failure means no profile row, and the account deletes cleanly. The
    // exception is a lost response on a call that DID commit — then this
    // delete hits profiles_user_id_fkey (no ON DELETE CASCADE) and fails.
    // Say so rather than reporting a rollback that didn't happen.
    const { error: undoErr } = await admin.auth.admin.deleteUser(userId)
    die(
      undoErr
        ? `${reason}\n       AND the rollback failed: ${undoErr.message}\n`
          + `       ${EMAIL} still has an account (${userId}). Check whether the profile\n`
          + `       exists — if it does, the claim actually succeeded and you are done.`
        : `${reason}\n       (rolled back — the auth user was deleted, so this is safe to re-run)`,
    )
  }

  // ── report what actually landed, read back rather than assumed ──
  const count = queryScalar(
    `select count(*) from common.clubs_gametypes where club_handle = ${lit('=' + HANDLE)}`,
  )

  console.log(`── handle      ${HANDLE} (${color})`)
  console.log(`── solo club   =${HANDLE} — ${count} gametypes`)
  console.log(`\n  Next: add ${HANDLE} to a club in the app's "New club" dialog.`)
  console.log(`  They sign in with a magic link to ${EMAIL} and land straight in.`)
}

main()
