# Prioritized frontend backlog

  

## Priority 1 — Replace the most visible mock behavior

These are the items that most affect whether the app feels “real” when someone actually uses it.

### 1 Real legal move generation

****Current situation****

-   legal move indicators are mocked/fallback-driven when backend support is absent

****Why this is priority 1****

-   this directly affects the core board experience
-   if move hints are wrong, the whole UI feels unreliable

****Target outcome****

-   selected-square move hints always come from real backend rules state
-   move highlighting reflects actual legality

****Type****

-   ****Should be backend-backed****

  

### 2 Real move validation and authoritative move execution

****Current situation****

-   the board can still function in a superficial fallback mode
-   move history may appear to work even when moves are not truly validated

****Why this is priority 1****

-   this is the second core credibility issue after legal moves
-   the backend should be the authoritative source of truth for:
-   -   valid move acceptance
    -   current board state
    -   turn
    -   game status

****Target outcome****

-   frontend never “accepts” moves that backend would reject
-   session state is always backend-derived when backend is available

****Type****

-   ****Should be backend-backed****

  

### 3 Real engine move

****Current situation****

-   fallback engine move is effectively a placeholder

****Why this is priority 1****

-   in “player against engine”, this is one of the most obvious mocked areas
-   users will notice immediately if engine replies are fake

****Target outcome****

-   engine move button and auto-reply both use real backend engine choice
-   no hardcoded fallback move except maybe explicit offline demo mode

****Type****

-   ****Should be backend-backed****

  

### 4 Real recommendation panel

****Current situation****

-   recommendation panel still falls back to fake opening-book / engine suggestions

****Why this is priority 1****

-   recommendations are a key “intelligence” feature
-   fake values make the UI look complete but not trustworthy

****Target outcome****

-   book suggestions come from real Polyglot lookup
-   engine suggestions come from real backend analysis
-   cached indicators are meaningful

****Type****

-   ****Should be backend-backed****

  

## Priority 2 — Complete the analysis and replay experience

These are the next most valuable areas once core game interaction is real.

### 5 Real engine analysis results

****Current situation****

-   analysis panel can display fallback/mock data

****Why this is priority 2****

-   once recommendations and engine move are real, analysis should also be consistent
-   this is especially important for “Game analysis” mode

****Target outcome****

-   analysis panel displays real backend lines
-   if available: depth, score, PV, cache marker, raw engine info

****Type****

-   ****Should be backend-backed****

  

### 6 Real replay frame generation

****Current situation****

-   PGN details are mostly useful already
-   replay frame stepping is simplified in fallback mode

****Why this is priority 2****

-   PGN metadata is already valuable
-   but replay becomes much better once each frame maps to a real board position

****Target outcome****

-   replay prev/next navigates real frame states
-   board updates meaningfully per replay step
-   PGN details and replay stay in sync

****Type****

-   ****Should be backend-backed****

  

### 7 Better redo behavior

****Current situation****

-   redo is weak/placeholder in mock mode

****Why this is priority 2****

-   less critical than legal moves or engine integration
-   still worth fixing to make session controls consistent

****Target outcome****

-   proper redo stack behavior
-   consistent with backend undo/redo state

****Type****

-   ****Should be backend-backed****

  

## Priority 3 — Improve robustness and consistency

These items are less visible than core chess behavior, but improve daily usability and reduce confusion.

### 8 Better backend availability / fallback indicator

****Current situation****

-   the frontend silently falls back to mock behavior

****Why this matters****

-   users may not realize they are looking at fallback data
-   this makes debugging and trust harder

****Target outcome****

-   clear status indicator, for example:
-   -   “Connected”
    -   “Offline fallback”
-   optionally shown in header or settings/about

****Type****

-   ****Frontend-only****, but should reflect backend state

  

### 9 Settings persistence clarity

****Current situation****

-   settings form works in fallback mode too
-   but in fallback mode changes are not truly persisted to backend config

****Why this matters****

-   users may think they have saved real settings when they have not

****Target outcome****

-   clearer distinction between:
-   -   backend-saved settings
    -   local/fallback-only settings
-   optionally disable save or show a warning in fallback mode

****Type****

-   ****Partly backend-backed, partly frontend UX****

  

### 10 Improve error handling / user feedback

****Current situation****

-   some flows still use basic alerts
-   little contextual feedback on what failed

****Why this matters****

-   once more backend features are wired, failures will need clearer explanation

****Target outcome****

-   inline or toast-style feedback for:
-   -   invalid move
    -   PGN parse issue
    -   backend unavailable
    -   engine not configured
    -   save settings failed

****Type****

-   ****Frontend-only****, but supports backend integration

  

## Priority 4 — Nice-to-have UX improvements

These are useful after the core backend connectivity is solid.

### 11 Drag-and-drop PGN file support

****Current situation****

-   PGN file upload exists
-   drag-and-drop is not yet there

****Why lower priority****

-   it is convenience, not correctness

****Target outcome****

-   drag a `.pgn` onto the app or dialog to load it

****Type****

-   ****Frontend-only****

  

### 12 Better replay / move synchronization

****Current situation****

-   PGN details and replay exist
-   there is room for tighter synchronization

****Potential improvements****

-   highlight current replay move row
-   scroll move list to current item
-   keep PGN details and replay frame indicator aligned

****Type****

-   ****Mostly frontend****, with backend-backed replay frames

  

### 13 Better FEN workflow

****Current situation****

-   FEN dialog and validation are already useful

****Possible improvements****

-   show parsed status preview before loading
-   support “load as analysis position”
-   show why a FEN is legal structurally but not a meaningful game state

****Type****

-   ****Frontend-first****, possibly backend-assisted later

  

### 14 Better mobile/responsive layout polish

****Current situation****

-   responsive behavior exists, but likely still pragmatic

****Possible improvements****

-   better sidebar behavior on narrow screens
-   improve dialog spacing on mobile
-   better stacked layout for smaller boards/panels

****Type****

-   ****Frontend-only****

  

# Keep frontend-only (do not prioritize backend integration unless you explicitly want roaming preferences)

These are features I would ****not**** push into the backend unless you want shared user preferences across devices.

### A. Theme persistence

-   keep in `localStorage`

### B. View toggle persistence

-   keep in `localStorage`

### C. Arrange Panels order persistence

-   keep in `localStorage`

### D. FEN validation UI

-   keep frontend-side

### E. PGN file upload

-   keep frontend-side

### F. PGN details parsing/rendering

-   can stay frontend-side even if replay frames become backend-backed

  

# Recommended implementation roadmap

If you want the most pragmatic sequence, I would do it like this:

## Phase 1 — Make the board trustworthy

1.  real legal move lookup
2.  real move validation / authoritative move application
3.  real engine move

## Phase 2 — Make the intelligence trustworthy

1.  real recommendation panel
2.  real analysis results

## Phase 3 — Finish replay/session quality

1.  real replay frame generation
2.  proper redo behavior

## Phase 4 — Improve operational UX

1.  backend/fallback status indicator
2.  better settings persistence clarity
3.  better error handling

## Phase 5 — polish

1.  drag-drop PGN upload
2.  replay/move synchronization polish
3.  FEN workflow improvements
4.  responsive polish

  

# Short backlog list by priority

## P1

-   Real legal move generation
-   Real move validation / authoritative move apply
-   Real engine move
-   Real recommendation panel

## P2

-   Real engine analysis results
-   Real replay frame generation
-   Proper redo behavior

## P3

-   Backend/fallback status indicator
-   Better settings persistence clarity
-   Better error handling / feedback

## P4

-   Drag-drop PGN upload
-   Replay/move synchronization polish
-   FEN workflow improvements
-   Responsive/mobile polish