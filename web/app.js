import {
    Chessboard,
    FEN,
    INPUT_EVENT_TYPE,
    COLOR
} from "https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/Chessboard.js";
import {
    Markers,
    MARKER_TYPE
} from "https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/extensions/markers/Markers.js";
import {
    PromotionDialog
} from "https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/extensions/promotion-dialog/PromotionDialog.js";
import {
    loadPanelOrder,
    savePanelOrder,
    resetPanelOrder,
    applyPanelOrder,
    renderPanelOrderList,
} from "/panel-order.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const STORAGE_KEYS = {
    theme: "veldatlas.theme",
    view: "veldatlas.view",
};
const FRAGMENTS = {
    sidebar: "/fragments/sidebar.html",
    board: "/fragments/board-page.html",
    settings: "/fragments/settings-page.html",
    about: "/fragments/about-page.html",
    fenDialog: "/fragments/fen-dialog.html",
    pgnDialog: "/fragments/pgn-dialog.html",
    engineGameDialog: "/fragments/engine-game-dialog.html",
};
const MOCK_SETTINGS = {
    addr: ":8080",
    theme: "light",
    book: {
        path: "./books/performance.bin"
    },
    engines: {
        stockfish: {
            enabled: true,
            path: "/usr/local/bin/stockfish",
            difficulty: "medium",
            forPlay: true,
            options: {
                Threads: "2",
                Hash: "128",
                MultiPV: "3",
                "Skill Level": "5",
                UCI_LimitStrength: "true",
                UCI_Elo: "1600"
            },
        },
        maia: {
            enabled: false,
            path: "/opt/lc0/lc0",
            difficulty: "maia-default",
            forPlay: true,
            options: {
                Threads: "1"
            }
        },
    },
    ui: {
        defaultAnalysisEngine: "stockfish",
        defaultPlayEngine: "stockfish",
        showBook: true,
        showAnalysis: true
    },
};
const MOCK_SESSION = {
    id: "mock-session",
    moves: [],
    redoMoves: [],
    snapshot: {
        fen: FEN.start,
        turn: "w",
        status: "in_progress",
        outcome: "",
        method: ""
    },
    mode: {
        playingAgainstEngine: false,
        engineName: "",
        humanColor: "white",
        difficulty: "medium"
    },
};

let els = {};
let board = null;
let currentSettings = structuredClone(MOCK_SETTINGS);
let currentGame = structuredClone(MOCK_SESSION);
let currentReplay = null;
let replayIndex = 0;
let localMoves = [];
let selectedPGNFile = null;
let backendAvailable = true;
let currentPanelOrder = [];
let pendingEngineStartFEN = "";

async function loadFragments() {
    const parts = await Promise.all(Object.values(FRAGMENTS).map((u) => fetch(u).then((r) => r.text())));
    document.getElementById("sidebarHost").innerHTML = parts[0];
    document.getElementById("pageHost").innerHTML = parts[1] + parts[2] + parts[3];
    document.getElementById("dialogHost").innerHTML = parts[4] + parts[5] + parts[6];
}

function bindElements() {
    document.querySelectorAll("[id]").forEach((el) => {
        els[el.id] = el;
    });
}

function loadStoredTheme() {
    try {
        return localStorage.getItem(STORAGE_KEYS.theme) || null;
    } catch {
        return null;
    }
}

function saveStoredTheme(theme) {
    try {
        localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {}
}

function loadStoredViewState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.view);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveStoredViewState(state) {
    try {
        localStorage.setItem(STORAGE_KEYS.view, JSON.stringify(state));
    } catch {}
}

async function api(path, opt = {}) {
    try {
        const r = await fetch(path, {
            headers: {
                "Content-Type": "application/json"
            },
            ...opt,
        });
        if (!r.ok) {
            const p = await r.json().catch(() => ({
                error: r.statusText
            }));
            throw new Error(p.error || r.statusText);
        }
        backendAvailable = true;
        return (r.headers.get("content-type") || "").includes("application/json") ? r.json() : r.text();
    } catch {
        backendAvailable = false;
        return mockApi(path, opt);
    }
}

async function fetchLegalMoves(gameId, square) {
    if (!gameId || !square || square.length !== 2) return [];
    const payload = await api(`/api/game/${encodeURIComponent(gameId)}/legal?square=${encodeURIComponent(square)}`);
    return Array.isArray(payload.moves) ? payload.moves : [];
}

function mockApi(path, opt = {}) {
    const method = (opt.method || "GET").toUpperCase();

    if (path === "/api/settings" && method === "GET") {
        return Promise.resolve(structuredClone(currentSettings));
    }
    if (path === "/api/settings" && method === "POST") {
        currentSettings = JSON.parse(opt.body || "{}");
        return Promise.resolve(structuredClone(currentSettings));
    }
    if (path === "/api/game/new" && method === "POST") {
        const body = JSON.parse(opt.body || "{}");
        localMoves = [];
        currentGame = structuredClone(MOCK_SESSION);
        if (body.fen) {
            currentGame.snapshot.fen = body.fen;
            currentGame.snapshot.turn = body.fen.includes(" b ") ? "b" : "w";
            currentGame.startFen = body.fen;
        }
        return Promise.resolve(structuredClone(currentGame));
    }
    if (path === "/api/game/new-vs-engine" && method === "POST") {
        const b = JSON.parse(opt.body || "{}");
        localMoves = [];
        currentGame = structuredClone(MOCK_SESSION);
        currentGame.mode = {
            playingAgainstEngine: true,
            engineName: b.engine || currentSettings.ui.defaultPlayEngine,
            humanColor: b.humanColor || "white",
            difficulty: b.difficulty || "medium",
        };
        if (b.fen) {
            currentGame.snapshot.fen = b.fen;
            currentGame.snapshot.turn = b.fen.includes(" b ") ? "b" : "w";
            currentGame.startFen = b.fen;
        } else if (currentGame.mode.humanColor === "black") {
            localMoves = ["e2e4"];
            currentGame.moves = [...localMoves];
            currentGame.snapshot.turn = "b";
        }
        return Promise.resolve(structuredClone(currentGame));
    }
    if (path.includes("/move") && method === "POST") {
        const b = JSON.parse(opt.body || "{}");
        if (b.move) localMoves.push(b.move);
        return Promise.resolve(mockSession());
    }
    if (path.includes("/undo") && method === "POST") {
        localMoves.pop();
        return Promise.resolve(mockSession());
    }
    if (path.includes("/redo") && method === "POST") {
        return Promise.resolve(structuredClone(currentGame));
    }
    if (path.includes("/engine-move") && method === "POST") {
        localMoves.push("e7e5");
        return Promise.resolve(mockSession());
    }
    if (path.includes("/legal")) {
        const sq = new URLSearchParams(path.split("?")[1] || "").get("square") || "e2";
        return Promise.resolve({
            moves: [`${sq.slice(0, 2)}e4`, `${sq.slice(0, 2)}e3`]
        });
    }
    if (path.includes("/recommendations")) {
        return Promise.resolve({
            book: [{
                    move: "e2e4",
                    weight: 20,
                    percentage: 66.67,
                    source: "polyglot"
                },
                {
                    move: "d2d4",
                    weight: 10,
                    percentage: 33.33,
                    source: "polyglot"
                },
            ],
            engine: [{
                engine: currentSettings.ui.defaultAnalysisEngine,
                bestMove: "e2e4",
                cached: false,
                raw: "mock backend unavailable"
            }, ],
        });
    }
    if (path === "/api/samples/morphy-opera.pgn") {
        return Promise.resolve(`[Event "Opera Game"]
[Site "Paris"]
[Date "1858.??.??"]
[Round "?"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 1-0
`);
    }
    if (path === "/api/replay/load" && method === "POST") {
        const p = parsePGN(opt.body || "");
        return Promise.resolve({
            headers: p.headers,
            frames: [{
                fen: currentGame.snapshot.fen,
                moveLabels: p.moves
            }]
        });
    }
    return Promise.resolve(structuredClone(currentGame));
}

function mockSession() {
    currentGame = {
        ...structuredClone(MOCK_SESSION),
        moves: [...localMoves],
        mode: structuredClone(currentGame.mode),
        snapshot: {
            ...structuredClone(MOCK_SESSION.snapshot),
            fen: currentGame.snapshot?.fen || FEN.start,
            turn: localMoves.length % 2 === 0 ? "w" : "b",
        },
        startFen: currentGame.startFen || "",
    };
    return structuredClone(currentGame);
}

function initBoard() {
    board = new Chessboard(els.board, {
        position: FEN.start,
        assetsUrl: "https://cdn.jsdelivr.net/npm/cm-chessboard@8/assets/",
        style: {
            pieces: {
                file: "pieces/staunty.svg"
            }
        },
        extensions: [{
            class: Markers
        }, {
            class: PromotionDialog
        }],
    });
    board.enableMoveInput(onMoveInput);
}

async function onMoveInput(e) {
    if (e.type === INPUT_EVENT_TYPE.moveInputStarted) {
        if (!currentGame?.id) return true;
        try {
            board.removeMarkers(MARKER_TYPE.dot);
            const legalMoves = await fetchLegalMoves(currentGame.id, e.square);
            legalMoves.forEach((uci) => {
                board.addMarker(MARKER_TYPE.dot, uci.slice(2, 4));
            });
        } catch (err) {
            console.error("Failed to fetch legal moves:", err);
            board.removeMarkers(MARKER_TYPE.dot);
        }
        return true;
    }

    if (e.type === INPUT_EVENT_TYPE.validateMoveInput) {
        const isPawn = e.piece && e.piece.endsWith("p");
        const lastRank = e.squareTo.endsWith("8") || e.squareTo.endsWith("1");
        if (!e.promotion && isPawn && lastRank) {
            board.showPromotionDialog(
                e.squareTo,
                e.piece.startsWith("w") ? COLOR.white : COLOR.black,
                async (result) => {
                    if (result?.piece) {
                        await playMove(`${e.squareFrom}${e.squareTo}${result.piece.slice(-1).toLowerCase()}`);
                    }
                }
            );
            return false;
        }
        await playMove(`${e.squareFrom}${e.squareTo}${e.promotion || ""}`);
        board.removeMarkers(MARKER_TYPE.dot);
        return true;
    }

    return true;
}

function renderEngineSelects() {
    ["engineGameEngineSelect", "cfgDefaultAnalysisEngine", "cfgDefaultPlayEngine"].forEach((id) => {
        if (els[id]) els[id].innerHTML = "";
    });

    Object.keys(currentSettings.engines || {}).forEach((name) => {
        ["engineGameEngineSelect", "cfgDefaultAnalysisEngine", "cfgDefaultPlayEngine"].forEach((id) => {
            if (!els[id]) return;
            const o = document.createElement("option");
            o.value = name;
            o.textContent = name;
            els[id].appendChild(o);
        });
    });

    if (els.engineGameEngineSelect) {
        els.engineGameEngineSelect.value = currentSettings.ui.defaultPlayEngine || "stockfish";
    }
    els.cfgDefaultAnalysisEngine.value = currentSettings.ui.defaultAnalysisEngine || "stockfish";
    els.cfgDefaultPlayEngine.value = currentSettings.ui.defaultPlayEngine || "stockfish";
}

function optionsToText(o) {
    return Object.entries(o || {}).map(([k, v]) => `${k}=${v}`).join("\n");
}

function textToOptions(t) {
    const out = {};
    String(t || "").split(/\r?\n/)
        .map((s) => s.trim()).filter(Boolean).forEach((line) => {
            const i = line.indexOf("=");
            if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        });
    return out;
}

function populateSettings() {
    els.cfgAddr.value = currentSettings.addr || ":8080";
    els.cfgTheme.value = currentSettings.theme || "light";
    els.cfgBookPath.value = currentSettings.book?.path || "";
    els.cfgShowBook.checked = !!currentSettings.ui?.showBook;
    els.cfgShowAnalysis.checked = !!currentSettings.ui?.showAnalysis;
    renderEngineSelects();

    const sf = currentSettings.engines.stockfish || {};
    els.cfgStockfishEnabled.checked = !!sf.enabled;
    els.cfgStockfishForPlay.checked = !!sf.forPlay;
    els.cfgStockfishPath.value = sf.path || "";
    els.cfgStockfishDifficulty.value = sf.difficulty || "medium";
    els.cfgStockfishOptions.value = optionsToText(sf.options);

    const ma = currentSettings.engines.maia || {};
    els.cfgMaiaEnabled.checked = !!ma.enabled;
    els.cfgMaiaForPlay.checked = !!ma.forPlay;
    els.cfgMaiaPath.value = ma.path || "";
    els.cfgMaiaDifficulty.value = ma.difficulty || "maia-default";
    els.cfgMaiaOptions.value = optionsToText(ma.options);

    const storedTheme = loadStoredTheme();
    setTheme(storedTheme || currentSettings.theme || "light", false);
}

function collectSettings() {
    return {
        addr: els.cfgAddr.value || ":8080",
        theme: els.cfgTheme.value || "light",
        book: {
            path: els.cfgBookPath.value || ""
        },
        engines: {
            stockfish: {
                enabled: els.cfgStockfishEnabled.checked,
                path: els.cfgStockfishPath.value || "",
                difficulty: els.cfgStockfishDifficulty.value || "medium",
                forPlay: els.cfgStockfishForPlay.checked,
                options: textToOptions(els.cfgStockfishOptions.value),
            },
            maia: {
                enabled: els.cfgMaiaEnabled.checked,
                path: els.cfgMaiaPath.value || "",
                difficulty: els.cfgMaiaDifficulty.value || "maia-default",
                forPlay: els.cfgMaiaForPlay.checked,
                options: textToOptions(els.cfgMaiaOptions.value),
            },
        },
        ui: {
            defaultAnalysisEngine: els.cfgDefaultAnalysisEngine.value || "stockfish",
            defaultPlayEngine: els.cfgDefaultPlayEngine.value || "stockfish",
            showBook: els.cfgShowBook.checked,
            showAnalysis: els.cfgShowAnalysis.checked,
        },
    };
}

async function loadSettings() {
    currentSettings = await api("/api/settings");
    if (!currentSettings.theme) currentSettings.theme = "light";
    populateSettings();
}

async function saveSettings() {
    currentSettings = await api("/api/settings", {
        method: "POST",
        body: JSON.stringify(collectSettings()),
    });
    if (!currentSettings.theme) currentSettings.theme = "light";
    populateSettings();
}

function setTheme(t, persist = true) {
    const theme = t === "dark" ? "dark" : "light";
    document.body.setAttribute("data-theme", theme);
    if (els.cfgTheme) els.cfgTheme.value = theme;
    if (persist) saveStoredTheme(theme);
}

function toggleTheme() {
    setTheme(document.body.getAttribute("data-theme") === "dark" ? "light" : "dark");
}

function showPage(id) {
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    els[id].classList.add("active");
}

function toggleSidebar() {
    document.getElementById("sidebarHost").classList.toggle("collapsed");
}

function initMenus() {
    document.querySelectorAll(".menu-parent").forEach((btn) => {
        btn.onclick = () => {
            const t = document.getElementById(btn.dataset.target);
            const open = t.classList.toggle("open");
            btn.classList.toggle("active", open);
            btn.querySelector(".caret").textContent = open ? "▾" : "▸";
        };
    });
}

function initViewToggles() {
    const stored = loadStoredViewState();
    document.querySelectorAll("[data-view-target]").forEach((chk) => {
        const id = chk.getAttribute("data-view-target");
        const panel = document.getElementById(id);
        if (!panel) return;
        if (Object.prototype.hasOwnProperty.call(stored, id)) chk.checked = !!stored[id];
        panel.classList.toggle("hidden-panel", !chk.checked);
        chk.onchange = (e) => {
            const checked = !!e.target.checked;
            panel.classList.toggle("hidden-panel", !checked);
            const next = loadStoredViewState();
            next[id] = checked;
            saveStoredViewState(next);
            renderArrangePanels();
        };
    });
}

function openDialog(id) {
    document.getElementById(id).classList.remove("hidden");
}

function closeDialog(id) {
    document.getElementById(id).classList.add("hidden");
}

function initDialogClose() {
    document.querySelectorAll("[data-close-dialog]").forEach((btn) => {
        btn.onclick = () => closeDialog(btn.getAttribute("data-close-dialog"));
    });
}

function parsePGN(raw) {
    const headers = {};
    const lines = String(raw || "").split(/\r?\n/);
    const re = /^\[(\w+)\s+"(.*)"\]$/;
    let inMoves = false;
    const moveLines = [];
    for (const line of lines) {
        const t = line.trim();
        const m = t.match(re);
        if (m && !inMoves) {
            headers[m[1]] = m[2];
            continue;
        }
        if (t === "" && Object.keys(headers).length > 0) {
            inMoves = true;
            continue;
        }
        if (inMoves) moveLines.push(t);
    }
    let movesText = moveLines.join(" ").replace(/\{[^}]*\}/g, " ").replace(/\([^)]*\)/g, " ");
    let tokens = movesText.split(/\s+/).filter(Boolean);
    tokens = tokens.filter((tok) => !/^\d+\.+$/.test(tok) && !/^\d+\.\.\.$/.test(tok) && !["1-0", "0-1", "1/2-1/2", "*"].includes(tok));
    return {
        headers,
        moves: tokens
    };
}

function renderPGNDetails(parsed) {
    const h = parsed.headers || {};
    [
        ["pgnEvent", h.Event || ""],
        ["pgnSite", h.Site || ""],
        ["pgnDate", h.Date || ""],
        ["pgnRound", h.Round || ""],
        ["pgnWhite", h.White || ""],
        ["pgnBlack", h.Black || ""],
        ["pgnResult", h.Result || ""],
        ["pgnEco", h.ECO || ""]
    ].forEach(([id, val]) => {
        els[id].value = val;
    });
    els.pgnMovesList.innerHTML = "";
    (parsed.moves || []).forEach((m, i, arr) => {
        if (i % 2 === 0) {
            const row = document.createElement("div");
            row.className = "pgn-move-row";
            row.innerHTML = `<div>${Math.floor(i / 2) + 1}.</div><div>${m || ""}</div><div>${arr[i + 1] || ""}</div>`;
            els.pgnMovesList.appendChild(row);
        }
    });
}

function clearPGNDetails() {
    renderPGNDetails({
        headers: {},
        moves: []
    });
}

async function loadReplay(raw) {
    const parsed = parsePGN(raw);
    renderPGNDetails(parsed);
    currentReplay = await api("/api/replay/load", {
        method: "POST",
        body: raw
    });
    replayIndex = 0;
    renderReplayFrame();
    showPage("pageMain");
}

function renderReplayFrame() {
    if (!currentReplay?.frames?.length) {
        els.replayInfo.textContent = "No replay loaded.";
        return;
    }
    const frame = currentReplay.frames[replayIndex];
    if (frame?.fen) board.setPosition(frame.fen, true);
    els.replayInfo.textContent = JSON.stringify({
        index: replayIndex,
        headers: currentReplay.headers,
        frame
    }, null, 2);
}

function validateFEN(fen) {
    const result = {
        ok: false,
        error: ""
    };
    const trimmed = String(fen).trim();
    if (!trimmed) {
        result.error = "Enter a full 6-part FEN.";
        return result;
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length !== 6) {
        result.error = "FEN must contain 6 space-separated fields.";
        return result;
    }
    const [boardPart, side, castling, ep, halfmove, fullmove] = parts;
    const ranks = boardPart.split("/");
    if (ranks.length !== 8) {
        result.error = "Board field must contain 8 ranks.";
        return result;
    }
    let WK = 0;
    let BK = 0;
    for (const rank of ranks) {
        let count = 0;
        for (const ch of rank) {
            if (/[1-8]/.test(ch)) {
                count += Number(ch);
            } else if (/[pnbrqkPNBRQK]/.test(ch)) {
                count += 1;
                if (ch === "K") WK += 1;
                if (ch === "k") BK += 1;
            } else {
                result.error = `Invalid board character: ${ch}`;
                return result;
            }
        }
        if (count !== 8) {
            result.error = "Each rank must describe exactly 8 squares.";
            return result;
        }
    }
    if (WK !== 1 || BK !== 1) {
        result.error = "FEN must contain exactly one white king and one black king.";
        return result;
    }
    if (!/^[wb]$/.test(side)) {
        result.error = "Side-to-move field must be w or b.";
        return result;
    }
    if (!(castling === "-" || /^[KQkq]+$/.test(castling))) {
        result.error = "Castling field must be - or a combination of KQkq.";
        return result;
    }
    if (!(ep === "-" || /^[a-h][36]$/.test(ep))) {
        result.error = "En-passant field must be - or a square like e3 or d6.";
        return result;
    }
    if (!/^\d+$/.test(halfmove)) {
        result.error = "Halfmove clock must be a non-negative integer.";
        return result;
    }
    if (!/^\d+$/.test(fullmove) || Number(fullmove) < 1) {
        result.error = "Fullmove number must be an integer >= 1.";
        return result;
    }
    result.ok = true;
    result.error = "FEN looks valid.";
    return result;
}

function updateFENValidationUI() {
    const check = validateFEN(els.fenInput.value);
    els.fenValidationHint.textContent = check.error;
    els.fenValidationHint.classList.remove("ok", "error");
    els.fenInput.classList.remove("valid", "invalid");
    if (check.ok) {
        els.fenValidationHint.classList.add("ok");
        els.fenInput.classList.add("valid");
        if (els.fenLoadBtn) els.fenLoadBtn.disabled = false;
        if (els.fenStartAnalysisBtn) els.fenStartAnalysisBtn.disabled = false;
        if (els.fenStartEngineBtn) els.fenStartEngineBtn.disabled = false;
        els.fenError.classList.add("hidden");
    } else {
        els.fenValidationHint.classList.add("error");
        if (els.fenInput.value.trim()) els.fenInput.classList.add("invalid");
        if (els.fenLoadBtn) els.fenLoadBtn.disabled = true;
        if (els.fenStartAnalysisBtn) els.fenStartAnalysisBtn.disabled = true;
        if (els.fenStartEngineBtn) els.fenStartEngineBtn.disabled = true;
    }
}

function loadFENIntoBoard(fen) {
    currentGame.snapshot = {
        ...currentGame.snapshot,
        fen,
        turn: fen.includes(" b ") ? "b" : "w",
        status: "in_progress"
    };
    currentGame.moves = [];
    board.setPosition(fen, true);
    renderSession(currentGame);
    els.recommendations.textContent = "Local FEN loaded. Recommendation refresh will use backend if available.";
}

function humanColorFromFEN(fen) {
    return fen.includes(" b ") ? "black" : "white";
}

async function startAnalysisFromFEN(fen) {
    currentGame = await api("/api/game/new", {
        method: "POST",
        body: JSON.stringify({
            fen
        })
    });
    currentReplay = null;
    replayIndex = 0;
    renderSession(currentGame);
    clearPGNDetails();
    await loadRecommendations();
    showPage("pageMain");
}

function openEngineGameDialogFromFEN(fen) {
    pendingEngineStartFEN = fen;
    const forcedHumanColor = humanColorFromFEN(fen);
    if (els.engineGameFenNotice) els.engineGameFenNotice.classList.remove("hidden");
    if (els.engineGameHumanColorSelect) {
        els.engineGameHumanColorSelect.value = forcedHumanColor;
        els.engineGameHumanColorSelect.disabled = true;
    }
    if (els.engineGameDifficultySelect) els.engineGameDifficultySelect.value = "medium";
    if (els.engineGameEngineSelect && els.cfgDefaultPlayEngine) {
        els.engineGameEngineSelect.value = els.cfgDefaultPlayEngine.value || "stockfish";
    }
    openDialog("engineGameDialog");
}

function openNormalEngineGameDialog() {
    pendingEngineStartFEN = "";
    if (els.engineGameFenNotice) els.engineGameFenNotice.classList.add("hidden");
    if (els.engineGameHumanColorSelect) {
        els.engineGameHumanColorSelect.disabled = false;
        els.engineGameHumanColorSelect.value = "white";
    }
    if (els.engineGameDifficultySelect) els.engineGameDifficultySelect.value = "medium";
    if (els.engineGameEngineSelect && els.cfgDefaultPlayEngine) {
        els.engineGameEngineSelect.value = els.cfgDefaultPlayEngine.value || "stockfish";
    }
    openDialog("engineGameDialog");
}

async function playMove(move) {
    currentGame = await api(`/api/game/${currentGame.id}/move`, {
        method: "POST",
        body: JSON.stringify({
            move
        })
    });
    renderSession(currentGame);
    await loadRecommendations();
}

async function newGame(mode = "pvp") {
    currentGame = await api("/api/game/new", {
        method: "POST"
    });
    currentReplay = null;
    replayIndex = 0;
    renderSession(currentGame);
    clearPGNDetails();
    await loadRecommendations();
    showPage("pageMain");
}

async function newVsEngine(config = null) {
    const payload = config || {
        engine: els.engineGameEngineSelect.value,
        difficulty: els.engineGameDifficultySelect.value,
        humanColor: els.engineGameHumanColorSelect.value,
        fen: pendingEngineStartFEN || "",
    };
    currentGame = await api("/api/game/new-vs-engine", {
        method: "POST",
        body: JSON.stringify(payload)
    });
    currentReplay = null;
    replayIndex = 0;
    renderSession(currentGame);
    clearPGNDetails();
    await loadRecommendations();
    showPage("pageMain");
    pendingEngineStartFEN = "";
}

async function loadRecommendations() {
    if (!currentGame?.id) return;
    const engine = currentSettings?.ui?.defaultAnalysisEngine || "stockfish";
    const difficulty = "medium";
    const topN = 5;
    const panel = await api(`/api/game/${currentGame.id}/recommendations?engine=${encodeURIComponent(engine)}&difficulty=${encodeURIComponent(difficulty)}&topN=${encodeURIComponent(topN)}`);
    const lines = ["Book"];
    if (!panel.book?.length) lines.push("  - no book suggestions");
    else panel.book.forEach((item) => lines.push(`  - ${item.move} | weight=${item.weight} | ${Number(item.percentage).toFixed(2)}%`));
    lines.push("");
    lines.push("Engine");
    if (!panel.engine?.length) lines.push("  - no engine suggestion");
    else panel.engine.forEach((item) => {
        let line = `  - ${item.engine}: ${item.bestMove || "(no move)"}`;
        if (item.cached) line += " [cached]";
        lines.push(line);
        if (item.raw) lines.push(`    raw: ${item.raw}`);
    });
    els.recommendations.textContent = lines.join("\n");
    els.analysis.textContent = panel.engine?.length ? JSON.stringify(panel.engine, null, 2) : "No engine analysis.";
}

function renderSession(session) {
    currentGame = session;
    board.setPosition(session.snapshot?.fen || FEN.start, true);
    els.moves.innerHTML = "";
    (session.moves || []).forEach((m) => {
        const li = document.createElement("li");
        li.textContent = m;
        els.moves.appendChild(li);
    });
    els.gameInfo.textContent = JSON.stringify({
        id: session.id,
        fen: session.snapshot?.fen,
        turn: session.snapshot?.turn,
        status: session.snapshot?.status,
        mode: session.mode,
        backend: backendAvailable ? "connected" : "mock"
    }, null, 2);
}

function renderArrangePanels() {
    const hiddenState = {
        gameInfoPanel: document.getElementById("gameInfoPanel").classList.contains("hidden-panel"),
        moveListPanel: document.getElementById("moveListPanel").classList.contains("hidden-panel"),
        recommendationsPanel: document.getElementById("recommendationsPanel").classList.contains("hidden-panel"),
        analysisPanel: document.getElementById("analysisPanel").classList.contains("hidden-panel"),
        replayPanel: document.getElementById("replayPanel").classList.contains("hidden-panel"),
        pgnDetailsPanel: document.getElementById("pgnDetailsPanel").classList.contains("hidden-panel"),
    };
    renderPanelOrderList({
        listElement: els.panelOrderList,
        order: currentPanelOrder,
        hiddenState,
        onOrderChanged: (nextOrder) => {
            currentPanelOrder = nextOrder;
            savePanelOrder(nextOrder);
            applyPanelOrder(els.reorderablePanelsContainer, nextOrder);
            renderArrangePanels();
        },
    });
}

function bindEvents() {
    els.sidebarToggle.onclick = toggleSidebar;
    els.menuToggleTheme.onclick = toggleTheme;
    els.menuSettings.onclick = () => {
        renderArrangePanels();
        showPage("pageSettings");
    };
    els.menuAbout.onclick = () => showPage("pageAbout");
    els.aboutBackBtn.onclick = () => showPage("pageMain");
    els.backToBoardBtn.onclick = () => showPage("pageMain");

    els.menuNewPvP.onclick = () => newGame("pvp");
    els.menuNewAnalysis.onclick = () => newGame("analysis");
    els.menuNewVsEngine.onclick = () => openNormalEngineGameDialog();
    els.newGameBtn.onclick = () => newGame("pvp");

    els.undoBtn.onclick = async () => {
        currentGame = await api(`/api/game/${currentGame.id}/undo`, {
            method: "POST"
        });
        renderSession(currentGame);
        await loadRecommendations();
    };
    els.redoBtn.onclick = async () => {
        currentGame = await api(`/api/game/${currentGame.id}/redo`, {
            method: "POST"
        });
        renderSession(currentGame);
        await loadRecommendations();
    };
    els.recommendBtn.onclick = () => loadRecommendations();
    els.engineMoveBtn.onclick = async () => {
        currentGame = await api(`/api/game/${currentGame.id}/engine-move`, {
            method: "POST"
        });
        renderSession(currentGame);
        await loadRecommendations();
    };
    els.settingsReloadBtn.onclick = () => loadSettings();
    els.saveSettingsBtn.onclick = () => saveSettings();
    els.cfgTheme.onchange = () => setTheme(els.cfgTheme.value, true);

    if (els.engineGameStartBtn) {
        els.engineGameStartBtn.onclick = async () => {
            await newVsEngine({
                engine: els.engineGameEngineSelect.value,
                difficulty: els.engineGameDifficultySelect.value,
                humanColor: els.engineGameHumanColorSelect.value,
                fen: pendingEngineStartFEN || "",
            });
            closeDialog("engineGameDialog");
        };
    }

    els.resetPanelOrderBtn.onclick = () => {
        currentPanelOrder = resetPanelOrder();
        applyPanelOrder(els.reorderablePanelsContainer, currentPanelOrder);
        renderArrangePanels();
    };
    els.replayPrevBtn.onclick = () => {
        if (replayIndex > 0) replayIndex -= 1;
        renderReplayFrame();
    };
    els.replayNextBtn.onclick = () => {
        if (currentReplay?.frames && replayIndex < currentReplay.frames.length - 1) replayIndex += 1;
        renderReplayFrame();
    };
    els.menuOpenSample.onclick = async () => {
        const pgn = await api("/api/samples/morphy-opera.pgn");
        await loadReplay(pgn);
    };
    els.menuOpenPgn.onclick = () => openDialog("pgnDialog");
    els.menuEnterFen.onclick = () => {
        els.fenInput.value = currentGame?.snapshot?.fen || START_FEN;
        els.fenError.classList.add("hidden");
        updateFENValidationUI();
        openDialog("fenDialog");
    };
    els.fenInput.addEventListener("input", updateFENValidationUI);

    els.fenLoadBtn.onclick = () => {
        const check = validateFEN(els.fenInput.value.trim());
        updateFENValidationUI();
        if (!check.ok) {
            els.fenError.textContent = check.error;
            els.fenError.classList.remove("hidden");
            return;
        }
        els.fenError.classList.add("hidden");
        loadFENIntoBoard(els.fenInput.value.trim());
        closeDialog("fenDialog");
    };

    if (els.fenStartAnalysisBtn) {
        els.fenStartAnalysisBtn.onclick = async () => {
            const fen = els.fenInput.value.trim();
            const check = validateFEN(fen);
            updateFENValidationUI();
            if (!check.ok) {
                els.fenError.textContent = check.error;
                els.fenError.classList.remove("hidden");
                return;
            }
            els.fenError.classList.add("hidden");
            closeDialog("fenDialog");
            await startAnalysisFromFEN(fen);
        };
    }

    if (els.fenStartEngineBtn) {
        els.fenStartEngineBtn.onclick = () => {
            const fen = els.fenInput.value.trim();
            const check = validateFEN(fen);
            updateFENValidationUI();
            if (!check.ok) {
                els.fenError.textContent = check.error;
                els.fenError.classList.remove("hidden");
                return;
            }
            els.fenError.classList.add("hidden");
            closeDialog("fenDialog");
            openEngineGameDialogFromFEN(fen);
        };
    }

    els.fenResetBtn.onclick = () => {
        els.fenInput.value = START_FEN;
        els.fenError.classList.add("hidden");
        updateFENValidationUI();
    };
    els.pgnFileInput.onchange = () => {
        selectedPGNFile = els.pgnFileInput.files?.[0] || null;
        els.pgnFileName.textContent = selectedPGNFile ? `${selectedPGNFile.name} (${Math.max(1, Math.round(selectedPGNFile.size / 1024))} KB)` : "No file selected.";
    };
    els.pgnFileLoadBtn.onclick = async () => {
        if (!selectedPGNFile) {
            alert("No PGN file selected.");
            return;
        }
        const txt = await selectedPGNFile.text();
        els.pgnTextInput.value = txt;
        await loadReplay(txt);
        closeDialog("pgnDialog");
    };
    els.pgnLoadBtn.onclick = async () => {
        await loadReplay(els.pgnTextInput.value || "");
        closeDialog("pgnDialog");
    };
    initDialogClose();
}

async function main() {
    await loadFragments();
    bindElements();
    const storedTheme = loadStoredTheme();
    if (storedTheme) setTheme(storedTheme, false);
    initBoard();
    initMenus();
    initViewToggles();
    bindEvents();
    currentPanelOrder = loadPanelOrder();
    applyPanelOrder(els.reorderablePanelsContainer, currentPanelOrder);
    await loadSettings();
    renderArrangePanels();
    await newGame("pvp");
}

main();