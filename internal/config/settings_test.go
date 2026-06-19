package config

import (
	"path/filepath"
	"testing"
)

func TestLoadOrCreateDefaultAndRoundTrip(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "settings", "veldatlas.toml")
	cfg, err := LoadOrCreateDefault(path)
	if err != nil { t.Fatalf("LoadOrCreateDefault() error = %v", err) }
	if cfg.Addr != ":8080" { t.Fatalf("addr = %q, want :8080", cfg.Addr) }
	cfg.Engines["stockfish"] = EngineConfig{Enabled: true, Path: "/usr/bin/stockfish", Difficulty: "hard", Options: map[string]string{"Threads": "4"}}
	if err := Save(path, cfg); err != nil { t.Fatalf("Save() error = %v", err) }
	got, err := LoadSettings(path)
	if err != nil { t.Fatalf("Load() error = %v", err) }
	if got.Engines["stockfish"].Path != "/usr/bin/stockfish" { t.Fatalf("stockfish path = %q", got.Engines["stockfish"].Path) }
}
