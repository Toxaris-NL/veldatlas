package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/Toxaris-Nl/veldatlas/internal/config"
	"github.com/Toxaris-Nl/veldatlas/internal/domain"
	"github.com/Toxaris-Nl/veldatlas/internal/service"

)

// API owns the handler methods and the application service dependency.
// The actual HTTP server returned by New(...) is the standard library *http.Server.
type API struct {
    svc *service.Service
}

// New constructs the HTTP routes and returns a standard *http.Server.
//
// The API methods are bound to a small wrapper type so that:
//
// - handler methods can access the service dependency cleanly
// - routing stays in one place
// - callers still receive a normal *http.Server they can run directly
func New(addr string, svc *service.Service) *http.Server {
    api := &API{
        svc: svc,
    }

    mux := http.NewServeMux()

    mux.HandleFunc("/api/settings", api.handleSettings)
    mux.HandleFunc("/api/game/new", api.handleNewGame)
    mux.HandleFunc("/api/game/new-vs-engine", api.handleNewVsEngine)
    mux.HandleFunc("/api/game/", api.handleGame)
    mux.HandleFunc("/api/replay/load", api.handleLoadReplay)
    mux.HandleFunc("/api/samples/", api.handleSamplePGN)
    mux.HandleFunc("/", api.handleIndex)

    return &http.Server{
        Addr:    addr,
        Handler: withCORS(mux),
    }
}

func (api *API) handleIndex(w http.ResponseWriter, r *http.Request) {
    name := path.Clean(strings.TrimPrefix(r.URL.Path, "/"))
    if name == "." || name == "" {
        name = "index.html"
    }

    full := filepath.Join("web", name)
    if _, err := os.Stat(full); err != nil {
        http.NotFound(w, r)
        return
    }

    if strings.HasSuffix(name, ".css") {
        w.Header().Set("Content-Type", "text/css; charset=utf-8")
    }
    if strings.HasSuffix(name, ".js") {
        w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
    }

    http.ServeFile(w, r, full)
}

func (api *API) handleSamplePGN(w http.ResponseWriter, r *http.Request) {
    name := filepath.Join("samples", path.Base(strings.TrimPrefix(r.URL.Path, "/api/samples/")))
    if _, err := os.Stat(name); err != nil {
        http.NotFound(w, r)
        return
    }

    w.Header().Set("Content-Type", "text/plain; charset=utf-8")
    http.ServeFile(w, r, name)
}

func (api *API) handleSettings(w http.ResponseWriter, r *http.Request) {
    switch r.Method {
    case http.MethodGet:
        writeJSON(w, http.StatusOK, api.svc.Settings())

    case http.MethodPost:
        var cfg config.Settings
        if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
            writeError(w, http.StatusBadRequest, "invalid settings payload")
            return
        }

        if err := api.svc.SaveSettings(cfg); err != nil {
            writeError(w, http.StatusBadRequest, err.Error())
            return
        }

        writeJSON(w, http.StatusOK, api.svc.Settings())

    default:
        writeError(w, http.StatusMethodNotAllowed, "method not allowed")
    }
}

func (api *API) handleNewGame(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        writeError(w, http.StatusMethodNotAllowed, "method not allowed")
        return
    }

    var body struct {
        FEN string `json:"fen"`
    }
    // Ignore decode errors — body is optional
    _ = json.NewDecoder(r.Body).Decode(&body)

    ss, err := api.svc.NewGame(strings.TrimSpace(body.FEN))
    if err != nil {
        writeError(w, http.StatusInternalServerError, err.Error())
        return
    }

    writeJSON(w, http.StatusOK, ss)
}

func (api *API) handleNewVsEngine(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        writeError(w, http.StatusMethodNotAllowed, "method not allowed")
        return
    }

    var body struct {
        Engine     string `json:"engine"`
        HumanColor string `json:"humanColor"`
        Difficulty string `json:"difficulty"`
        FEN        string `json:"fen"`
    }

    if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
        writeError(w, http.StatusBadRequest, "invalid payload")
        return
    }

    ss, err := api.svc.StartEngineGame(body.Engine, body.HumanColor, body.Difficulty, strings.TrimSpace(body.FEN))
    if err != nil {
        writeServiceError(w, err)
        return
    }

    writeJSON(w, http.StatusOK, ss)
}

func (api *API) handleGame(w http.ResponseWriter, r *http.Request) {
    p := strings.TrimPrefix(r.URL.Path, "/api/game/")
    parts := strings.Split(strings.Trim(p, "/"), "/")

    if len(parts) == 0 || parts[0] == "" {
        writeError(w, http.StatusBadRequest, "missing game id")
        return
    }

    id := parts[0]

    if len(parts) == 1 && r.Method == http.MethodGet {
        ss, err := api.svc.Get(id)
        if err != nil {
            writeServiceError(w, err)
            return
        }
        writeJSON(w, http.StatusOK, ss)
        return
    }

    if len(parts) < 2 {
        writeError(w, http.StatusNotFound, "unknown endpoint")
        return
    }

    switch parts[1] {
    case "move":
        api.handleMove(w, r, id)
    case "undo":
        api.handleUndo(w, r, id)
    case "redo":
        api.handleRedo(w, r, id)
    case "legal":
        api.handleLegal(w, r, id)
    case "analysis":
        api.handleAnalysis(w, r, id)
    case "recommendations":
        api.handleRecommendations(w, r, id)
    case "engine-move":
        api.handleEngineMove(w, r, id)
    case "book":
        api.handleBook(w, r, id)
    default:
        writeError(w, http.StatusNotFound, "unknown endpoint")
    }
}

func (api *API) handleMove(w http.ResponseWriter, r *http.Request, id string) {
    if r.Method != http.MethodPost {
        writeError(w, http.StatusMethodNotAllowed, "method not allowed")
        return
    }

    var body struct {
        Move string `json:"move"`
    }

    if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Move) == "" {
        writeError(w, http.StatusBadRequest, "invalid move payload")
        return
    }

    ss, err := api.svc.Play(id, body.Move)
    if err != nil {
        writeServiceError(w, err)
        return
    }

    writeJSON(w, http.StatusOK, ss)
}

func (api *API) handleUndo(w http.ResponseWriter, r *http.Request, id string) {
    if r.Method != http.MethodPost {
        writeError(w, http.StatusMethodNotAllowed, "method not allowed")
        return
    }

    ss, err := api.svc.Undo(id)
    if err != nil {
        writeServiceError(w, err)
        return
    }

    writeJSON(w, http.StatusOK, ss)
}

func (api *API) handleRedo(w http.ResponseWriter, r *http.Request, id string) {
    if r.Method != http.MethodPost {
        writeError(w, http.StatusMethodNotAllowed, "method not allowed")
        return
    }

    ss, err := api.svc.Redo(id)
    if err != nil {
        writeServiceError(w, err)
        return
    }

    writeJSON(w, http.StatusOK, ss)
}

func (api *API) handleLegal(w http.ResponseWriter, r *http.Request, id string) {
    if r.Method != http.MethodGet {
        writeError(w, http.StatusMethodNotAllowed, "method not allowed")
        return
    }

    square := strings.TrimSpace(r.URL.Query().Get("square"))
    moves, err := api.svc.Legal(id, square)
    if err != nil {
        writeServiceError(w, err)
        return
    }

    writeJSON(w, http.StatusOK, map[string]any{
        "moves": moves,
    })
}

func (api *API) handleAnalysis(w http.ResponseWriter, r *http.Request, id string) {
    if r.Method != http.MethodPost {
        writeError(w, http.StatusMethodNotAllowed, "method not allowed")
        return
    }

    var req domain.AnalysisRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeError(w, http.StatusBadRequest, "invalid analysis payload")
        return
    }

    lines, err := api.svc.Analyze(id, req)
    if err != nil {
        writeServiceError(w, err)
        return
    }

    writeJSON(w, http.StatusOK, lines)
}

func (api *API) handleRecommendations(w http.ResponseWriter, r *http.Request, id string) {
    if r.Method != http.MethodGet {
        writeError(w, http.StatusMethodNotAllowed, "method not allowed")
        return
    }

    req := domain.AnalysisRequest{
        Engine:     strings.TrimSpace(r.URL.Query().Get("engine")),
        Difficulty: strings.TrimSpace(r.URL.Query().Get("difficulty")),
        TopN:       5,
    }

    if rawTopN := strings.TrimSpace(r.URL.Query().Get("topN")); rawTopN != "" {
        if v, err := strconv.Atoi(rawTopN); err == nil && v > 0 {
            req.TopN = v
        }
    }

    panel, err := api.svc.Recommendations(id, req)
    if err != nil {
        writeServiceError(w, err)
        return
    }

    writeJSON(w, http.StatusOK, panel)
}

func (api *API) handleEngineMove(w http.ResponseWriter, r *http.Request, id string) {
    if r.Method != http.MethodPost {
        writeError(w, http.StatusMethodNotAllowed, "method not allowed")
        return
    }

    ss, err := api.svc.EngineMove(id)
    if err != nil {
        writeServiceError(w, err)
        return
    }

    writeJSON(w, http.StatusOK, ss)
}

func (api *API) handleBook(w http.ResponseWriter, r *http.Request, id string) {
    if r.Method != http.MethodGet {
        writeError(w, http.StatusMethodNotAllowed, "method not allowed")
        return
    }

    items, err := api.svc.Book(id)
    if err != nil {
        writeServiceError(w, err)
        return
    }

    writeJSON(w, http.StatusOK, items)
}

func (api *API) handleLoadReplay(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        writeError(w, http.StatusMethodNotAllowed, "method not allowed")
        return
    }

    body, err := io.ReadAll(r.Body)
    if err != nil {
        writeError(w, http.StatusBadRequest, "invalid PGN payload")
        return
    }
    if strings.TrimSpace(string(body)) == "" {
        writeError(w, http.StatusBadRequest, "empty PGN payload")
        return
    }

    replay, err := api.svc.LoadReplay(string(body))
    if err != nil {
        writeError(w, http.StatusBadRequest, err.Error())
        return
    }

    writeJSON(w, http.StatusOK, replay)
}

func writeServiceError(w http.ResponseWriter, err error) {
    switch {
    case errors.Is(err, service.ErrSessionNotFound):
        writeError(w, http.StatusNotFound, err.Error())

    case errors.Is(err, service.ErrNoMovesToUndo),
        errors.Is(err, service.ErrNoMovesToRedo),
        errors.Is(err, service.ErrEngineNotConfigured):
        writeError(w, http.StatusBadRequest, err.Error())

    default:
        writeError(w, http.StatusBadRequest, err.Error())
    }
}

func writeJSON(w http.ResponseWriter, status int, v any) {
    w.Header().Set("Content-Type", "application/json; charset=utf-8")
    w.WriteHeader(status)
    _ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
    writeJSON(w, status, map[string]string{
        "error": msg,
    })
}

func withCORS(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "*")
        w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
        w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

        if r.Method == http.MethodOptions {
            w.WriteHeader(http.StatusNoContent)
            return
        }

        next.ServeHTTP(w, r)
    })
}