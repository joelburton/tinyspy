// cs-audited-feedback

import type { ReactNode } from 'react'
import type { Outcome } from '../outcomes/outcomes'
import type { NotOkEnvelope } from '../supabase/envelope'
import { notOkOutcome } from '../supabase/dbResult'
import type { Member } from '../members/member'
import { DotActor } from '../members/ActorMention'
import type { TerminalMessage } from '../terminal/terminalMessage'
import { waitingForText } from '../info-sheet/turnText'

/**
 * A FEEDBACK MESSAGE — the one thing a feedback slot holds and a pill draws.
 *
 * Reach for a static constructor, never a literal: `FeedbackMessage.notOk(res)`
 * when the server said no, `.result('lost', 'Not a word')` for the FE's own
 * verdict on a move, `.terminalVerdict(over)` when the game ends, `.waiting(m)`
 * while it is a teammate's turn, `.peer(m, 'won', 'found APPLE')` to narrate
 * someone else. Each names a KIND, and the kind is what decides how the message
 * looks and leaves (below). Hand it to a slot: `localFeedbackSlot.show(msg)`.
 *
 * A class with a private constructor on purpose: an object literal cannot be
 * one, and a spread loses the getters, so a hand-built or re-ranked message
 * is a compile error — in tests too. The one door in is a constructor, and
 * every constructor takes `overrides` for the rare site that needs to bend
 * its kind's behavior in the open.
 */

/** How a message leaves its slot. */
export type LeavesBy =
  | 'gesture' // the player's next action: any key, a tile click, a tap on the pill
  | 'timer'   // on its own, after `ms`
  | 'close'   // the × on the pill, and nothing else
  | 'owner'   // whoever showed it retracts it when the condition ends

/**
 * The buckets of behavior. A kind is not a shape of words: several
 * constructors can make messages of one kind (`outOfRace` and `standingState`
 * are both a `standingState`). What a kind decides is the row in `KINDS`.
 */
export type Kind =
  | 'notOk'
  | 'terminalVerdict'
  | 'standingState'
  | 'result'
  | 'acknowledgment'
  | 'hint'
  | 'waiting'
  | 'standingNote'
  | 'prompt'
  | 'chat'
  | 'peer'
  | 'peerStatus'

/** What a kind decides for every message of it. */
export type KindDefaults = {
  // The tinted background — worn only by a state that is final for you.
  fill: boolean
  // Which live message the slot draws: LOWER shows over higher. A rank is a
  // priority and nothing more — showing a message never takes another down —
  // so two kinds may share one where neither outranks the other, and the slot
  // then draws the newest. Spaced by ten to leave room between two.
  rank: number
  leavesBy: LeavesBy
  // Read only when `leavesBy` is `'timer'`.
  ms: number | null
  // Fixed for the kind, or `null` when the constructor supplies one.
  outcome: Outcome | null
}

/**
 * THE table. Every behavior a message has comes from its row here, and a
 * call site never writes one of these fields — it names a constructor.
 * docs/ui.md → Feedback pill describes each kind for a reader.
 */
export const KINDS: Record<Kind, KindDefaults> = {
  // The server said no. Read why, press the ×. Above the verdict, so a move
  // that raced the game's end still gets its "Someone got there first", and
  // the × then shows the "Lost" it lost to.
  notOk:           { fill: false, rank: 10, leavesBy: 'close',   ms: null, outcome: null },
  // The game is over, and this is how it ended.
  terminalVerdict: { fill: true,  rank: 20, leavesBy: 'owner',   ms: null, outcome: null },
  // A state you are in for the rest of the game: out of the race, sudden death.
  standingState:   { fill: true,  rank: 30, leavesBy: 'owner',   ms: null, outcome: null },
  // What your last action did, in the FE's own words.
  result:          { fill: false, rank: 40, leavesBy: 'gesture', ms: null, outcome: null },
  // A success you already saw on the board, said once and gone. Shares the
  // result's rank: two ways of saying what your last action did, neither
  // above the other.
  acknowledgment:  { fill: false, rank: 40, leavesBy: 'timer',   ms: 1400, outcome: null },
  // A hint you asked for, kept up while you hunt with it. Below results so
  // "Not a word" shows over it and the hint is back when that clears.
  hint:            { fill: false, rank: 50, leavesBy: 'close',   ms: null, outcome: null },
  // Whose turn it is, when it is not yours. Above a board note: when both are
  // true it is not your turn, so the note describes something you could not
  // act on anyway and the wait is what explains the screen.
  waiting:         { fill: false, rank: 55, leavesBy: 'owner',   ms: null, outcome: 'neutral' },
  // A state the BOARD is in until something changes; no fill because it is
  // not final.
  standingNote:    { fill: false, rank: 60, leavesBy: 'owner',   ms: null, outcome: 'neutral' },
  // What an empty slot says. Everything outranks it.
  prompt:          { fill: false, rank: 70, leavesBy: 'owner',   ms: null, outcome: 'neutral' },
  // A chat line, announced in the header. Above a narration: a person typing
  // at you outranks an automatic one.
  chat:            { fill: false, rank: 75, leavesBy: 'timer',   ms: 2000, outcome: 'neutral' },
  // A peer did something; the header says so and lets it fade.
  peer:            { fill: false, rank: 80, leavesBy: 'timer',   ms: 3000, outcome: null },
  // What a peer is doing right now, kept up while they do it. The bottom of
  // the header: every piece of news shows over it, and it is drawn again when
  // the news fades.
  peerStatus:      { fill: false, rank: 85, leavesBy: 'owner',   ms: null, outcome: 'neutral' },
}

/**
 * A call site's way to bend a kind's defaults for one message — a different
 * outcome for a waiting message, `{ leavesBy: 'timer', ms: 500 }` for a
 * result that should fade. Uncommon by design: the table is the default, and
 * an override at a site is a decision made there, in the open.
 */
export type Overrides = Partial<KindDefaults>

/** The person a message is about — the two identity fields of a `Member`. */
export type Actor = Pick<Member, 'username' | 'color'>

/** The kind's row, the outcome this constructor chose, then the site's overrides on top. */
function defaultsFor(kind: Kind, outcome: Outcome | null, overrides: Overrides | undefined): KindDefaults {
  const row = KINDS[kind]
  return { ...row, outcome: outcome ?? row.outcome, ...overrides }
}

export class FeedbackMessage {
  readonly kind: Kind
  readonly text: ReactNode
  readonly outcome: Outcome
  // Drawn before the text as the name-and-disc mention, by the pill. Set only
  // by the constructors whose sentence LEADS with the person; a constructor
  // whose mention sits mid-sentence (`waiting`) builds its node instead.
  readonly actor: Actor | undefined
  readonly #defaults: KindDefaults

  private constructor(kind: Kind, text: ReactNode, actor: Actor | undefined, defaults: KindDefaults) {
    this.kind = kind
    this.text = text
    this.actor = actor
    this.outcome = defaults.outcome ?? 'neutral'
    this.#defaults = defaults
  }

  get fill(): boolean { return this.#defaults.fill }
  get rank(): number { return this.#defaults.rank }
  get leavesBy(): LeavesBy { return this.#defaults.leavesBy }
  get ms(): number | null { return this.#defaults.ms }

  // ── rank 10: the server said no ──

  /** Every not-ok, whatever its severity, in the server's own words. */
  static notOk(res: NotOkEnvelope, overrides?: Overrides): FeedbackMessage {
    return new FeedbackMessage('notOk', res.message, undefined, defaultsFor('notOk', notOkOutcome(res), overrides))
  }

  // ── rank 20: the game is over ──

  /** The below-board verdict, from a game's `buildOver`. */
  static terminalVerdict(over: TerminalMessage, overrides?: Overrides): FeedbackMessage {
    return new FeedbackMessage('terminalVerdict', over.pillText, over.actor, defaultsFor('terminalVerdict', over.outcome, overrides))
  }

  // ── rank 30: a standing state, with the fill ──

  /**
   * You are out while the others race on: "Conceded — race continues" when
   * you conceded, or the game's own words for the other way out — out of
   * guesses, out of swaps, solved and waiting.
   */
  static outOfRace(myConceded: boolean, activeText = 'Lost — race continues', overrides?: Overrides): FeedbackMessage {
    const text = myConceded ? 'Conceded — race continues' : activeText
    return new FeedbackMessage('standingState', text, undefined, defaultsFor('standingState', 'neutral', overrides))
  }

  /** A game-specific standing state — codenamesduet's sudden death. */
  static standingState(outcome: Outcome, text: ReactNode, overrides?: Overrides): FeedbackMessage {
    return new FeedbackMessage('standingState', text, undefined, defaultsFor('standingState', outcome, overrides))
  }

  // ── rank 40: what your last action did ──

  /** The FE's own verdict on a move: `result('lost', 'Not a word')`. */
  static result(outcome: Outcome, text: ReactNode, overrides?: Overrides): FeedbackMessage {
    return new FeedbackMessage('result', text, undefined, defaultsFor('result', outcome, overrides))
  }

  /** A success you already saw on the board, said once and gone. */
  static acknowledgment(outcome: Outcome, text: ReactNode, overrides?: Overrides): FeedbackMessage {
    return new FeedbackMessage('acknowledgment', text, undefined, defaultsFor('acknowledgment', outcome, overrides))
  }

  // ── rank 50 to 60: what you asked for; whose turn it is; the board's state ──

  /** A hint you asked for. Stays until its ×, so a stray key can't cost you what you paid for. */
  static hint(outcome: Outcome, text: ReactNode, overrides?: Overrides): FeedbackMessage {
    return new FeedbackMessage('hint', text, undefined, defaultsFor('hint', outcome, overrides))
  }

  /** "Waiting for ● moth…" — the mention is mid-sentence, so no actor. */
  static waiting(member: Actor | undefined, overrides?: Overrides): FeedbackMessage {
    return new FeedbackMessage('waiting', waitingForText(member), undefined, defaultsFor('waiting', null, overrides))
  }

  /** A state you are stuck in, in the game's words: "Chain is full — remove a word". */
  static note(text: ReactNode, overrides?: Overrides): FeedbackMessage {
    return new FeedbackMessage('standingNote', text, undefined, defaultsFor('standingNote', null, overrides))
  }

  // ── rank 70 to 85: what an empty slot says; what the others are doing ──

  /** What an empty slot says: "Waiting for your move". */
  static prompt(text: ReactNode, overrides?: Overrides): FeedbackMessage {
    return new FeedbackMessage('prompt', text, undefined, defaultsFor('prompt', null, overrides))
  }

  /** A peer did something: `peer(moth, 'won', 'found APPLE +7')` → "● moth found APPLE +7". */
  static peer(member: Actor | undefined, outcome: Outcome, text: ReactNode, overrides?: Overrides): FeedbackMessage {
    return new FeedbackMessage('peer', text, member, defaultsFor('peer', outcome, overrides))
  }

  /**
   * What a peer is doing right now: `peerStatus(partner, 'writing clue')` →
   * "● moth writing clue". Not a `waiting` — this one names WHICH of several
   * things the peer is doing, so it is news about them rather than the fact
   * that you cannot act, and it ranks below every other piece of news.
   */
  static peerStatus(member: Actor | undefined, text: string, overrides?: Overrides): FeedbackMessage {
    return new FeedbackMessage('peerStatus', text, member, defaultsFor('peerStatus', null, overrides))
  }

  /**
   * A chat line: "● moth: hi everyone". Builds its own node rather than
   * setting `actor`, because its join is ": " with no gap and its sender is
   * bold (Joel, 2026-09-12) — both of which live on this one line.
   */
  static chat(member: Actor | undefined, text: string, overrides?: Overrides): FeedbackMessage {
    const node = (
      <>
        <strong><DotActor actor={member} fallback="a player" show="both" /></strong>: {text}
      </>
    )
    return new FeedbackMessage('chat', node, undefined, defaultsFor('chat', null, overrides))
  }
}
