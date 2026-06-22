# 1 Mocked backend-dependent features

These are the areas where the frontend currently behaves as if the backend exists, but in reality a fallback/mock implementation is filling in the result.

  

## A. Game/session creation

### 1 New game

-   ****Frontend menu/action:**** `New -> Player against player`
-   ****Current fallback behavior:**** creates a new in-memory mock session in the frontend
-   ****What is missing in true backend integration:**** a real backend session object, backed by actual rules engine state

### 2 New game analysis session

-   ****Frontend menu/action:**** `New -> Game analysis`
-   ****Current fallback behavior:**** same as a mock fresh session, only the UI mode label differs
-   ****What is missing:**** a backend-supported mode distinction if analysis mode should be materially different

### 3 New player-against-engine session

-   ****Frontend menu/action:**** `New -> Player against engine`
-   ****Current fallback behavior:**** creates a mock session and, if the human is black, inserts a fake opening move
-   ****What is missing:**** real engine-backed first move/session initialization

  

## B. Move execution and session state

### 4 Make move

-   ****Frontend behavior:**** sends move text and updates the board/session
-   ****Mock fallback:**** appends the move string locally
-   ****What is missing:**** true backend validation and authoritative board/session progression

### 5 Undo

-   ****Frontend behavior:**** calls undo
-   ****Mock fallback:**** removes the last move from local move history
-   ****What is missing:**** backend-derived historical reconstruction

### 6 Redo

-   ****Frontend behavior:**** calls redo
-   ****Mock fallback:**** currently only placeholder-level behavior
-   ****What is missing:**** actual redo stack handling in a true backend-backed session

### 7 Engine move

-   ****Frontend action:**** “Engine move” button
-   ****Mock fallback:**** inserts a fixed/hardcoded move
-   ****What is missing:**** real engine choice from backend analysis

  

## C. Chess/rules support

### 8 Legal move lookup

-   ****Frontend use:**** move highlighting / legal move indicators
-   ****Mock fallback:**** returns a small fake set of target squares
-   ****What is missing:**** true legal move generation from backend rules engine

This is one of the more important mocked areas, because it affects the credibility of board interaction.

  

## D. Recommendations and analysis

### 9 Recommendations panel

-   ****Frontend behavior:**** displays opening-book and engine suggestions
-   ****Mock fallback:**** shows fixed fake suggestions, typically:
-   -   a couple of book-like moves
    -   one engine-like move
-   ****What is missing:**** actual book + engine integration from backend

### 10 Analysis output

-   ****Frontend behavior:**** analysis panel shows engine-like information
-   ****Mock fallback:**** simplified mock analysis payload
-   ****What is missing:**** true engine-backed analysis lines, scores, PVs, caching state, etc.

### 11 Cached analysis indication

-   ****Frontend behavior:**** may show a cached marker
-   ****Mock fallback:**** not meaningful in fallback mode
-   ****What is missing:**** real backend analysis-cache coordination

  

## E. Replay framing

### 12 Replay loading result

-   ****Frontend behavior:**** load PGN and step through replay information
-   ****Mock fallback:**** simplified replay frame generation
-   ****What is missing:**** full backend-produced replay frame model with meaningful board states for each step

### 13 Sample PGN endpoint

-   ****Frontend behavior:**** “Open sample”
-   ****Mock fallback:**** returns a fixed embedded sample PGN text when backend is unavailable
-   ****What is missing:**** true backend-served sample file retrieval

  

## F. Settings persistence fallback

### 14 Settings load

-   ****Frontend behavior:**** populate the settings form
-   ****Mock fallback:**** uses local mock settings JSON
-   ****What is missing:**** actual backend retrieval if unavailable

### 15 Settings save

-   ****Frontend behavior:**** save settings from the form
-   ****Mock fallback:**** updates local in-memory settings only
-   ****What is missing:**** true persistence through backend/config storage when unavailable

  

# 2 Frontend-only features by design (not really “mocked”)

These do ****not**** connect to the backend, but that is intentional. They are not fake — they are simply browser-side functionality.

  

## A. Theme persistence

-   dark / light theme toggle
-   persisted in `localStorage`

This is a frontend-native preference and does not need backend support unless you want roaming user preferences.

  

## B. View toggle persistence

-   show/hide:
-   -   clock
    -   game information
    -   move list
    -   recommendations
    -   analysis
    -   replay
    -   PGN details
-   persisted in `localStorage`

Again, intentional frontend behavior.

  

## C. Arrange panels

-   drag/drop order list in Settings
-   reorderable right-side panels
-   hidden panels still shown in the arrangement list with a hidden marker
-   persisted in `localStorage`

This is also frontend-native and not inherently a missing backend capability.

  

## D. FEN dialog and validation

-   modal dialog
-   live validation feedback
-   disabled load button until valid
-   local board update after accepted FEN

This is intentionally frontend-side in the current design because you explicitly did not want backend changes for FEN handling.

  

## E. PGN file upload

-   upload local `.pgn` / `.txt`
-   read file in browser
-   populate PGN details area

This is also naturally frontend-side.

  

## F. PGN details rendering

-   Event / Site / Date / Round / White / Black / Result / ECO
-   structured move rows shown in the PGN details panel

This can exist entirely in the browser even without backend support.

  

# 3 Partially connected features

These are features that ****do attempt backend calls****, but can still fall back to mock behavior when the backend does not support them yet or is unavailable.

  

## A. PGN replay

-   ****Frontend side that is already real:****
-   -   file upload
    -   manual PGN paste
    -   PGN header parsing
    -   PGN details panel
-   ****Backend-dependent part:****
-   -   meaningful replay frame generation
    -   true move-by-move board-state stepping

So this is ****partially real already****, but still partially mocked in fallback mode.

  

## B. Session-based play

-   ****Frontend side that is already real:****
-   -   menu flows
    -   move UI
    -   board interaction shell
    -   session-like UI state
-   ****Backend-dependent part:****
-   -   authoritative rules state
    -   move legality
    -   engine replies
    -   undo/redo semantics

So this is also partially connected but still mocked when backend support is absent.

  

# 4 Summary by category

## Currently mocked backend-style functionality

These are the items I would explicitly classify as “still mocked”:

-   New game
-   Game analysis mode session creation
-   Player-against-engine session creation
-   Move submission
-   Undo
-   Redo
-   Engine move
-   Legal move lookup
-   Recommendations panel contents
-   Analysis results
-   Cached analysis semantics
-   Replay frame generation
-   Sample PGN backend retrieval
-   Settings load/save fallback when backend is unavailable

  

## Frontend-only by design

These are not really missing backend hooks; they are intentionally local:

-   Theme switching and persistence
-   View toggle persistence
-   Panel arrangement persistence
-   FEN dialog and validation
-   Local FEN load into board
-   PGN file upload
-   PGN metadata extraction/rendering

  

# 5 Which mocked areas are the weakest / most obviously fake?

If you want the practical prioritization, the frontend areas that currently feel the most “mocked” are:

## Most visibly mocked

1.  ****Engine move****
2.  ****Legal move lookup****
3.  ****Recommendations / engine analysis****
4.  ****Redo****
5.  ****Replay stepping****

## Already reasonably useful even without backend

1.  ****PGN details panel****
2.  ****Theme persistence****
3.  ****View toggle persistence****
4.  ****Arrange panels****
5.  ****FEN modal and validation****

  

# 6 Best next priorities if you want to reduce mocked behavior

If you later want to replace the mocks gradually, the most useful order would be:

## Priority 1

****Legal moves + move validation****

-   biggest improvement to core board credibility

## Priority 2

****Engine move + recommendations****

-   biggest improvement to perceived chess intelligence

## Priority 3

****Replay frame generation****

-   completes the PGN/replay experience

## Priority 4

****Redo semantics****

-   useful, but less critical than legality/analysis

## Priority 5

****Settings load/save robustness****

-   mainly operational quality rather than chess experience

  

# Final summary

If we assume the frontend includes all the discussed changes and those changes are correct, then:

## Still mocked / not truly backend-backed

-   session creation
-   move/undo/redo behavior
-   engine move
-   legal move generation
-   recommendations/analysis payloads
-   replay frame generation
-   sample PGN retrieval fallback
-   settings persistence fallback

## Frontend-only and intentionally not backend-backed

-   theme persistence
-   view toggle persistence
-   panel arrangement persistence
-   FEN validation and local FEN loading
-   PGN upload
-   PGN details display

If you want, I can turn this next into a ****clean backlog list**** with:

-   ****Frontend-only (keep local)****
-   ****Should be backend-backed****
-   ****Nice-to-have backend integration later****

That would probably be the most actionable version.