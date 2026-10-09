# wordsy — FlipWord

**Not scheduled.** Decided in outline (Joel, 2026-10-08); nothing is built and
no branch exists. Brand **FlipWord**, codename `wordsy` by the roster's rule
that a folder carries the original game's name. Starts compete-only; the two
coop modes are in [Later](#later).

Wordsy is Gil Hova's real-time word game (Formal Ferret 2017, Allplay 2025).
Eight consonant cards sit in four columns worth 5, 4, 3 and 2. Everyone writes
one word at once, using any letters at all; only the faceup letters score. The
first player to lock in flips a 30-second timer, and when it runs out every
word is revealed and scored. Seven rounds, keep your best five, add the
bonuses, highest total wins. The flip is the one act a player takes besides
writing, which is where the brand comes from.

## The rules, as the rulebook has them

The 2025 Allplay rulebook, with the 2017 edition and the designer's forum
answers where the 2025 book is silent. Nothing here is ours; the next section
says what the app changes.

**The deck.** 60 cards, no vowels. Common cards score their column alone;
rare cards add the bonus printed on them.

| kind | letters | copies | each |
|---|---|---|---|
| common (green) | B C D G L M N P R S T | 4 | 44 |
| rare red, +1 | F H K V W Y | 2 | 12 |
| rare blue, +2 | J Q X Z | 1 | 4 |

**Dealing.** Four point cards in a row, 5 4 3 2. Two faceup letters above
each, dealt right to left. The two rules of two: never more than two of the
same letter faceup, and never more than two rare cards faceup, red and blue
together; a third is discarded and redrawn.

**A round.** No turns. Everyone thinks and writes at once, changing their
word freely. Any player who is ready locks in and starts the timer; they are
the round's **Fastest Wordsmith** and may not change their word. Everyone else
has 30 seconds. When the timer runs out, everyone reveals and scores.

**Scoring a word.** Add the column values of the faceup letters the word
uses, plus the printed +1 or +2 on a rare card. Each card scores once: a word
with two Bs against one B card scores one B; a word with one C against two C
cards scores the higher-valued C. The word may be any length and use any
letter in the alphabet; letters not faceup score nothing.

**Bonuses.** Two, checked after scoring, worth more as the game goes on:

| rounds | you beat the Fastest Wordsmith (not tied) | you are the Fastest Wordsmith and tie or beat enough opponents |
|---|---|---|
| 1 to 3 | +1 | +2 |
| 4 to 6 | +2 | +3 |
| 7 | +3 | +4 |

"Enough opponents" is at least 3, or both in a 3-player game. The 2025 book
says nothing about 2 players; the 2017 rules say every opponent at 2 and 3
players (BGG Rules forum, August 2025). The two editions differ at 4 players:
2017 needs 2 of the 3 opponents, 2025 needs all 3.

**Word rules.** A correctly spelled dictionary word. No proper nouns,
hyphenated words, abbreviations, contractions, or words from another
language. An **original** word: nothing anyone scored in an earlier round, and
a change of only class, number, gender or tense is the same word (fish,
fishes, fishing, fishy are one word; fisherman and shellfish are others). Two
players revealing the same word in the same round both score it. Earlier
words are public and may be asked about at any time.

**Challenges.** Any player may challenge a word against an agreed reference.
A correct challenge scores the word 0; a wrong one marks a 2-point penalty on
the challenger.

**New round.** The Fastest Wordsmith takes the **No Flip** card and may not
start the timer next round (not at 2 players). The four letters in the 3 and
2 columns are discarded, the other four slide right into them, and four new
letters are dealt into the 5 and 4 columns. The next round starts the moment
the last card lands.

**Game end.** After seven rounds, cross out your two worst word scores and
add the best five, add every bonus, subtract every penalty. Highest wins; a
tie is shared.

**No-timer variant.** A random **First Wordsmith** at the start; everyone
takes as long as they need; the First Wordsmith stands in for the Fastest
when scoring. Each round the player with the fewest bonuses becomes the next
First Wordsmith, ties to the closest clockwise.

**Solo** is on the back of the No Flip card, which no source reproduces. The
2016 preview describes the version it was built from: the timer starts on the
middle spot of a three-spot track; a round of 15 or more while you paused the
timer earns a bonus, the better one if the timer sits on the top spot; a
round under 20 moves the timer down, and falling off the track costs a
penalty and resets it; a round of 20 or more while paused moves it to the
top. Win at 100, 110 or 120. The designer confirmed on BGG that the solo
timer gets its full time each round.

## What the app does with that

- **The server deals, holds, scores and marks.** It deals under the two rules
  of two, holds each player's word until the clock ends, scores it, and marks
  the bonuses. Nobody sees another player's word during a round; the reveal
  is the event log's row for that round, every player's word with its score
  and bonus.
- **The 30-second clock lives in the timer area**, started by the first
  lock-in. This is the first game to put anything but the whole-game timer
  there, and FlipWord offers no whole-game timer at setup. A player still
  typing at the buzzer scores whatever is on the board.
- **The flip is the bell.** There are no turns, so the one alert is "someone
  locked in, 30 seconds": the bell and flash every game with a turn carries.
- **Challenges and penalties disappear.** The server checks the dictionary
  ([docs/word-list.md](../docs/word-list.md), the may-enter tier at the band
  chosen at setup), so there is no reference to argue over and nothing to
  penalize. The player board's penalty row has no counterpart.
- **"Already scored" is the root word.** `common.words.root_word` is the
  lemma, so a word is refused when its root matches the root of anything
  scored in an earlier round. That is the rulebook's class, number, gender and
  tense rule, near enough.
- **A non-word is refused at lock-in**, so the player can retype while the
  clock runs. The same for a word already scored.
- **The ending** ranks every player by best five plus bonuses; a tie is
  co-winners, as setgame's is.
- **The deck is deep enough.** Seven rounds draw 32 cards plus the two rules'
  redraws; 60 never runs out, so there is no reshuffle.

## Decided — Joel's answers, 2026-10-08

1. **Compete only to start.** "i'm happy to start with compete, but i imagine
   we'll add a solo-coop mode later. and maybe even a team-coop (plays just
   like solo-coop, but any player can enter the word)."
2. **The 30-second round clock in the timer area, instead of a whole-game
   timer.** "we can use our time mechanism for that instead of whole-game
   timer. this will be our first game to use the timer area for anything
   other than whole-game timer."
3. **The no-timer variant is a setup choice.** "yes"
4. **Two players: tie or beat your one opponent**, from the 2017 rules via
   BGG. The 4-player threshold follows the 2025 book, all 3 opponents, since
   it is the edition in print (proposed, not yet ruled on; open question 1).
5. **A non-word is refused, not scored 0.** "initially, we can refuse the
   word: otherwise, it feels to penalizing if they enter a band-5 word when
   playing a band-4 game." A setup option later, perhaps.
6. **Brand FlipWord.** "I'll take flipword"
7. **A non-word caught by the buzzer scores 0 and the log row says "invalid
   word".** Whatever is typed at the clock's end is scored; if it is not in
   the dictionary, that is the round's word and its score.
8. **The default band is 4.** The dictionary band is a setup choice as in
   the other word games; Wordsy rewards long, rare words (the rulebook's
   examples are QUIBBLES, BACCALAUREATES and LIQUEFACTION), so the default
   sits a step above the roster's usual.
9. **The code for [docs/features.md](../docs/features.md) is `FW`.**

## Open questions

1. **Four players**: the 2025 book's all 3 opponents, or the 2017 rules' 2 of
   3? The editions agree at every other count. Proposed: 2025, the edition in
   print.

## Later

- **Solo-coop**: the solo card's chase of 100, 110 or 120 with the pause
  mechanic, played by one person. Needs the 2025 card's actual text, or the
  2016 version above if the card never surfaces.
- **Team-coop**: the same chase, any player may enter the word.
- **Scoring a non-word as 0** as a setup option, the rulebook's way.

## Reference

- [Allplay rulebook PDF](https://assets.allplay.com/board-games-wordsy-rulebook-link.pdf)
  (2025 edition; the player board on page 2 carries the bonus table).
- [RulesPal's transcription](https://rulespal.com/wordsy/rulebook).
- [BGG Rules forum: "Bonuses at 2 players"](https://boardgamegeek.com/thread/3556885),
  [same word in the same round](https://boardgamegeek.com/thread/2912845),
  [spelling](https://boardgamegeek.com/thread/1989520),
  [solo timer](https://boardgamegeek.com/thread/2449422).
- [What's Eric Playing preview, 2016](https://whatsericplaying.com/2016/10/30/wordsy/)
  (the solo rules and the per-player-count thresholds of the 2017 edition).
- [BoardGameGeek](https://boardgamegeek.com/boardgame/208480/wordsy).
