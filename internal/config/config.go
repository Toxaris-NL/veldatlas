package config

import (
	"os"
	"strings"
)

type Config struct {
	Addr             string
	StockfishPath    string
	MaiaPath         string
	MaiaOptions      map[string]string
	PolyglotBookPath string
}

func Load() Config {
	addr := strings.TrimSpace(os.Getenv("VELDATLAS_ADDR"))
	if addr == "" {
		addr = ":8080"
	}
	return Config{
		Addr:             addr,
		StockfishPath:    strings.TrimSpace(os.Getenv("VELDATLAS_STOCKFISH_PATH")),
		MaiaPath:         strings.TrimSpace(os.Getenv("VELDATLAS_MAIA_PATH")),
		MaiaOptions:      parseOptions(os.Getenv("VELDATLAS_MAIA_OPTIONS")),
		PolyglotBookPath: strings.TrimSpace(os.Getenv("VELDATLAS_POLYGLOT_BOOK")),
	}
}

func parseOptions(raw string) map[string]string {
	result := map[string]string{}
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		result[strings.TrimSpace(kv[0])] = strings.TrimSpace(kv[1])
	}
	return result
}
