# VeldAtlas

VeldAtlas is a pragmatic chess frontend with a Go backend and a minimal web UI.
It keeps the browser layer intentionally small while centralizing chess rules,
opening-book lookup, engine analysis, replay handling, and settings management
in the backend.

## Current scope

This version of VeldAtlas supports:

- New game
- Play moves in the browser
- Undo / redo
- Show legal moves for a selected square
- Show move list and game state
- Replay PGN games
- Request engine analysis
- Blend Polyglot book moves and engine suggestions into one recommendation panel
- Play against a configured engine
- Persist application settings in TOML
- Configure engine paths and UCI options
- Cache analysis per position / engine / difficulty / option set

## Main components

### Backend

The Go backend is responsible for:

- session lifecycle management
- move orchestration and undo / redo
- engine analysis and engine move selection
- Polyglot opening-book lookup
- PGN replay loading
- settings persistence
- HTTP API exposure

### Frontend

The web frontend stays intentionally simple and browser-native:

- board widget
- move / replay controls
- recommendation panel
- settings editor
- engine / difficulty selectors

## Project structure

```text
cmd/veldatlas/                  application entrypoint
internal/config/               TOML settings model + persistence
internal/domain/               shared interfaces and DTOs
internal/service/              application orchestration layer
internal/httpapi/              HTTP handlers and routing
internal/adapters/corentings/  chess rules + engine / PGN integration
internal/adapters/opening/     Polyglot opening-book provider
web/                           static frontend assets
samples/                       example PGN files
docs/                          project documentation
```

## Configuration

Settings are stored in TOML.

Default file location:

```text
settings/veldatlas.toml
```

The file is created automatically on first startup if it does not exist.

### Example settings file

```toml
addr = ":8080"

[book]
path = "./books/performance.bin"

[engines.stockfish]
enabled = true
path = "/usr/local/bin/stockfish"
difficulty = "medium"
for_play = true

[engines.stockfish.options]
Threads = "2"
Hash = "128"
MultiPV = "3"
Skill Level = "5"
UCI_LimitStrength = "true"
UCI_Elo = "1600"

[engines.maia]
enabled = false
path = "/opt/lc0/lc0"
difficulty = "maia-default"
for_play = true

[engines.maia.options]
WeightsFile = "/opt/maia/maia-1900.pb.gz"
Threads = "1"

[ui]
default_analysis_engine = "stockfish"
default_play_engine = "stockfish"
show_book = true
show_analysis = true
```

## Recommendations

The recommendation panel blends two sources:

1. **Polyglot opening-book recommendations**
   - top N moves
   - sorted by weight descending
   - percentages calculated from total weight in the current position

2. **Engine recommendations**
   - analysis lines from the selected engine
   - cached by position / engine / difficulty / option set

If the chosen engine is not configured, the API still returns the opening-book
side of the recommendation panel.

## Analysis caching

Analysis is cached per:

- engine name
- FEN
- difficulty
- normalized engine options

This avoids incorrect cache hits that would occur with a cache keyed only by ply.

## Play vs engine

A game can be started in **play vs engine** mode.

Session mode stores:

- engine name
- human color
- difficulty
- whether engine auto-reply is enabled

If the human plays black, the engine can make the first move automatically.

## Main HTTP endpoints

### Settings

- `GET /api/settings`
- `POST /api/settings`

### Game lifecycle

- `POST /api/game/new`
- `POST /api/game/new-vs-engine`
- `GET /api/game/{id}`

### Game actions

- `POST /api/game/{id}/move`
- `POST /api/game/{id}/undo`
- `POST /api/game/{id}/redo`
- `GET /api/game/{id}/legal?square=e2`
- `POST /api/game/{id}/engine-move`

### Analysis and recommendations

- `POST /api/game/{id}/analysis`
- `GET /api/game/{id}/book`
- `GET /api/game/{id}/recommendations?engine=stockfish&difficulty=medium&topN=5`

### Replay

- `POST /api/replay/load`
- `GET /api/samples/{name}`

## Running

```bash
go run ./cmd/veldatlas
```

Open in the browser:

```text
http://localhost:8080
```

## Tests

```bash
go test ./...
```

## Documentation

Additional documentation:

- `docs/architecture.md`
- `docs/settings.md`

## Notes

- The frontend is intentionally small and leaves chess / engine logic to the backend.
- The analysis adapter is the part most likely to need a version-alignment pass if the pinned chess/UCI dependency changes.
- The opening provider performs real Polyglot lookup and returns weighted recommendations.
