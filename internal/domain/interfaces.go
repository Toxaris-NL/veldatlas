package domain

import "github.com/Toxaris-Nl/veldatlas/internal/config"

type RulesEngine interface {
	NewGame() (Snapshot, error)
	NewGameFromFEN(fen string) (Snapshot, error)
ApplyMoves(moves []string, startFEN string) (Snapshot, error)
LegalMoves(moves []string, square string, startFEN string) ([]string, error)
	LoadPGN(raw string) (Replay, error)
}

type AnalysisEngine interface {
	Analyze(snapshot Snapshot, engine config.EngineConfig, req AnalysisRequest) ([]AnalysisLine, error)
	ChooseMove(snapshot Snapshot, engine config.EngineConfig, req AnalysisRequest) (EnginePlayResult, error)
}

type OpeningBook interface {
	Recommend(snapshot Snapshot) ([]BookRecommendation, error)
}

type SettingsStore interface {
	Get() config.Settings
	Save(config.Settings) error
}
