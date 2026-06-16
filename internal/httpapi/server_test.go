package httpapi

import (
    "bytes"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/yourname/veldatlas/internal/config"
    "github.com/yourname/veldatlas/internal/domain"
    "github.com/yourname/veldatlas/internal/service"
)

type fakeRules struct{}

func (f fakeRules) NewGame() (domain.Snapshot, error) {
    return domain.Snapshot{FEN: "start", Turn: "w", Status: "in_progress"}, nil
}

func (f fakeRules) ApplyMoves(moves []string) (domain.Snapshot, error) {
    return domain.Snapshot{FEN: "fen", Turn: "b", Status: "in_progress", Moves: moves}, nil
}

func (f fakeRules) LegalMoves(moves []string, square string) ([]string, error) {
    return []string{square + "e4"}, nil
}

func (f fakeRules) LoadPGN(raw string) (domain.Replay, error) {
    return domain.Replay{Frames: []domain.Snapshot{{FEN: "start"}}}, nil
}

type fakeAnalysis struct{}

func (fakeAnalysis) Analyze(snapshot domain.Snapshot, engine config.EngineConfig, req domain.AnalysisRequest) ([]domain.AnalysisLine, error) {
    return []domain.AnalysisLine{{Engine: req.Engine, BestMove: "e2e4"}}, nil
}

func (fakeAnalysis) ChooseMove(snapshot domain.Snapshot, engine config.EngineConfig, req domain.AnalysisRequest) (domain.EnginePlayResult, error) {
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

func setupServer() http.Handler {
    cfg := config.DefaultSettings()
    cfg.Engines["stockfish"] = config.EngineConfig{
        Enabled:    true,
        Path:       "/fake/stockfish",
        Difficulty: "medium",
        ForPlay:    true,
        Options:    map[string]string{},
    }

    svc := service.New(fakeRules{}, fakeAnalysis{}, fakeBook{}, &fakeSettings{cfg: cfg})
    return New(":0", svc).Handler
}

func TestSettingsAndGameFlowEndpoints(t *testing.T) {
    t.Parallel()

    h := setupServer()

    res := httptest.NewRecorder()
    req := httptest.NewRequest(http.MethodGet, "/api/settings", nil)
    h.ServeHTTP(res, req)
    if res.Code != http.StatusOK {
        t.Fatalf("settings status = %d", res.Code)
    }

    res = httptest.NewRecorder()
    req = httptest.NewRequest(
        http.MethodPost,
        "/api/game/new-vs-engine",
        bytes.NewBufferString(`{"engine":"stockfish","humanColor":"white","difficulty":"easy"}`),
    )
    h.ServeHTTP(res, req)
    if res.Code != http.StatusOK {
        t.Fatalf("new-vs-engine status = %d body=%s", res.Code, res.Body.String())
    }

    var session domain.Session
    if err := json.NewDecoder(res.Body).Decode(&session); err != nil {
        t.Fatalf("decode session = %v", err)
    }
    if session.ID == "" {
        t.Fatalf("empty session id")
    }

    res = httptest.NewRecorder()
    req = httptest.NewRequest(
        http.MethodPost,
        "/api/game/"+session.ID+"/move",
        bytes.NewBufferString(`{"move":"e2e4"}`),
    )
    h.ServeHTTP(res, req)
    if res.Code != http.StatusOK {
        t.Fatalf("move status = %d body=%s", res.Code, res.Body.String())
    }

    res = httptest.NewRecorder()
    req = httptest.NewRequest(
        http.MethodGet,
        "/api/game/"+session.ID+"/recommendations?engine=stockfish&topN=1",
        nil,
    )
    h.ServeHTTP(res, req)
    if res.Code != http.StatusOK {
        t.Fatalf("recommendations status = %d body=%s", res.Code, res.Body.String())
    }

    var panel domain.RecommendationPanel
    if err := json.NewDecoder(res.Body).Decode(&panel); err != nil {
        t.Fatalf("decode recommendations = %v", err)
    }

    if len(panel.Book) != 1 {
        t.Fatalf("book recommendations len = %d, want 1", len(panel.Book))
    }
    if len(panel.Engine) != 1 {
        t.Fatalf("engine recommendations len = %d, want 1", len(panel.Engine))
    }
}

func TestErrorPaths(t *testing.T) {
    t.Parallel()

    h := setupServer()

    res := httptest.NewRecorder()
    req := httptest.NewRequest(http.MethodPost, "/api/settings", bytes.NewBufferString(`{bad json`))
    h.ServeHTTP(res, req)
    if res.Code != http.StatusBadRequest {
        t.Fatalf("invalid settings payload status = %d", res.Code)
    }

    res = httptest.NewRecorder()
    req = httptest.NewRequest(http.MethodGet, "/api/game/missing", nil)
    h.ServeHTTP(res, req)
    if res.Code != http.StatusNotFound {
        t.Fatalf("missing session status = %d", res.Code)
    }

    res = httptest.NewRecorder()
    req = httptest.NewRequest(http.MethodPost, "/api/replay/load", bytes.NewBufferString(""))
    h.ServeHTTP(res, req)
    if res.Code != http.StatusBadRequest {
        t.Fatalf("empty replay payload status = %d", res.Code)
    }
}