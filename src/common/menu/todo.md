# menu — todo

## Bugs

## Soon

- **`setGameSections` is a `setState`, and that costs more than it looks.** Every
  menu rebuild re-renders the whole game page, and — worse — it forces the thing
  a menu row IS to keep a stable identity: a game's menu effect lists its rows in
  its deps, so a row object that changed each render would set state, re-render,
  rebuild, and loop (verified 2026-09-10; the probe hung). That constraint is why
  `useBoundAction` writes two refs during render against `react-hooks/refs`,
  waived there with a pointer here.

  The fix is for GamePage to keep the sections in a REF and notify subscribers,
  so pushing a menu re-renders the MENU and nothing else. Then a bound action can
  be an ordinary value rebuilt each render, both waivers go, and a stale captured
  row stops being possible. Do it when this area opens; it is a change to
  `GamePage` + `<Menu>`, not to any game.

## Someday

## Maybe
