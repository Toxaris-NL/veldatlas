package main

import (
	"log"

	"github.com/yourname/veldatlas/internal/adapters/corentings"
	"github.com/yourname/veldatlas/internal/adapters/opening"
	"github.com/yourname/veldatlas/internal/config"
	"github.com/yourname/veldatlas/internal/httpapi"
	"github.com/yourname/veldatlas/internal/service"
)

func main() {
	cfg, err := config.LoadOrCreateDefault("settings/veldatlas.toml")
	if err != nil {
		log.Fatal(err)
	}

	rules := corentings.NewRulesAdapter()
	analysis := corentings.NewAnalysisAdapter()
	book := opening.NewStaticProvider(cfg.Book.Path)
	settingsStore := config.NewStore("settings/veldatlas.toml", cfg)

	svc := service.New(rules, analysis, book, settingsStore)
	srv := httpapi.New(cfg.Addr, svc)

	log.Printf("VeldAtlas listening on %s", cfg.Addr)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
