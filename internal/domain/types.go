package domain

type Snapshot struct {
    FEN        string            `json:"fen"`
    Turn       string            `json:"turn"`
    Status     string            `json:"status"`
    Outcome    string            `json:"outcome,omitempty"`
    Method     string            `json:"method,omitempty"`
    Headers    map[string]string `json:"headers,omitempty"`
    Moves      []string          `json:"moves,omitempty"`
    MoveLabels []string          `json:"moveLabels,omitempty"`
    StartFEN    string            `json:"startFen,omitempty"`
}

type SessionSettings struct {
    PlayingAgainstEngine bool   `json:"playingAgainstEngine"`
    EngineName           string `json:"engineName,omitempty"`
    HumanColor           string `json:"humanColor,omitempty"`
    Difficulty           string `json:"difficulty,omitempty"`
}

type Session struct {
    ID        string          `json:"id"`
    Moves     []string        `json:"moves"`
    RedoMoves []string        `json:"redoMoves,omitempty"`
    Snapshot  Snapshot        `json:"snapshot"`
    Mode      SessionSettings `json:"mode"`
    StartFEN  string          `json:"startFen,omitempty"`
}

type AnalysisRequest struct {
    Engine     string            `json:"engine"`
    Depth      int               `json:"depth,omitempty"`
    Nodes      int               `json:"nodes,omitempty"`
    TopN       int               `json:"topN,omitempty"`
    Difficulty string            `json:"difficulty,omitempty"`
    Options    map[string]string `json:"options,omitempty"`
}

type AnalysisLine struct {
    Engine   string   `json:"engine"`
    BestMove string   `json:"bestMove,omitempty"`
    ScoreCP  int      `json:"scoreCp,omitempty"`
    Mate     int      `json:"mate,omitempty"`
    PV       []string `json:"pv,omitempty"`
    Depth    int      `json:"depth,omitempty"`
    Raw      string   `json:"raw,omitempty"`
    Cached   bool     `json:"cached,omitempty"`
}

type BookRecommendation struct {
    Move       string  `json:"move"`
    Weight     int     `json:"weight,omitempty"`
    Percentage float64 `json:"percentage,omitempty"`
    Source     string  `json:"source,omitempty"`
}

type RecommendationPanel struct {
    Book   []BookRecommendation `json:"book"`
    Engine []AnalysisLine       `json:"engine"`
}

type Replay struct {
    Headers map[string]string `json:"headers"`
    Frames  []Snapshot        `json:"frames"`
}

type EnginePlayResult struct {
    Move     string         `json:"move"`
    Analysis []AnalysisLine `json:"analysis,omitempty"`
}