package corentings

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	chess "github.com/corentings/chess/v2"
	"github.com/corentings/chess/v2/uci"

	"github.com/Toxaris-Nl/veldatlas/internal/config"
	"github.com/Toxaris-Nl/veldatlas/internal/domain"
)

type AnalysisAdapter struct{}

func NewAnalysisAdapter() *AnalysisAdapter { return &AnalysisAdapter{} }

func (a *AnalysisAdapter) Analyze(snapshot domain.Snapshot, engine config.EngineConfig, req domain.AnalysisRequest) ([]domain.AnalysisLine, error) {
	eng, err := uci.New(engine.Path)
	if err != nil { return nil, err }
	defer eng.Close()
	if err := eng.Run(a.initCommands(engine, req)...); err != nil { return nil, err }
	if err := eng.Run(uci.CmdPosition{Position: buildPosition(snapshot)}, a.goCommand(req, engine)); err != nil { return nil, err }
	res := eng.SearchResults()
	line := domain.AnalysisLine{Engine: req.Engine, Raw: fmt.Sprintf("%+v", res)}
	if res.BestMove != nil { line.BestMove = res.BestMove.String() }
	return []domain.AnalysisLine{line}, nil
}

func (a *AnalysisAdapter) ChooseMove(snapshot domain.Snapshot, engine config.EngineConfig, req domain.AnalysisRequest) (domain.EnginePlayResult, error) {
	lines, err := a.Analyze(snapshot, engine, req)
	if err != nil { return domain.EnginePlayResult{}, err }
	best := ""
	if len(lines) > 0 { best = lines[0].BestMove }
	return domain.EnginePlayResult{Move: best, Analysis: lines}, nil
}

func (a *AnalysisAdapter) initCommands(engine config.EngineConfig, req domain.AnalysisRequest) []uci.Cmd {
	cmds := []uci.Cmd{uci.CmdUCI, uci.CmdIsReady, uci.CmdUCINewGame}
	options := mergedOptions(engine, req)
	for _, key := range sortedKeys(options) {
		cmds = append(cmds, uci.CmdSetOption{Name: key, Value: options[key]})
	}
	return cmds
}

func (a *AnalysisAdapter) goCommand(req domain.AnalysisRequest, engine config.EngineConfig) uci.CmdGo {
	cmd := uci.CmdGo{}
	if req.Depth > 0 { cmd.Depth = req.Depth; return cmd }
	if req.Nodes > 0 { cmd.Nodes = req.Nodes; return cmd }
	switch strings.ToLower(strings.TrimSpace(firstNonEmpty(req.Difficulty, engine.Difficulty))) {
	case "easy":
		cmd.MoveTime = 100 * time.Millisecond
	case "medium":
		cmd.MoveTime = 350 * time.Millisecond
	case "hard":
		cmd.MoveTime = 1200 * time.Millisecond
	case "maia-default":
		cmd.Nodes = 1
	default:
		cmd.MoveTime = 500 * time.Millisecond
	}
	return cmd
}

func mergedOptions(engine config.EngineConfig, req domain.AnalysisRequest) map[string]string {
	out := map[string]string{}
	for k, v := range engine.Options { out[k] = v }
	for k, v := range req.Options { out[k] = v }
	switch strings.ToLower(strings.TrimSpace(firstNonEmpty(req.Difficulty, engine.Difficulty))) {
	case "easy":
		out["Skill Level"] = firstNonEmpty(out["Skill Level"], "1")
		out["UCI_LimitStrength"] = firstNonEmpty(out["UCI_LimitStrength"], "true")
		out["UCI_Elo"] = firstNonEmpty(out["UCI_Elo"], "1350")
	case "medium":
		out["Skill Level"] = firstNonEmpty(out["Skill Level"], "5")
		out["UCI_LimitStrength"] = firstNonEmpty(out["UCI_LimitStrength"], "true")
		out["UCI_Elo"] = firstNonEmpty(out["UCI_Elo"], "1600")
	case "hard":
		out["Skill Level"] = firstNonEmpty(out["Skill Level"], "12")
		out["UCI_LimitStrength"] = firstNonEmpty(out["UCI_LimitStrength"], "false")
	}
	return out
}

func buildPosition(snapshot domain.Snapshot) *chess.Position {
	if snapshot.FEN == "" {
		return chess.NewGame().Position()
	}
	fenFunc, err := chess.FEN(snapshot.FEN)
	if err != nil {
		return chess.NewGame().Position()
	}
	return chess.NewGame(fenFunc).Position()
}

func sortedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m { keys = append(keys, k) }
	sort.Strings(keys)
	return keys
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" { return v }
	}
	return ""
}

func _unused(_ int) string { return strconv.Itoa(0) }