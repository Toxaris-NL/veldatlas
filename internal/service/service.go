package service

import (
    "crypto/rand"
    "encoding/hex"
    "errors"
    "sync"

    "github.com/Toxaris-Nl/veldatlas/internal/config"
    "github.com/Toxaris-Nl/veldatlas/internal/domain"
)

var ErrSessionNotFound = errors.New("session not found")
var ErrNoMovesToUndo = errors.New("no moves to undo")
var ErrNoMovesToRedo = errors.New("no moves to redo")
var ErrEngineNotConfigured = errors.New("engine not configured")

type analysisKey struct {
    Engine string
    Ply    int
}

type sessionState struct {
    Session       *domain.Session
    AnalysisCache map[analysisKey][]domain.AnalysisLine
}

type Service struct {
    rules    domain.RulesEngine
    analysis domain.AnalysisEngine
    book     domain.OpeningBook
    settings domain.SettingsStore

    mu       sync.RWMutex
    sessions map[string]*sessionState
}

func New(rules domain.RulesEngine, analysis domain.AnalysisEngine, book domain.OpeningBook, settings domain.SettingsStore) *Service {
    return &Service{
        rules:    rules,
        analysis: analysis,
        book:     book,
        settings: settings,
        sessions: map[string]*sessionState{},
    }
}

func (s *Service) Settings() config.Settings { return s.settings.Get() }
func (s *Service) SaveSettings(cfg config.Settings) error { return s.settings.Save(cfg) }

func (s *Service) NewGame(fen string) (*domain.Session, error) {
    var snap domain.Snapshot
    var err error

    if fen != "" {
        snap, err = s.rules.NewGameFromFEN(fen)
    } else {
        snap, err = s.rules.NewGame()
    }
    if err != nil {
        return nil, err
    }

    ss := &sessionState{
        Session: &domain.Session{
            ID:       newID(),
            Snapshot: snap,
            Moves:    []string{},
            StartFEN: fen, // store it here
        },
        AnalysisCache: map[analysisKey][]domain.AnalysisLine{},
    }
    s.mu.Lock()
    s.sessions[ss.Session.ID] = ss
    s.mu.Unlock()
    return cloneSession(ss.Session), nil
}

func (s *Service) StartEngineGame(engineName, humanColor, difficulty string) (*domain.Session, error) {
    ss, err := s.NewGame("")
    if err != nil {
        return nil, err
    }
    s.mu.Lock()
    state := s.sessions[ss.ID]
    state.Session.Mode = domain.SessionSettings{
        PlayingAgainstEngine: true,
        EngineName:           engineName,
        HumanColor:           humanColor,
        Difficulty:           difficulty,
    }
    s.mu.Unlock()

    if humanColor == "black" {
        _, err = s.EngineMove(ss.ID)
        if err != nil {
            return nil, err
        }
    }
    return s.Get(ss.ID)
}

func (s *Service) Get(id string) (*domain.Session, error) {
    s.mu.RLock()
    st, ok := s.sessions[id]
    s.mu.RUnlock()
    if !ok {
        return nil, ErrSessionNotFound
    }
    return cloneSession(st.Session), nil
}

func (s *Service) Play(id, move string) (*domain.Session, error) {
    s.mu.Lock()
    st, ok := s.sessions[id]
    if !ok {
        s.mu.Unlock()
        return nil, ErrSessionNotFound
    }

    moves := append(append([]string(nil), st.Session.Moves...), move)
    snap, err := s.rules.ApplyMoves(moves, st.Session.StartFEN)
    if err != nil {
        s.mu.Unlock()
        return nil, err
    }

    st.Session.Moves = moves
    st.Session.RedoMoves = nil
    st.Session.Snapshot = snap
    mode := st.Session.Mode
    s.mu.Unlock()

    if mode.PlayingAgainstEngine && shouldEngineMove(mode, snap.Turn) {
        if _, err := s.EngineMove(id); err != nil {
            return nil, err
        }
    }
    return s.Get(id)
}

func shouldEngineMove(mode domain.SessionSettings, turn string) bool {
    if !mode.PlayingAgainstEngine {
        return false
    }
    if mode.HumanColor == "white" {
        return turn == "b"
    }
    return turn == "w"
}

func (s *Service) EngineMove(id string) (*domain.Session, error) {
    s.mu.RLock()
    st, ok := s.sessions[id]
    s.mu.RUnlock()
    if !ok {
        return nil, ErrSessionNotFound
    }

    cfg, ok := s.settings.Get().Engines[st.Session.Mode.EngineName]
    if !ok || !cfg.Enabled || cfg.Path == "" {
        return nil, ErrEngineNotConfigured
    }

    res, err := s.analysis.ChooseMove(
        st.Session.Snapshot,
        cfg,
        domain.AnalysisRequest{
            Engine:     st.Session.Mode.EngineName,
            Difficulty: st.Session.Mode.Difficulty,
        },
    )
    if err != nil {
        return nil, err
    }
    if res.Move == "" {
        return nil, ErrEngineNotConfigured
    }

    if _, err := s.cacheAnalysis(id, st.Session.Mode.EngineName, len(st.Session.Moves), res.Analysis); err != nil {
        return nil, err
    }
    return s.PlayNoReply(id, res.Move)
}

func (s *Service) PlayNoReply(id, move string) (*domain.Session, error) {
    s.mu.Lock()
    defer s.mu.Unlock()

    st, ok := s.sessions[id]
    if !ok {
        return nil, ErrSessionNotFound
    }

    moves := append(append([]string(nil), st.Session.Moves...), move)
    snap, err := s.rules.ApplyMoves(moves, st.Session.StartFEN)
    if err != nil {
        return nil, err
    }

    st.Session.Moves = moves
    st.Session.RedoMoves = nil
    st.Session.Snapshot = snap
    return cloneSession(st.Session), nil
}

func (s *Service) Undo(id string) (*domain.Session, error) {
    s.mu.Lock()
    defer s.mu.Unlock()

    st, ok := s.sessions[id]
    if !ok {
        return nil, ErrSessionNotFound
    }
    if len(st.Session.Moves) == 0 {
        return nil, ErrNoMovesToUndo
    }

    last := st.Session.Moves[len(st.Session.Moves)-1]
    st.Session.RedoMoves = append([]string{last}, st.Session.RedoMoves...)
    st.Session.Moves = append([]string(nil), st.Session.Moves[:len(st.Session.Moves)-1]...)

    snap, err := s.rules.ApplyMoves(st.Session.Moves, st.Session.StartFEN)
    if err != nil {
        return nil, err
    }
    st.Session.Snapshot = snap
    return cloneSession(st.Session), nil
}

func (s *Service) Redo(id string) (*domain.Session, error) {
    s.mu.Lock()
    defer s.mu.Unlock()

    st, ok := s.sessions[id]
    if !ok {
        return nil, ErrSessionNotFound
    }
    if len(st.Session.RedoMoves) == 0 {
        return nil, ErrNoMovesToRedo
    }

    mv := st.Session.RedoMoves[0]
    st.Session.RedoMoves = append([]string(nil), st.Session.RedoMoves[1:]...)

    moves := append(append([]string(nil), st.Session.Moves...), mv)
    snap, err := s.rules.ApplyMoves(moves, st.Session.StartFEN)
    if err != nil {
        return nil, err
    }

    st.Session.Moves = moves
    st.Session.Snapshot = snap
    return cloneSession(st.Session), nil
}

func (s *Service) Legal(id, square string) ([]string, error) {
    if len(square) != 2 ||
    square[0] < 'a' || square[0] > 'h' ||
    square[1] < '1' || square[1] > '8' {
    writeError(w, http.StatusBadRequest, "invalid square")
    return
}

    ss, err := s.Get(id)
    if err != nil {
        return nil, err
    }
    return s.rules.LegalMoves(ss.Moves, square, ss.StartFEN)
}

func (s *Service) Analyze(id string, req domain.AnalysisRequest) ([]domain.AnalysisLine, error) {
    s.mu.RLock()
    st, ok := s.sessions[id]
    s.mu.RUnlock()
    if !ok {
        return nil, ErrSessionNotFound
    }

    engineName := req.Engine
    if engineName == "" {
        engineName = s.settings.Get().UI.DefaultAnalysisEngine
    }

    key := analysisKey{Engine: engineName, Ply: len(st.Session.Moves)}

    s.mu.RLock()
    cached, ok := st.AnalysisCache[key]
    s.mu.RUnlock()
    if ok {
        out := make([]domain.AnalysisLine, len(cached))
        copy(out, cached)
        for i := range out {
            out[i].Cached = true
        }
        return out, nil
    }

    cfg, ok := s.settings.Get().Engines[engineName]
    if !ok || !cfg.Enabled || cfg.Path == "" {
        return nil, ErrEngineNotConfigured
    }

    req.Engine = engineName
    if req.Difficulty == "" {
        req.Difficulty = cfg.Difficulty
    }

    lines, err := s.analysis.Analyze(st.Session.Snapshot, cfg, req)
    if err != nil {
        return nil, err
    }
    _, err = s.cacheAnalysis(id, engineName, len(st.Session.Moves), lines)
    return lines, err
}

func (s *Service) Recommendations(id string, req domain.AnalysisRequest) (domain.RecommendationPanel, error) {
    bookItems, err := s.Book(id)
    if err != nil {
        return domain.RecommendationPanel{}, err
    }

    if req.TopN > 0 && len(bookItems) > req.TopN {
        bookItems = bookItems[:req.TopN]
    }

    engineItems, err := s.Analyze(id, req)
    if err != nil {
        // If engine is not configured we still want to return the book panel.
        if errors.Is(err, ErrEngineNotConfigured) {
            return domain.RecommendationPanel{
                Book:   bookItems,
                Engine: []domain.AnalysisLine{},
            }, nil
        }
        return domain.RecommendationPanel{}, err
    }

    return domain.RecommendationPanel{
        Book:   bookItems,
        Engine: engineItems,
    }, nil
}

func (s *Service) cacheAnalysis(id, engine string, ply int, lines []domain.AnalysisLine) ([]domain.AnalysisLine, error) {
    s.mu.Lock()
    defer s.mu.Unlock()

    st, ok := s.sessions[id]
    if !ok {
        return nil, ErrSessionNotFound
    }

    cp := make([]domain.AnalysisLine, len(lines))
    copy(cp, lines)
    st.AnalysisCache[analysisKey{Engine: engine, Ply: ply}] = cp
    return cp, nil
}

func (s *Service) Book(id string) ([]domain.BookRecommendation, error) {
    ss, err := s.Get(id)
    if err != nil {
        return nil, err
    }
    return s.book.Recommend(ss.Snapshot)
}

func (s *Service) LoadReplay(raw string) (domain.Replay, error) {
    return s.rules.LoadPGN(raw)
}

func newID() string {
    var b [8]byte
    _, _ = rand.Read(b[:])
    return hex.EncodeToString(b[:])
}

func cloneSession(s *domain.Session) *domain.Session {
    if s == nil {
        return nil
    }
    cp := *s
    cp.Moves = append([]string(nil), s.Moves...)
    cp.RedoMoves = append([]string(nil), s.RedoMoves...)
    cp.Snapshot.Moves = append([]string(nil), s.Snapshot.Moves...)
    cp.Snapshot.MoveLabels = append([]string(nil), s.Snapshot.MoveLabels...)
    if s.Snapshot.Headers != nil {
        cp.Snapshot.Headers = map[string]string{}
        for k, v := range s.Snapshot.Headers {
            cp.Snapshot.Headers[k] = v
        }
    }
    return &cp
}