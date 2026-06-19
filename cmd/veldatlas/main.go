package main

import (
	"log"

	"github.com/Toxaris-Nl/veldatlas/internal/adapters/corentings"
	"github.com/Toxaris-Nl/veldatlas/internal/adapters/opening"
	"github.com/Toxaris-Nl/veldatlas/internal/config"
	"github.com/Toxaris-Nl/veldatlas/internal/httpapi"
	"github.com/Toxaris-Nl/veldatlas/internal/service"
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
