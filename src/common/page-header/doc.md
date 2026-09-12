# page-header

The top strip every page carries (`PageHeader`) and the marks in it: the menu
trigger (`PageHeaderMenu`), the icon-only header mark every other control is
built on (`PageHeaderButton`), the chat and scratchpad toggles, and the status
slot that shows the players strip until the page's global feedback slot has a
message to draw instead. It is no one page's, which is why it lives here
rather than under home, club or game. `ChatButton` shows the app-root
`act-open-chat` through `useAppAction` (its bubble names the key via
`nameWithKey`); `ScratchpadButton` binds `act-open-scratchpad` itself.
