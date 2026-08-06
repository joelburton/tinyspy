import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { asUser, type E2EClub, type E2EMember } from '../helpers/fixtures'

const URL = 'http://127.0.0.1:54321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

/**
 * The gallery plays as the DEV PERSONAS, not throwaway accounts.
 *
 * The point is that its games are yours to open. Games built by
 * `e2eg…@e2e.test` users exist in the local database but are invisible to
 * anyone signed in as joel — club membership gates every read — so the sheet
 * could show you a state you then couldn't go and poke at. Seating the seeded
 * personas fixes that: every game the gallery makes is one you can load in a
 * browser, tweak the FE against, and refresh.
 *
 * joel + moth for a two-player game, + leah where a game wants three. They come
 * from supabase/seed.dev.sql (`gmake db-seed`); log in as any of them with a
 * magic link and read the code out of the local mail server at :54324.
 */
const PERSONAS = ['joel@test.local', 'moth@test.local', 'leah@test.local'] as const

/**
 * A session for a seeded persona.
 *
 * They have no password — the seed makes magic-link accounts — so this mints a
 * single-use OTP with the Admin API and redeems it, the same trick
 * `supabase/scripts/add-user.ts` uses to claim a handle on someone's behalf. No
 * email is sent; `generateLink` returns the token instead of mailing it.
 */
async function sessionFor(email: string): Promise<E2EMember> {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (link.error) throw new Error(`generateLink(${email}): ${link.error.message}`)
  const otp = link.data.properties?.email_otp
  if (!otp) throw new Error(`generateLink(${email}): no email_otp`)

  const anon = createClient(URL, ANON, { auth: { persistSession: false } })
  const verified = await anon.auth.verifyOtp({ email, token: otp, type: 'magiclink' })
  if (verified.error || !verified.data.session) {
    throw new Error(`verifyOtp(${email}): ${verified.error?.message ?? 'no session'}`)
  }
  const session = verified.data.session
  const username = execFileSync(
    'psql',
    [LOCAL_DB, '-X', '-tA', '-c',
     `select username from common.profiles where user_id = '${session.user.id}';`],
    { encoding: 'utf8' },
  ).trim()
  if (!username) {
    throw new Error(`${email} has no profile — run \`gmake db-seed\` (see seed.dev.sql)`)
  }
  return { username, userId: session.user.id, session }
}

const cache = new Map<string, E2EMember>()

/**
 * A club for one game, owned by the personas — created once and REUSED.
 *
 * One club per game rather than one for everything, so a club's page reads as
 * that game's states rather than a pile of fifteen games. Reused across runs
 * because the handle is derived from the name, so re-running the gallery adds
 * games to the same club instead of leaving a trail of near-identical ones.
 */
export async function galleryClub(brand: string, members: number): Promise<E2EClub> {
  const wanted = PERSONAS.slice(0, Math.max(2, Math.min(members, PERSONAS.length)))
  const seats: E2EMember[] = []
  for (const email of wanted) {
    if (!cache.has(email)) cache.set(email, await sessionFor(email))
    seats.push(cache.get(email)!)
  }

  const name = `Gallery ${brand}`.slice(0, 20)
  const res = await asUser(seats[0].session.access_token)
    .schema('common')
    .rpc('create_club', { club_name: name, member_usernames: seats.map((s) => s.username) })
  if (!res.error) return { handle: res.data as string, members: seats }

  // 23505 = the club already exists from an earlier run, which is the point of
  // a stable name. Reuse it rather than inventing "Gallery SnakeBox 2".
  if (res.error.code !== '23505') throw new Error(`create_club(${name}): ${res.error.message}`)
  const handle = execFileSync(
    'psql',
    [LOCAL_DB, '-X', '-tA', '-c', `select handle from common.clubs where name = '${name}';`],
    { encoding: 'utf8' },
  ).trim()
  if (!handle) throw new Error(`club "${name}" exists but wasn't found by name`)
  return { handle, members: seats }
}
