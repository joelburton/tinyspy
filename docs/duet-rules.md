# Codenames Duet — rules cheat sheet

> Canonical spec the RPCs implement against. When a Duet rule is unclear, fix this file first, then the code.
> Sources: [Codenames Duet rulebook (PDF)](https://filemanager.czechgames.com/storage/files/codenames-duet/rules/codenames-duet-rules-en.pdf), [UltraBoardGames summary](https://www.ultraboardgames.com/codenames/codenames-duet.php).

## Setup

- 5×5 grid of 25 word cards.
- A single shared key card with two views (player A side, player B side). Each cell is independently labeled per side: **Green** (agent), **Neutral** (bystander), **Assassin**.
- Key card distribution (per Duet rulebook, 25 cells total):

| A \ B    | Green | Neutral | Assassin |
|----------|:-----:|:-------:|:--------:|
| Green    | 3     | 5       | 1        |
| Neutral  | 5     | 7       | 1        |
| Assassin | 1     | 1       | 1        |

- Each player sees **9 green / 13 neutral / 3 assassin** on their own side.
- Total green agents to find across the table: **15**.

## The clock

- Game starts with **9 timer tokens**.
- Exactly one token is spent at each turn end. Tokens are never refunded.
- A turn ends when the guesser:
  - hits a neutral (one of the clue-giver's tan cards), or
  - stops voluntarily.
- A turn does **not** end (and no token is spent) when the guesser reveals a green agent — they may keep guessing indefinitely. There is **no** clue+1 cap (that's normal Codenames, not Duet).
- Hitting the assassin ends the game immediately; token count is irrelevant.
- When the last token is spent and agents remain, the game enters **sudden death**.

## A turn

1. **Clue-giver** (alternates each turn, A first) gives one word + a number. The clue must relate to words that are green from their own view.
2. **Guesser** points to words one at a time. Each guess is resolved against the *clue-giver's* key view:
   - **Green** → place an agent marker. Guesser may continue (unlimited).
   - **Neutral** → place a neutral marker. Turn ends; spend a timer token.
   - **Assassin** → game lost immediately.
3. The guesser may stop voluntarily at any time. Doing so ends the turn and spends a timer token.
4. Reveal markers go on the **guesser's** side of the board, but the label comes from the clue-giver's key.

## End conditions

- **Win:** all 15 green agents revealed.
- **Lose (assassin):** any guess reveals an assassin on the clue-giver's side.
- **Lose (clock):** sudden death ends without finding all remaining agents.

## Sudden death

- Triggered when timer tokens hit 0 but agents remain.
- No more clues are given. Players take turns pointing at words from memory of past clues.
- Any non-green reveal (neutral or assassin) ends the game in a loss.

## Mission / campaign mode (deferred, not v1)

- Different maps in the rulebook start with fewer than 9 tokens (harder) or give bonus tokens.
- Skip for v1; hardcode 9.

## How this maps to the schema

- `games.turns_remaining` starts at 9. Decrements only on neutral reveal or voluntary stop.
- `games.status`: `lobby | active | sudden_death | won | lost_assassin | lost_clock`.
- `games.current_clue_giver` flips on every turn end.
- `words.revealed_as` stores the label from the clue-giver's view at reveal time, so post-game review can show "this neutral was guessed off A's clue."
- The assassin check is symmetric: `submit_guess` looks up the label on the *current clue-giver's* side of the key, not the guesser's.
