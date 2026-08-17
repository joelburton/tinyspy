import type { Card } from './cards'

/**
 * What the board shows in the second after a claim, and to whom.
 *
 * ── The problem ─────────────────────────────────────────────────────────────
 * A claim substitutes cards IN PLACE: three leave and three arrive in the same
 * slots. On a local stack that lands in one beat and reads fine. Over a real
 * connection the board simply DIFFERS a moment later — and if you were looking
 * at another corner of it, nothing told you. The first attempt at a fix dealt
 * the replacements in one at a time, on the theory that motion draws the eye;
 * it doesn't, if the thing moving is a thin ring on a white card. It also made
 * the board partly unplayable for the length of the deal, which is worse: a
 * player who can think fast should be able to act fast.
 *
 * So the mark is LOUD (a filled background, not a border) and the deal is
 * INSTANT. What costs time is deliberate: the departing cards are held on
 * screen briefly so you can see what left.
 *
 * ── Who sees what ───────────────────────────────────────────────────────────
 * The claimer and everyone else have different information, so they get
 * different marks:
 *
 *   claimer   their three cards DIM from the moment they click the third —
 *             before any server answer — and stay dim through the hold. Dim,
 *             not lit: they know what they did, and colour would drag their eye
 *             back to a decision they have already made. The dim doubles as
 *             network feedback: if it sits there for two seconds, that is
 *             exactly how long the round trip took, and saying "I heard you,
 *             I can't tell you the answer yet" is the honest thing to show.
 *   everyone  the departing set lights up, then the arrivals light up.
 *   else
 *
 * Both clear at the same instant, and that symmetry is load-bearing rather than
 * tidy: if the claimer's board updated while everyone else still held ghosts,
 * the claimer would see the replacements early — a real edge in compete.
 */

/**
 * How long the departing cards are held, and how long arrivals stay lit.
 *
 * Settled by watching them, after a spell turned up to 3s/6s purely so the
 * colours could be judged. The ratio is deliberate — arrivals get twice the
 * departure, because a departure only has to be NOTICED while an arrival has to
 * be read: three new cards are three new sets to look for.
 *
 * Short enough that a fast compete table doesn't sit under a permanently
 * coloured board, which is the state in which loud stops meaning anything. The
 * hold is also the only thing here that costs time — it delays the replacements
 * by exactly this much for everyone, which is what keeps the claimer from
 * seeing their own new cards early.
 */
export const DEPART_MS = 600
export const ARRIVE_MS = 1200

/**
 * The three marks a card can wear during a claim — one per row of the table
 * above: `held` is the claimer's own dim, `leaving` is everyone else's view of
 * the same cards, `arriving` is the replacements.
 */
export type FlashKind = 'held' | 'leaving' | 'arriving'

/**
 * What changed between the board on screen and the board the server now has.
 *
 * Compared SLOT BY SLOT, never as a set difference. A claim on a fifteen-card
 * table compacts back to twelve, which MOVES cards from the end into the holes:
 * those cards were already on the board, so "which cards are new?" finds
 * nothing and the three that moved land silently — the one case where you most
 * need to be told where things went. What matters is not whether a card is new
 * to the game but whether it is new to the slot you are looking at.
 *
 * Call this only when a CLAIM caused the change. It cannot tell — and must not
 * guess — the difference between a claim and a fresh deal; see `PlayArea`,
 * which reads the cause off the event log instead.
 */
export function claimTransition(
  shown: readonly Card[],
  board: readonly Card[],
): { leaving: Card[]; arriving: Card[] } {
  const leaving: Card[] = []
  const arriving: Card[] = []
  const slots = Math.max(shown.length, board.length)
  for (let i = 0; i < slots; i++) {
    if (shown[i] === board[i]) continue
    if (shown[i] !== undefined) leaving.push(shown[i])
    if (board[i] !== undefined) arriving.push(board[i])
  }
  return { leaving, arriving }
}
