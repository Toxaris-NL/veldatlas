import { Chessboard, FEN, INPUT_EVENT_TYPE, COLOR } from "https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/Chessboard.js";
import { Markers, MARKER_TYPE } from "https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/extensions/markers/Markers.js";
import { PromotionDialog } from "https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/extensions/promotion-dialog/PromotionDialog.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const FRAGMENTS = {
  sidebar: "/fragments/sidebar.html",
  board: "/fragments/board-page.html",
  settings: "/fragments/settings-page.html",
  about: "/fragments/about-page.html",
  fenDialog: "/fragments/fen-dialog.html",
  pgnDialog: "/fragments/pgn-dialog.html",
};

const STORAGE_KEYS = {
  theme: "veldatlas.theme",
  view: "veldatlas.view",
};

const MOCK_SETTINGS = {
  addr: ":8080",
  theme: "light",
  book: {
    path: "./books/performance.bin",
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
        UCI_Elo: "1600",
      },
    },
    maia: {
      enabled: false,
      path: "/opt/lc0/lc0",
      difficulty: "maia-default",
      forPlay: true,
      options: {
        Threads: "1",
      },
    },
  },
  ui: {
    defaultAnalysisEngine: "stockfish",
    defaultPlayEngine: "stockfish",
    showBook: true,
    showAnalysis: true,
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
    method: "",
  },
  mode: {
    playingAgainstEngine: false,
    engineName: "",
    humanColor: "white",
    difficulty: "medium",
  },
};

let currentSettings = structuredClone(MOCK_SETTINGS);
let currentGame = structuredClone(MOCK_SESSION);
let currentReplay = null;
let replayIndex = 0;
let backendAvailable = true;
let localMoves = [];
let selectedPGNFile = null;
let board = null;

const els = {};

async function loadFragments() {
  const [sidebar, boardPage, settingsPage, aboutPage, fenDialog, pgnDialog] =
    await Promise.all(
      Object.values(FRAGMENTS).map((path) => fetch(path).then((r) => r.text()))
    );

  document.getElementById("sidebarHost").innerHTML = sidebar;
  document.getElementById("pageHost").innerHTML =
    boardPage + settingsPage + aboutPage;
  document.getElementById("dialogHost").innerHTML = fenDialog + pgnDialog;
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
  } catch {
    // ignore storage failures
  }
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
  } catch {
    // ignore storage failures
  }
}

async function api(path, options = {}) {
  try {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({
        error: response.statusText,
      }));
      throw new Error(payload.error || response.statusText);
    }

    backendAvailable = true;
    const ctype = response.headers.get("content-type") || "";
    return ctype.includes("application/json")
      ? response.json()
      : response.text();
  } catch {
    backendAvailable = false;
    return mockApi(path, options);
  }
}

function mockApi(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();

  if (path === "/api/settings" && method === "GET") {
    return Promise.resolve(structuredClone(currentSettings));
  }

  if (path === "/api/settings" && method === "POST") {
    currentSettings = JSON.parse(options.body || "{}");
    return Promise.resolve(structuredClone(currentSettings));
  }

  if (path === "/api/game/new" && method === "POST") {
  const body = JSON.parse(options.body || "{}");
  localMoves = [];
  currentGame = structuredClone(MOCK_SESSION);
  if (body.fen) {
    currentGame.snapshot.fen = body.fen;
    currentGame.snapshot.turn = body.fen.includes(" b ") ? "b" : "w";
  }
  return Promise.resolve(structuredClone(currentGame));
}

  if (path === "/api/game/new-vs-engine" && method === "POST") {
    const body = JSON.parse(options.body || "{}");
    localMoves = [];
    currentGame = structuredClone(MOCK_SESSION);

    currentGame.mode = {
      playingAgainstEngine: true,
      engineName: body.engine || currentSettings.ui.defaultPlayEngine,
      humanColor: body.humanColor || "white",
      difficulty: body.difficulty || "medium",
    };

    if (currentGame.mode.humanColor === "black") {
      localMoves = ["e2e4"];
      currentGame.moves = [...localMoves];
      currentGame.snapshot.turn = "b";
    }

    return Promise.resolve(structuredClone(currentGame));
  }

  if (path.includes("/move") && method === "POST") {
    const body = JSON.parse(options.body || "{}");
    if (body.move) {
      localMoves.push(body.move);
    }
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
    const square =
      new URLSearchParams(path.split("?")[1] || "").get("square") || "e2";
    return Promise.resolve({
      moves: [`${square.slice(0, 2)}e4`, `${square.slice(0, 2)}e3`],
    });
  }

  if (path.includes("/recommendations")) {
    return Promise.resolve({
      book: [
        { move: "e2e4", weight: 20, percentage: 66.67, source: "polyglot" },
        { move: "d2d4", weight: 10, percentage: 33.33, source: "polyglot" },
      ],
      engine: [
        {
          engine:
            els.engineSelect?.value ||
            currentSettings.ui.defaultAnalysisEngine ||
            "stockfish",
          bestMove: "e2e4",
          cached: false,
          raw: "mock backend unavailable",
        },
      ],
    });
  }

  if (path === "/api/samples/morphy-opera.pgn") {
    return Promise.resolve(
      `[Event "Opera Game"]
[Site "Paris"]
[Date "1858.??.??"]
[Round "?"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 1-0
`
    );
  }

  if (path === "/api/replay/load" && method === "POST") {
    const parsed = parsePGN(options.body || "");
    return Promise.resolve({
      headers: parsed.headers,
      frames: [
        {
          fen: currentGame.snapshot.fen,
          moveLabels: parsed.moves,
        },
      ],
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
      turn: localMoves.length % 2 === 0 ? "w" : "b",
    },
  };
  return structuredClone(currentGame);
}

function initBoard() {
  board = new Chessboard(els.board, {
    position: FEN.start,
    assetsUrl: "https://cdn.jsdelivr.net/npm/cm-chessboard@8/assets/",
    style: {
      pieces: {
        file: "pieces/staunty.svg",
      },
    },
    extensions: [
      { class: Markers },
      { class: PromotionDialog },
    ],
  });

  board.enableMoveInput(handleMoveInput);
}

async function handleMoveInput(event) {
  switch (event.type) {
    case INPUT_EVENT_TYPE.moveInputStarted: {
      if (!currentGame?.id) return true;

      const result = await api(
        `/api/game/${currentGame.id}/legal?square=${event.square}`
      );

      board.removeMarkers(MARKER_TYPE.dot);
      (result.moves || []).forEach((move) => {
        board.addMarker(MARKER_TYPE.dot, move.slice(2, 4));
      });

      return true;
    }

    case INPUT_EVENT_TYPE.validateMoveInput: {
      const isPawn = event.piece && event.piece.endsWith("p");
      const reachesLastRank =
        event.squareTo.endsWith("8") || event.squareTo.endsWith("1");

      if (!event.promotion && isPawn && reachesLastRank) {
        board.showPromotionDialog(
          event.squareTo,
          event.piece.startsWith("w") ? COLOR.white : COLOR.black,
          async (result) => {
            if (result?.piece) {
              const promo = result.piece.slice(-1).toLowerCase();
              await playMove(
                `${event.squareFrom}${event.squareTo}${promo}`
              );
            }
          }
        );
        return false;
      }

      await playMove(
        `${event.squareFrom}${event.squareTo}${event.promotion || ""}`
      );
      return true;
    }

    default:
      return true;
  }
}

function renderEngineSelects() {
  ["engineSelect", "cfgDefaultAnalysisEngine", "cfgDefaultPlayEngine"].forEach(
    (id) => {
      els[id].innerHTML = "";
    }
  );

  Object.keys(currentSettings.engines || {}).forEach((name) => {
    ["engineSelect", "cfgDefaultAnalysisEngine", "cfgDefaultPlayEngine"].forEach(
      (id) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        els[id].appendChild(opt);
      }
    );
  });

  els.engineSelect.value =
    currentSettings.ui.defaultAnalysisEngine || "stockfish";
  els.cfgDefaultAnalysisEngine.value =
    currentSettings.ui.defaultAnalysisEngine || "stockfish";
  els.cfgDefaultPlayEngine.value =
    currentSettings.ui.defaultPlayEngine || "stockfish";
}

function optionsToText(options) {
  return Object.entries(options || {})
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function textToOptions(text) {
  const out = {};
  String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((line) => {
      const idx = line.indexOf("=");
      if (idx > 0) {
        out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
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
      path: els.cfgBookPath.value || "",
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
      defaultAnalysisEngine:
        els.cfgDefaultAnalysisEngine.value || "stockfish",
      defaultPlayEngine:
        els.cfgDefaultPlayEngine.value || "stockfish",
      showBook: els.cfgShowBook.checked,
      showAnalysis: els.cfgShowAnalysis.checked,
    },
  };
}

async function loadSettings() {
  currentSettings = await api("/api/settings");
  if (!currentSettings.theme) {
    currentSettings.theme = "light";
  }
  populateSettings();
}

async function saveSettings() {
  currentSettings = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify(collectSettings()),
  });

  if (!currentSettings.theme) {
    currentSettings.theme = "light";
  }

  populateSettings();
}

function setTheme(theme, persist = true) {
  const resolved = theme === "dark" ? "dark" : "light";
  document.body.setAttribute("data-theme", resolved);

  if (els.cfgTheme) {
    els.cfgTheme.value = resolved;
  }

  if (persist) {
    saveStoredTheme(resolved);
  }
}

function toggleTheme() {
  const next =
    document.body.getAttribute("data-theme") === "dark" ? "light" : "dark";
  setTheme(next, true);
}

function showPage(id) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.remove("active");
  });
  if (els[id]) {
    els[id].classList.add("active");
  }
}

function toggleSidebar() {
  document.getElementById("sidebarHost").classList.toggle("collapsed");
}

function initMenus() {
  document.querySelectorAll(".menu-parent").forEach((btn) => {
    btn.onclick = () => {
      const target = document.getElementById(btn.dataset.target);
      const open = target.classList.toggle("open");
      btn.classList.toggle("active", open);
      const caret = btn.querySelector(".caret");
      if (caret) {
        caret.textContent = open ? "▾" : "▸";
      }
    };
  });
}

function initViewToggles() {
  const stored = loadStoredViewState();

  document.querySelectorAll("[data-view-target]").forEach((chk) => {
    const targetId = chk.getAttribute("data-view-target");
    const target = document.getElementById(targetId);
    if (!target) return;

    if (Object.prototype.hasOwnProperty.call(stored, targetId)) {
      chk.checked = !!stored[targetId];
    }

    target.classList.toggle("hidden-panel", !chk.checked);

    chk.onchange = (e) => {
      const checked = !!e.target.checked;
      target.classList.toggle("hidden-panel", !checked);

      const nextState = loadStoredViewState();
      nextState[targetId] = checked;
      saveStoredViewState(nextState);
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
  const headerRe = /^\[(\w+)\s+"(.*)"\]$/;
  let inMoves = false;
  const moveLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(headerRe);

    if (match && !inMoves) {
      headers[match[1]] = match[2];
      continue;
    }

    if (trimmed === "" && Object.keys(headers).length > 0) {
      inMoves = true;
      continue;
    }

    if (inMoves) {
      moveLines.push(trimmed);
    }
  }

  let movesText = moveLines.join(" ");
  movesText = movesText.replace(/\{[^}]*\}/g, " ");
  movesText = movesText.replace(/\([^)]*\)/g, " ");

  let tokens = movesText.split(/\s+/).filter(Boolean);
  tokens = tokens.filter(
    (tok) =>
      !/^\d+\.+$/.test(tok) &&
      !/^\d+\.\.\.$/.test(tok) &&
      !["1-0", "0-1", "1/2-1/2", "*"].includes(tok)
  );

  return { headers, moves: tokens };
}

function renderPGNDetails(parsed) {
  const headers = parsed.headers || {};

  [
    ["pgnEvent", headers.Event || ""],
    ["pgnSite", headers.Site || ""],
    ["pgnDate", headers.Date || ""],
    ["pgnRound", headers.Round || ""],
    ["pgnWhite", headers.White || ""],
    ["pgnBlack", headers.Black || ""],
    ["pgnResult", headers.Result || ""],
    ["pgnEco", headers.ECO || ""],
  ].forEach(([id, value]) => {
    els[id].value = value;
  });

  els.pgnMovesList.innerHTML = "";

  (parsed.moves || []).forEach((move, index, arr) => {
    if (index % 2 === 0) {
      const row = document.createElement("div");
      row.className = "pgn-move-row";
      row.innerHTML = `
        <div>${Math.floor(index / 2) + 1}.</div>
        <div>${move || ""}</div>
        <div>${arr[index + 1] || ""}</div>
      `;
      els.pgnMovesList.appendChild(row);
    }
  });
}

function clearPGNDetails() {
  renderPGNDetails({ headers: {}, moves: [] });
}

async function loadReplay(rawPGN) {
  const parsed = parsePGN(rawPGN);
  renderPGNDetails(parsed);

  currentReplay = await api("/api/replay/load", {
    method: "POST",
    body: rawPGN,
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
  if (frame?.fen) {
    board.setPosition(frame.fen, true);
  }

  els.replayInfo.textContent = JSON.stringify(
    {
      index: replayIndex,
      headers: currentReplay.headers,
      frame,
    },
    null,
    2
  );
}

function validateFEN(fen) {
  const result = { ok: false, error: "" };
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

  let whiteKings = 0;
  let blackKings = 0;

  for (const rank of ranks) {
    let count = 0;

    for (const ch of rank) {
      if (/[1-8]/.test(ch)) {
        count += Number(ch);
      } else if (/[pnbrqkPNBRQK]/.test(ch)) {
        count += 1;
        if (ch === "K") whiteKings += 1;
        if (ch === "k") blackKings += 1;
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

  if (whiteKings !== 1 || blackKings !== 1) {
    result.error =
      "FEN must contain exactly one white king and one black king.";
    return result;
  }

  if (!/^[wb]$/.test(side)) {
    result.error = "Side-to-move field must be w or b.";
    return result;
  }

  if (!(castling === "-" || /^[KQkq]+$/.test(castling))) {
    result.error =
      "Castling field must be - or a combination of KQkq.";
    return result;
  }

  if (!(ep === "-" || /^[a-h][36]$/.test(ep))) {
    result.error =
      "En-passant field must be - or a square like e3 or d6.";
    return result;
  }

  if (!/^\d+$/.test(halfmove)) {
    result.error =
      "Halfmove clock must be a non-negative integer.";
    return result;
  }

  if (!/^\d+$/.test(fullmove) || Number(fullmove) < 1) {
    result.error =
      "Fullmove number must be an integer >= 1.";
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
    els.fenLoadBtn.disabled = false;
    els.fenError.classList.add("hidden");
  } else {
    els.fenValidationHint.classList.add("error");
    if (els.fenInput.value.trim()) {
      els.fenInput.classList.add("invalid");
    }
    els.fenLoadBtn.disabled = true;
  }
}

async function loadFENIntoBoard(fen) {
  currentGame = await api("/api/game/new", {
    method: "POST",
    body: JSON.stringify({ fen }),
  });

  // Fall back to local state if backend doesn't echo the FEN
  if (!currentGame.snapshot?.fen || currentGame.snapshot.fen === FEN.start) {
    currentGame.snapshot = {
      ...currentGame.snapshot,
      fen,
      turn: fen.includes(" b ") ? "b" : "w",
      status: "in_progress",
    };
  }

  currentGame.moves = [];
  board.setPosition(fen, true);
  renderSession(currentGame);

  els.recommendations.textContent =
    "FEN loaded. Recommendations will use backend if available.";

  await loadRecommendations();
}

async function playMove(move) {
  currentGame = await api(`/api/game/${currentGame.id}/move`, {
    method: "POST",
    body: JSON.stringify({ move }),
  });

  renderSession(currentGame);
  await loadRecommendations();
}

async function newGame(mode = "pvp") {
  if (mode === "engine") {
    return newVsEngine();
  }

  currentGame = await api("/api/game/new", { method: "POST" });
  els.currentModeBadge.textContent =
    mode === "analysis" ? "Game Analysis" : "Player vs Player";

  currentReplay = null;
  replayIndex = 0;

  renderSession(currentGame);
  clearPGNDetails();
  await loadRecommendations();
  showPage("pageMain");
}

async function newVsEngine() {
  currentGame = await api("/api/game/new-vs-engine", {
    method: "POST",
    body: JSON.stringify({
      engine: els.engineSelect.value,
      difficulty: els.difficultySelect.value,
      humanColor: els.humanColorSelect.value,
    }),
  });

  els.currentModeBadge.textContent = "Player vs Engine";
  currentReplay = null;
  replayIndex = 0;

  renderSession(currentGame);
  clearPGNDetails();
  await loadRecommendations();
  showPage("pageMain");
}

async function loadRecommendations() {
  if (!currentGame?.id) return;

  const panel = await api(
    `/api/game/${currentGame.id}/recommendations?engine=${encodeURIComponent(
      els.engineSelect.value || ""
    )}&difficulty=${encodeURIComponent(
      els.difficultySelect.value || ""
    )}&topN=${encodeURIComponent(
      parseInt(els.topNInput.value || "5", 10)
    )}`
  );

  const lines = ["Book"];

  if (!panel.book?.length) {
    lines.push("  - no book suggestions");
  } else {
    panel.book.forEach((item) => {
      lines.push(
        `  - ${item.move} | weight=${item.weight} | ${Number(
          item.percentage
        ).toFixed(2)}%`
      );
    });
  }

  lines.push("");
  lines.push("Engine");

  if (!panel.engine?.length) {
    lines.push("  - no engine suggestion");
  } else {
    panel.engine.forEach((item) => {
      let line = `  - ${item.engine}: ${item.bestMove || "(no move)"}`;
      if (item.cached) {
        line += " [cached]";
      }
      lines.push(line);
      if (item.raw) {
        lines.push(`    raw: ${item.raw}`);
      }
    });
  }

  els.recommendations.textContent = lines.join("\n");
  els.analysis.textContent = panel.engine?.length
    ? JSON.stringify(panel.engine, null, 2)
    : "No engine analysis.";
}

function renderSession(session) {
  currentGame = session;
  board.setPosition(session.snapshot?.fen || FEN.start, true);

  els.moves.innerHTML = "";
  (session.moves || []).forEach((move) => {
    const li = document.createElement("li");
    li.textContent = move;
    els.moves.appendChild(li);
  });

  els.gameInfo.textContent = JSON.stringify(
    {
      id: session.id,
      fen: session.snapshot?.fen,
      turn: session.snapshot?.turn,
      status: session.snapshot?.status,
      mode: session.mode,
      backend: backendAvailable ? "connected" : "mock",
    },
    null,
    2
  );
}

function bindEvents() {
  els.sidebarToggle.onclick = toggleSidebar;
  els.menuToggleTheme.onclick = toggleTheme;
  els.menuSettings.onclick = () => showPage("pageSettings");
  els.menuAbout.onclick = () => showPage("pageAbout");
  els.aboutBackBtn.onclick = () => showPage("pageMain");
  els.backToBoardBtn.onclick = () => showPage("pageMain");

  els.menuNewPvP.onclick = () => newGame("pvp");
  els.menuNewAnalysis.onclick = () => newGame("analysis");
  els.menuNewVsEngine.onclick = () => newVsEngine();

  els.newGameBtn.onclick = () => newGame("pvp");

  els.undoBtn.onclick = async () => {
    currentGame = await api(`/api/game/${currentGame.id}/undo`, {
      method: "POST",
    });
    renderSession(currentGame);
    await loadRecommendations();
  };

  els.redoBtn.onclick = async () => {
    currentGame = await api(`/api/game/${currentGame.id}/redo`, {
      method: "POST",
    });
    renderSession(currentGame);
    await loadRecommendations();
  };

  els.recommendBtn.onclick = () => loadRecommendations();

  els.engineMoveBtn.onclick = async () => {
    currentGame = await api(`/api/game/${currentGame.id}/engine-move`, {
      method: "POST",
    });
    renderSession(currentGame);
    await loadRecommendations();
  };

  els.settingsReloadBtn.onclick = () => loadSettings();
  els.saveSettingsBtn.onclick = () => saveSettings();

  els.cfgTheme.onchange = () => {
    setTheme(els.cfgTheme.value, true);
  };

  els.replayPrevBtn.onclick = () => {
    if (replayIndex > 0) {
      replayIndex -= 1;
      renderReplayFrame();
    }
  };

  els.replayNextBtn.onclick = () => {
    if (currentReplay?.frames && replayIndex < currentReplay.frames.length - 1) {
      replayIndex += 1;
      renderReplayFrame();
    }
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

  els.fenLoadBtn.onclick = async () => {
  const fen = els.fenInput.value.trim();
  const check = validateFEN(fen);
  updateFENValidationUI();

  if (!check.ok) {
    els.fenError.textContent = check.error;
    els.fenError.classList.remove("hidden");
    return;
  }

  els.fenError.classList.add("hidden");
  await loadFENIntoBoard(fen);   // was: loadFENIntoBoard(fen)
  closeDialog("fenDialog");
};

  els.fenResetBtn.onclick = () => {
    els.fenInput.value = START_FEN;
    els.fenError.classList.add("hidden");
    updateFENValidationUI();
  };

  els.pgnFileInput.onchange = () => {
    selectedPGNFile = els.pgnFileInput.files?.[0] || null;
    els.pgnFileName.textContent = selectedPGNFile
      ? `${selectedPGNFile.name} (${Math.max(
          1,
          Math.round(selectedPGNFile.size / 1024)
        )} KB)`
      : "No file selected.";
  };

  els.pgnFileLoadBtn.onclick = async () => {
    if (!selectedPGNFile) {
      alert("No PGN file selected.");
      return;
    }

    const text = await selectedPGNFile.text();
    els.pgnTextInput.value = text;
    await loadReplay(text);
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
  if (storedTheme) {
    setTheme(storedTheme, false);
  }

  initBoard();
  initMenus();
  initViewToggles();
  bindEvents();

  await loadSettings();

  if (!storedTheme && currentSettings?.theme) {
    setTheme(currentSettings.theme, false);
  }

  await newGame("pvp");
}

main();
