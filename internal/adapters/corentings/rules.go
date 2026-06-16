package corentings

import (
	"fmt"
	"strings"

	chess "github.com/corentings/chess/v2"

	"github.com/yourname/veldatlas/internal/domain"
)

type RulesAdapter struct{}

func NewRulesAdapter() *RulesAdapter { return &RulesAdapter{} }

func (a *RulesAdapter) NewGame() (domain.Snapshot, error) {
	g := chess.NewGame()
	return snapshotFromGame(g, nil, nil), nil
}

func (a *RulesAdapter) ApplyMoves(moves []string) (domain.Snapshot, error) {
	g, err := a.replay(moves)
	if err != nil { return domain.Snapshot{}, err }
	return snapshotFromGame(g, nil, moves), nil
}

func (a *RulesAdapter) LegalMoves(moves []string, square string) ([]string, error) {
	g, err := a.replay(moves)
	if err != nil { return nil, err }
	if square == "" { return []string{}, nil }
	position := g.Position()
	notation := chess.UCINotation{}
	valid := g.ValidMoves()
	results := make([]string, 0, len(valid))
	for _, mv := range valid {
		uci, err := notation.Encode(position, mv)
		if err != nil { continue }
		if strings.HasPrefix(strings.ToLower(uci), strings.ToLower(square)) {
			results = append(results, uci)
		}
	}
	return results, nil
}

func (a *RulesAdapter) LoadPGN(raw string) (domain.Replay, error) {
	scanner := chess.NewScanner(strings.NewReader(raw))
	if !scanner.HasNext() { return domain.Replay{}, fmt.Errorf("no PGN game found") }
	scanned, err := scanner.ScanGame()
	if err != nil { return domain.Replay{}, err }
	parsed := chess.NewGame(chess.PGN(strings.NewReader(scanned.Raw)))
	headers := map[string]string{}
	frames := []domain.Snapshot{}
	replay := chess.NewGame()
	frames = append(frames, snapshotFromGame(replay, headers, nil))
	moves := parsed.Moves()
	notation := chess.UCINotation{}
	uciMoves := make([]string, 0, len(moves))
	labels := make([]string, 0, len(moves))
	for _, mv := range moves {
		uci, err := notation.Encode(replay.Position(), mv)
		if err != nil { return domain.Replay{}, err }
		uciMoves = append(uciMoves, uci)
		labels = append(labels, uci)
		if err := replay.Move(mv); err != nil { return domain.Replay{}, err }
		frames = append(frames, snapshotFromGame(replay, headers, uciMoves))
		frames[len(frames)-1].MoveLabels = append([]string(nil), labels...)
	}
	return domain.Replay{Headers: headers, Frames: frames}, nil
}

func (a *RulesAdapter) replay(moves []string) (*chess.Game, error) {
	g := chess.NewGame()
	for _, mv := range moves {
		if err := g.PushNotationMove(mv, chess.UCINotation{}); err != nil { return nil, err }
	}
	return g, nil
}

func snapshotFromGame(g *chess.Game, headers map[string]string, moves []string) domain.Snapshot {
	fen := ""
	if pos := g.Position(); pos != nil { fen = pos.XFENString() }
	turn := "w"
	if strings.Contains(fen, " b ") { turn = "b" }
	status := "in_progress"
	if g.Outcome() != chess.NoOutcome { status = "finished" }
	return domain.Snapshot{FEN: fen, Turn: turn, Status: status, Moves: append([]string(nil), moves...), Headers: cloneMap(headers), Outcome: fmt.Sprint(g.Outcome()), Method: fmt.Sprint(g.Method())}
}

func cloneMap(src map[string]string) map[string]string {
	if src == nil { return map[string]string{} }
	dst := make(map[string]string, len(src))
	for k, v := range src { dst[k] = v }
	return dst
}
