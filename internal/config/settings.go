package config

import (
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/BurntSushi/toml"
)

type EngineConfig struct {
	Enabled    bool              `toml:"enabled" json:"enabled"`
	Path       string            `toml:"path" json:"path"`
	Difficulty string            `toml:"difficulty" json:"difficulty"`
	ForPlay    bool              `toml:"for_play" json:"forPlay"`
	Options    map[string]string `toml:"options" json:"options"`
}

type UIConfig struct {
	DefaultAnalysisEngine string `toml:"default_analysis_engine" json:"defaultAnalysisEngine"`
	DefaultPlayEngine     string `toml:"default_play_engine" json:"defaultPlayEngine"`
	ShowBook              bool   `toml:"show_book" json:"showBook"`
	ShowAnalysis          bool   `toml:"show_analysis" json:"showAnalysis"`
}

type BookConfig struct {
	Path string `toml:"path" json:"path"`
}

type Settings struct {
	Addr    string                  `toml:"addr" json:"addr"`
	Book    BookConfig              `toml:"book" json:"book"`
	Engines map[string]EngineConfig `toml:"engines" json:"engines"`
	UI      UIConfig                `toml:"ui" json:"ui"`
}

func DefaultSettings() Settings {
	return Settings{
		Addr: ":8080",
		Book: BookConfig{},
		Engines: map[string]EngineConfig{
			"stockfish": {
				Enabled: true,
				Path: "",
				Difficulty: "medium",
				ForPlay: true,
				Options: map[string]string{
					"Threads": "2",
					"Hash": "128",
					"MultiPV": "3",
					"Skill Level": "5",
					"UCI_LimitStrength": "true",
					"UCI_Elo": "1600",
				},
			},
			"maia": {
				Enabled: false,
				Path: "",
				Difficulty: "maia-default",
				ForPlay: true,
				Options: map[string]string{
					"Threads": "1",
				},
			},
		},
		UI: UIConfig{
			DefaultAnalysisEngine: "stockfish",
			DefaultPlayEngine: "stockfish",
			ShowBook: true,
			ShowAnalysis: true,
		},
	}
}

func LoadOrCreateDefault(path string) (Settings, error) {
	if _, err := os.Stat(path); err == nil {
		return Load(path)
	}
	cfg := DefaultSettings()
	if err := Save(path, cfg); err != nil {
		return Settings{}, err
	}
	return cfg, nil
}

func Load(path string) (Settings, error) {
	cfg := DefaultSettings()
	if _, err := toml.DecodeFile(path, &cfg); err != nil {
		return Settings{}, err
	}
	normalize(&cfg)
	return cfg, nil
}

func Save(path string, cfg Settings) error {
	normalize(&cfg)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return toml.NewEncoder(f).Encode(cfg)
}

func normalize(cfg *Settings) {
	if strings.TrimSpace(cfg.Addr) == "" {
		cfg.Addr = ":8080"
	}
	if cfg.Engines == nil {
		cfg.Engines = map[string]EngineConfig{}
	}
	for name, ec := range cfg.Engines {
		if ec.Options == nil {
			ec.Options = map[string]string{}
		}
		cfg.Engines[name] = ec
	}
	if cfg.UI.DefaultAnalysisEngine == "" {
		cfg.UI.DefaultAnalysisEngine = "stockfish"
	}
	if cfg.UI.DefaultPlayEngine == "" {
		cfg.UI.DefaultPlayEngine = "stockfish"
	}
}

type Store struct {
	path string
	mu   sync.RWMutex
	cfg  Settings
}

func NewStore(path string, initial Settings) *Store {
	return &Store{path: path, cfg: initial}
}

func (s *Store) Get() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneSettings(s.cfg)
}

func (s *Store) Save(cfg Settings) error {
	normalize(&cfg)
	if err := Save(s.path, cfg); err != nil {
		return err
	}
	s.mu.Lock()
	s.cfg = cfg
	s.mu.Unlock()
	return nil
}

func cloneSettings(in Settings) Settings {
	out := in
	out.Engines = make(map[string]EngineConfig, len(in.Engines))
	for k, v := range in.Engines {
		opt := make(map[string]string, len(v.Options))
		for ok, ov := range v.Options { opt[ok] = ov }
		v.Options = opt
		out.Engines[k] = v
	}
	return out
}
