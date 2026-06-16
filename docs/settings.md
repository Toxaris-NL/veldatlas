# Settings and Engine Configuration

VeldAtlas stores runtime settings in TOML.

## File

```text
settings/veldatlas.toml
```

## Example

```toml
addr = ":8080"

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

## Notes

- TOML is easy to edit by hand and maps naturally to nested Go structs. citeturn14search176turn14search164
- Stockfish options are sent via the UCI `setoption` command. citeturn14search152turn14search198
- Difficulty presets in VeldAtlas are convenience layers over engine options and search limits.
