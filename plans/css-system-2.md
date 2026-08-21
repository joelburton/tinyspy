# CSS System 2

IMPORTANT: This draws from the wisdom in css-philosphy, and from the some of
the decisions in css-system but it is written because many ideas in those
FAILED: we ended up building part of a system that was too complex and too
hard to understand, and wouldn't maintain well. We should read those files
to see if there were good ideas or decisions in those not here, but on any
conflict, this document is correct.

## Goals

The site has 16 games. Most them share a great deal of similarity, to the degree
that they should have relatively little customized CSS. Instead, our approach
to CSS caused us to explode in CSS lines, with much of it merely duplicating
CSS elsewhere.

This led to:

- duplicate CSS because the same choices were made in many places

- CSS that should have been the same (because it styled something with the same meaning) often didn't align. For example, we have help text (light gray text) often styled differently in different places, for no good reason. We have over 20 different shades of gray, when probably 7 or so are actually trying to communicate different things.

Much of this derives from our unchecked use of CSS Modules (this covered in css-philosophy.md): this led us to create in trying contain CSS for a certain game or component, but this was almost always wrong: this is an app where consistency is strongly desired, the games *should* look alike, the UI conventions should be shared.

The goal here is to dramatically reduce the amount of CSS that isn't needed and to
make it much easier for an easier-to-reason about and consistent app.

## Theming

Our app currently has a general colorscheme: a light-mode theme. Moving forward, this
theme will have the name "daylight". In this doc, we refer to 4 themes:

- daylight: classic light theme
- midnight: classic dark theme
- cupcake: an imaginary pink and cheery light theme
- horror: an imaginary dark and broody dark there

It's not our goal to build cupcake or horror; it simplifies our conversations to
frame as "what would be the same as different in 'cupcake'"

Themes will be almost entirely about color; a different theme will almost never
change spacing, border, margins, font sizes, etc. Typically, switching a theme
would show the same pixels in the same places, changing only by color.

Rationale: the layout for our app is very precise and difficult to change.
Themes will not change that.

## Patterns

One analysis Claude raised was that we have so much duplicate CSS because we
don't declare "patterns" in the current code/CSS:

- we have lots of pop-up dialogs that have the same "shape": fields, save and
  cancel buttons, spacing between elements, etc, but don't have a class
  (either React class or CSS class to capture that)

## Big UI Concepts in the app

- the site has the same "chrome" (the non-game portions).

- "boardCol": the game board and things above/below it

- "infoCol": meta information about the game

- "pills": pills are our feedback mechanism; they can appear in the header and
  also below the board. They look the same and serve the same general semantic
  purpose: show info to the player. The header one is "global feedback":
  generally shows "info about the
  other players", like their status and moved. The below board is "local
  feedback", it tends to show info to *this* player about things for *them*.

- "families": A family is a set of variations for a color (like an outcome
  family or a game-chrome family). Different categories of families may have
  different variants, however, each family-category should always be rectangular:
  if outcomes families have 7 variants, all outcome families must have
  exactly 7. We may not use all now, but these are calculated together and
  reserved, and should never be removed through a sweep.

- outcomes: "outcomes" is list of names for "an outcome of a game or a move
  in a game": lost/won/near/warning/neutral:
  - won: won game or a good move
  - lost: lost game or a bad move
  - near: close-to-right move or a game that might be tied or such
  - warning: a move that cannot be made (eg, "not a word" in boggle)
  - neutral: a move that communicates neutral info

  we associate colors with these outcomes; these colors should ideally ONLY
  be used exactly for outcomes. however, there will be some that are "near":
  a losing move outcome is "red". game chrome buttons (see below) need a "red",
  too, but it should be a different red, communicating that this isn't a bad
  move, it's a dangerous action (like deleting something).

  outcomes are shown as pill colors, as bars in the turn-log (showing the
  outcome for a move), as tile colors ("this tile was correct"), and such.
  outcomes need many variants, because we need text, outlines, fills, and so
  one.

- chrome "buttons" are chrome things you can do (typically: buttons shown
  in chrome). A better name should be found.

  there are several kinds of "buttons":
  - success: a successful action
  - destructive: a dangerous action (like "delete a game", "reveal the solution")
  - caution: an action to be warned about (like "get a hint", "you have 1 move left")
  - action: an action which is neutral on good/bad/danger, but is an "reasonably
    expected action" (for example, "new game", "restart game")
  - quiet: an action which is uncommon (cancel on forms, return to club while
    playing a game, etc)

  "Action" is a bad name, because we call all of these kind of buttons "action"
  buttons because the perform an action. A better name is needed.

  Buttons can be:
  - "primary" (filled, indicating "this is the action that you probably should
    do" or "this is the default"). Any kind can be primary.
  - "secondary" (unfilled). Not the default, not especially drawn to.

- text: we rarely color text-in-general, though we use gray for things like
  hints and other less-important text. The places where we use colored text
  is mostly when showing an outcome of a game outside of a pill or button.

- "history": most games allow you to go back and see the board in an earlier
  state. This temporarily changes the board view; to demonstrate that you're
  viewing history, we put a thick frame around the board

- "your move": when it's your turn to move in a multiplayer gave, we give a
  a similar frame around the board (but in a different color)

- "preview": one game, scrabble, can let players show other players a potential
  move: this is like "history that hasn't happened yet" in some way: "hey, what
  do you think about this play?"

- member colors: there are 8 different colors for member identities. each is
  a color and a border-color. The colors are already chosen and won't change.
  They have no relationship to any other color (we may have a green player
  color, but it shouldn't be the same green as a winning outcome or a successful
  move). The borders should be dark in light-mode and dark in light mode.

## Light Mode is default

We only have light mode now; Joel will himself probably always play light mode,
and light mode is how he envisions the game in his head. We've tried to use
"polarity neutral language" (when a button is hovered, it's color
"moves away from the page" (darker on light mode, lighter on dark mode)). That
hasn't worked; it's confusing for Joel.

Instead, in code and comments and conversations, we use language from the
perspective of light mode: the hover effect for a button should be described
as "dim-down" (make darker), even though in dark mode, the opposite thing
actually should happen. That will make writing and reading dark mode more
difficult, since the reader/writer must translate in their head. However, it
makes everywhere else in the codebase harder to read and understand.

## CSS should be semantic, sometimes mildly so, sometimes heavily so

Right now, much of our CSS is semantic (though often with dumb names). We've
been experimenting with "don't use semantic classes in the raw, use a 'role'
for that". But that has mostly produced lots of not-helpful names and
brain-translation anyway.

So, for example, "lost" (which is actually red right now in our theme) should
be called "lost" (not "red"). This helps enforce the "there's a meaning for
this color family" and promotes readability. "--pill-lost-border-color" is
clear that this is the border for a "lost" (move/turn) game.

## "Brand colors"

Many games have a "brand color": spellingbee has a honey-ish yellow, for
example. These colors are NOT the same as other families. We should use a
different yellow than we use for outcomes "near". We shouldn't use "near"
in spellingbee as a theme color, nor should we use spellinbee's honey elsewhere.

## "Tiles"

Different themes will have different colors for tiles. Each theme should provide
the tile-1...tile-5 and 1...5 edges and the other tile colors. There's no
semantic meaning for tiles, and it's fine to use these colors for other
game-ish thing (I think we use a variation of these colors for the scrabble
rack; it's like "a very dark tile", etc)

## Families

A family has a purpose and meaning. "lost" is an outcome family, and used for
talking about outcomes. "dangerous" is a chrome-button family, and used for
that.

We have a few current colors that we use in several places without a clear
meaning everywhere they're used: we use teal & purple for co-op and compete-mode
labels. But that's a light association; we don't think "that purple shade
should be used only for co-op". We can consider these color "fully built out
for variations, and flexible to use for one-off cases", to avoid needing to
invent new colors for any other rare, one-off case.

## Files and what we expect them to contain