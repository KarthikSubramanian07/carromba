# Accessibility

Carromba aims for **WCAG 2.2 Level AA** on the pages and game states a person can reach in the browser.

## What was tested

- Automated audits with axe-core (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) at 1440×900, 390×844 and 320×800 on home, how-to, settings, AI game, local game, and in-game settings.
- Keyboard operation of menus, dialogs and the board (place, aim, power, fire, pause) without pointer drag.
- Focus order, visible focus, modal focus trapping, Escape to dismiss, and restored focus on close.
- Screen-reader-oriented live announcements for turns, messages (pocket/foul outcomes), scores and pause.
- Colour-independent cues for active side, piece colour chips and queen state.
- `prefers-reduced-motion` and an explicit pause control for ongoing board motion.

## Known limitations

- The canvas board is a single interactive surface. Individual men are not separately focusable in the accessibility tree; board state is summarised through the canvas name, HUD and live region.
- Online matchmaking still needs a second player (or a second browser) to exercise the waiting-room path end to end.
- Visual placement of pieces on the felt remains the primary way to judge shot geometry; keyboard aim uses the same on-board aim overlay as pointer play.

## Report a barrier

Open an issue at https://github.com/KarthikSubramanian07/carromba/issues with the page or mode, browser/assistive tech, and what you expected.
