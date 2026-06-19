package service

import (
    "fmt"
    "testing"

    "github.com/Toxaris-Nl/veldatlas/internal/config"
    "github.com/Toxaris-Nl/veldatlas/internal/domain"
)

type fakeRules struct{}

func (f fakeRules) NewGame() (domain.Snapshot, error) {
    return domain.Snapshot{FEN: "start", Turn: "w", Status: "in_progress", Moves: []string{}}, nil
}

func (f fakeRules) ApplyMoves(moves []string) (domain.Snapshot, error) {
    turn := "w"
    if len(moves)%2 == 1 {
        turn = "b"
    }
    return domain.Snapshot{
        FEN:    fmt.Sprintf("fen-%d", len(moves)),
        Turn:   turn,
        Status: "in_progress",
        Moves:  append([]string(nil), moves...),
    }, nil
}

func (f fakeRules) LegalMoves(moves []string, square string) ([]string, error) {
    return []string{square + "e4", square + "e3"}, nil
}

func (f fakeRules) LoadPGN(raw string) (domain.Replay, error) {
    return domain.Replay{
        Headers: map[string]string{"Event": "Test"},
        Frames: []domain.Snapshot{
            {FEN: "start"},
            {FEN: "fen-1", MoveLabels: []string{"e2e4"}},
        },
    }, nil
}

type fakeAnalysis struct {
    analyzeCalls int
    chooseCalls  int
}

func (f *fakeAnalysis) Analyze(snapshot domain.Snapshot, engine config.EngineConfig, req domain.AnalysisRequest) ([]domain.AnalysisLine, error) {
    f.analyzeCalls++
    return []domain.AnalysisLine{
        {Engine: req.Engine, BestMove: "e2e4", Raw: snapshot.FEN},
    }, nil
}

func (f *fakeAnalysis) ChooseMove(snapshot domain.Snapshot, engine config.EngineConfig, req domain.AnalysisRequest) (domain.EnginePlayResult, error) {
    f.chooseCalls++
    return domain.EnginePlayResult{
        Move: "e7e5",
        Analysis: []domain.AnalysisLine{
            {Engine: req.Engine, BestMove: "e7e5"},
        },
    }, nil
}

type fakeBook struct{}

func (fakeBook) Recommend(snapshot domain.Snapshot) ([]domain.BookRecommendation, error) {
    return []domain.BookRecommendation{
        {Move: "e2e4", Weight: 20, Percentage: 66.67, Source: "polyglot"},
        {Move: "d2d4", Weight: 10, Percentage: 33.33, Source: "polyglot"},
    }, nil
}

type fakeSettings struct{ cfg config.Settings }

func (f *fakeSettings) Get() config.Settings { return f.cfg }

func (f *fakeSettings) Save(cfg config.Settings) error {
    f.cfg = cfg
    return nil
}

func TestAnalysisCaching(t *testing.T) {
    t.Parallel()

    fa := &fakeAnalysis{}
    fs := &fakeSettings{cfg: config.DefaultSettings()}
    fs.cfg.Engines["stockfish"] = config.EngineConfig{
        Enabled:    true,
        Path:       "/fake/stockfish",
        Difficulty: "medium",
        Options:    map[string]string{},
    }

    svc := New(fakeRules{}, fa, fakeBook{}, fs)
    g, _ := svc.NewGame()

    _, err := svc.Analyze(g.ID, domain.AnalysisRequest{Engine: "stockfish"})
    if err != nil {
        t.Fatalf("Analyze first error = %v", err)
    }

    lines, err := svc.Analyze(g.ID, domain.AnalysisRequest{Engine: "stockfish"})
    if err != nil {
        t.Fatalf("Analyze second error = %v", err)
    }

    if fa.analyzeCalls != 1 {
        t.Fatalf("analyzeCalls = %d, want 1", fa.analyzeCalls)
    }

    if len(lines) == 0 || !lines[0].Cached {
        t.Fatalf("expected cached analysis on second call: %#v", lines)
    }
}

func TestRecommendationsBlendBookAndEngine(t *testing.T) {
    t.Parallel()

    fa := &fakeAnalysis{}
    fs := &fakeSettings{cfg: config.DefaultSettings()}
    fs.cfg.Engines["stockfish"] = config.EngineConfig{
        Enabled:    true,
        Path:       "/fake/stockfish",
        Difficulty: "medium",
        Options:    map[string]string{},
    }

    svc := New(fakeRules{}, fa, fakeBook{}, fs)
    g, _ := svc.NewGame()

    panel, err := svc.Recommendations(g.ID, domain.AnalysisRequest{
        Engine: "stockfish",
        TopN:   1,
    })
    if err != nil {
        t.Fatalf("Recommendations() error = %v", err)
    }

    if len(panel.Book) != 1 {
        t.Fatalf("book recommendations len = %d, want 1", len(panel.Book))
    }
    if panel.Book[0].Move != "e2e4" {
        t.Fatalf("top book move = %q, want %q", panel.Book[0].Move, "e2e4")
    }
    if len(panel.Engine) != 1 || panel.Engine[0].BestMove != "e2e4" {
        t.Fatalf("engine recommendations = %#v, want one e2e4 line", panel.Engine)
    }
}

func TestPlayAgainstEngine(t *testing.T) {
    t.Parallel()

    fa := &fakeAnalysis{}
    fs := &fakeSettings{cfg: config.DefaultSettings()}
    fs.cfg.Engines["stockfish"] = config.EngineConfig{
        Enabled:    true,
        Path:       "/fake/stockfish",
        Difficulty: "medium",
        Options:    map[string]string{},
    }

    svc := New(fakeRules{}, fa, fakeBook{}, fs)

    g, err := svc.StartEngineGame("stockfish", "white", "easy")
    if err != nil {
        t.Fatalf("StartEngineGame() error = %v", err)
    }

    g, err = svc.Play(g.ID, "e2e4")
    if err != nil {
        t.Fatalf("Play() error = %v", err)
    }

    if len(g.Moves) != 2 {
        t.Fatalf("moves after human+engine reply = %d, want 2", len(g.Moves))
    }
    if fa.chooseCalls != 1 {
        t.Fatalf("chooseCalls = %d, want 1", fa.chooseCalls)
    }
}

func TestSettingsAndErrorPaths(t *testing.T) {
    t.Parallel()

    fs := &fakeSettings{cfg: config.DefaultSettings()}
    svc := New(fakeRules{}, &fakeAnalysis{}, fakeBook{}, fs)

    cfg := svc.Settings()
    cfg.Addr = ":9999"

    if err := svc.SaveSettings(cfg); err != nil {
        t.Fatalf("SaveSettings() error = %v", err)
    }
    if svc.Settings().Addr != ":9999" {
        t.Fatalf("settings addr not updated")
    }

    if _, err := svc.Get("missing"); err != ErrSessionNotFound {
        t.Fatalf("Get(missing) err = %v", err)
    }

    g, _ := svc.NewGame()
    if _, err := svc.Undo(g.ID); err != ErrNoMovesToUndo {
        t.Fatalf("Undo() err = %v", err)
    }
}