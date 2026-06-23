package corentings

import (
	"fmt"
	"strings"

	chess "github.com/corentings/chess/v2"

	"github.com/Toxaris-Nl/veldatlas/internal/domain"
)

type RulesAdapter struct{}

func NewRulesAdapter() *RulesAdapter { return &RulesAdapter{} }

func (a *RulesAdapter) NewGame() (domain.Snapshot, error) {
	g := chess.NewGame()
	return snapshotFromGame(g, nil, nil), nil
}

func (a *RulesAdapter) NewGameFromFEN(fen string) (domain.Snapshot, error) {
	fenFunc, err := chess.FEN(fen)
	if err != nil {
		return domain.Snapshot{}, fmt.Errorf("invalid FEN: %w", err)
	}
	g := chess.NewGame(fenFunc)
	snap := snapshotFromGame(g, nil, nil)
	snap.StartFEN = fen
	return snap, nil
}

// ApplyMoves replays moves from the starting FEN if one is set, otherwise
// from the default starting position.
func (a *RulesAdapter) ApplyMoves(moves []string, startFEN string) (domain.Snapshot, error) {
	g, err := a.replayFrom(startFEN, moves)
	if err != nil {
		return domain.Snapshot{}, err
	}
	snap := snapshotFromGame(g, nil, moves)
	snap.StartFEN = startFEN
	return snap, nil
}

func (a *RulesAdapter) LegalMoves(moves []string, square string, startFEN string) ([]string, error) {
	g, err := a.replayFrom(startFEN, moves)
	if err != nil {
		return nil, err
	}
	if square == "" {
		return []string{}, nil
	}
	notation := chess.UCINotation{}
	valid := g.ValidMoves()
	results := make([]string, 0, len(valid))
	for _, mv := range valid {
		uci := notation.Encode(g.Position(), &mv)
		if strings.HasPrefix(strings.ToLower(uci), strings.ToLower(square)) {
			results = append(results, uci)
		}
	}
	return results, nil
}

func (a *RulesAdapter) LoadPGN(raw string) (domain.Replay, error) {
	scanner := chess.NewScanner(strings.NewReader(raw))
	if !scanner.HasNext() {
		return domain.Replay{}, fmt.Errorf("no PGN game found")
	}
	scanned, err := scanner.ScanGame()
	if err != nil {
		return domain.Replay{}, err
	}
	pgnOpt, err := chess.PGN(strings.NewReader(scanned.Raw))
	if err != nil {
		return domain.Replay{}, err
	}
	parsed := chess.NewGame(pgnOpt)
	headers := map[string]string{}
	frames := []domain.Snapshot{}
	replay := chess.NewGame()
	frames = append(frames, snapshotFromGame(replay, headers, nil))
	moves := parsed.Moves()
	algNotation := chess.AlgebraicNotation{}
	notation := chess.UCINotation{}
	uciMoves := make([]string, 0, len(moves))
	labels := make([]string, 0, len(moves))

	for _, mv := range moves {
    uci := notation.Encode(replay.Position(), mv)
    san := algNotation.Encode(replay.Position(), mv)
    uciMoves = append(uciMoves, uci)
    labels = append(labels, uci)
    if err := replay.PushMove(san, nil); err != nil {
        return domain.Replay{}, err
    }
    frames = append(frames, snapshotFromGame(replay, headers, uciMoves))
    frames[len(frames)-1].MoveLabels = append([]string(nil), labels...)
}
	return domain.Replay{Headers: headers, Frames: frames}, nil
}

func (a *RulesAdapter) replayFrom(startFEN string, moves []string) (*chess.Game, error) {
	var g *chess.Game
	if startFEN != "" {
		fenFunc, err := chess.FEN(startFEN)
		if err != nil {
			return nil, fmt.Errorf("invalid start FEN: %w", err)
		}
		g = chess.NewGame(fenFunc)
	} else {
		g = chess.NewGame()
	}

	
algNotation := chess.AlgebraicNotation{}

	for _, mv := range moves {
    legal, err := uciToMove(g, mv)
    if err != nil {
        return nil, err
    }
    san := algNotation.Encode(g.Position(), legal)
    if err := g.PushMove(san, nil); err != nil {
        return nil, fmt.Errorf("pushMove %q (from UCI %q): %w", san, mv, err)
    }
}
return g, nil
}

func uciToMove(g *chess.Game, uci string) (*chess.Move, error) {
    notation := chess.UCINotation{}
    valid := g.ValidMoves()
    for i := range valid {
        if notation.Encode(g.Position(), &valid[i]) == uci {
            return &valid[i], nil
        }
    }
    return nil, fmt.Errorf("no legal move matches UCI %q", uci)
}

func snapshotFromGame(g *chess.Game, headers map[string]string, moves []string) domain.Snapshot {
	fen := g.FEN()
	turn := "w"
	if strings.Contains(fen, " b ") {
		turn = "b"
	}
	status := "in_progress"
	if g.Outcome() != chess.NoOutcome {
		status = "finished"
	}
	return domain.Snapshot{
		FEN:     fen,
		Turn:    turn,
		Status:  status,
		Moves:   append([]string(nil), moves...),
		Headers: cloneMap(headers),
		Outcome: fmt.Sprint(g.Outcome()),
		Method:  fmt.Sprint(g.Method()),
	}
}

func cloneMap(src map[string]string) map[string]string {
	if src == nil {
		return map[string]string{}
	}
	dst := make(map[string]string, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}