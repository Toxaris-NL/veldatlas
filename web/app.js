import {
  Chessboard,
  FEN,
  INPUT_EVENT_TYPE,
  COLOR
} from "https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/Chessboard.js"

import {
  Markers,
  MARKER_TYPE
} from "https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/extensions/markers/Markers.js"

import {
  PromotionDialog
} from "https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/extensions/promotion-dialog/PromotionDialog.js"

const board = new Chessboard(document.getElementById("board"), {
  position: FEN.start,
  assetsUrl: "https://cdn.jsdelivr.net/npm/cm-chessboard@8/assets/",
  style: {
    pieces: {
      file: "pieces/staunty.svg"
    }
  },
  extensions: [
    { class: Markers },
    { class: PromotionDialog }
  ]
})

let currentGame = null
let replay = null
let replayIndex = 0
let currentSettings = null

const movesEl = document.getElementById("moves")
const gameInfoEl = document.getElementById("gameInfo")
const recommendationsEl = document.getElementById("recommendations")
const replayInfoEl = document.getElementById("replayInfo")
const pgnInputEl = document.getElementById("pgnInput")
const settingsJsonEl = document.getElementById("settingsJson")
const engineSelectEl = document.getElementById("engineSelect")
const difficultySelectEl = document.getElementById("difficultySelect")
const humanColorSelectEl = document.getElementById("humanColorSelect")
const topNInputEl = document.getElementById("topNInput")

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(payload.error || response.statusText)
  }

  const ctype = response.headers.get("content-type") || ""
  if (ctype.includes("application/json")) {
    return response.json()
  }
  return response.text()
}

async function loadSettings() {
  currentSettings = await api("/api/settings")
  settingsJsonEl.value = JSON.stringify(currentSettings, null, 2)
  renderEngineSelect()
}

function renderEngineSelect() {
  engineSelectEl.innerHTML = ""
  const engines = currentSettings?.engines || {}

  Object.keys(engines).forEach(name => {
    const opt = document.createElement("option")
    opt.value = name
    opt.textContent = name
    engineSelectEl.appendChild(opt)
  })

  if (currentSettings?.ui?.defaultAnalysisEngine) {
    engineSelectEl.value = currentSettings.ui.defaultAnalysisEngine
  }
}

async function saveSettings() {
  const parsed = JSON.parse(settingsJsonEl.value)
  currentSettings = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify(parsed)
  })
  settingsJsonEl.value = JSON.stringify(currentSettings, null, 2)
  renderEngineSelect()
}

async function newGame() {
  currentGame = await api("/api/game/new", { method: "POST" })
  replay = null
  replayIndex = 0
  renderSession(currentGame)
  await loadRecommendations()
}

async function newVsEngine() {
  currentGame = await api("/api/game/new-vs-engine", {
    method: "POST",
    body: JSON.stringify({
      engine: engineSelectEl.value,
      difficulty: difficultySelectEl.value,
      humanColor: humanColorSelectEl.value
    })
  })

  replay = null
  replayIndex = 0
  renderSession(currentGame)
  await loadRecommendations()
}

function renderSession(session) {
  currentGame = session
  board.setPosition(session.snapshot?.fen || FEN.start, true)
  renderMoveList(session.moves || [])
  renderGameInfo(session)
}

function renderMoveList(moves) {
  movesEl.innerHTML = ""
  moves.forEach(move => {
    const li = document.createElement("li")
    li.textContent = move
    movesEl.appendChild(li)
  })
}

function renderGameInfo(session) {
  const snap = session.snapshot || {}
  gameInfoEl.textContent = JSON.stringify({
    id: session.id,
    fen: snap.fen,
    turn: snap.turn,
    status: snap.status,
    outcome: snap.outcome,
    method: snap.method,
    mode: session.mode
  }, null, 2)
}

async function loadRecommendations() {
  recommendationsEl.textContent = ""

  if (!currentGame?.id) {
    return
  }

  const engine = engineSelectEl.value || ""
  const difficulty = difficultySelectEl.value || ""
  const topN = parseInt(topNInputEl.value || "5", 10)

  const panel = await api(
    `/api/game/${currentGame.id}/recommendations?engine=${encodeURIComponent(engine)}&difficulty=${encodeURIComponent(difficulty)}&topN=${encodeURIComponent(topN)}`
  )

  const lines = []

  lines.push("Book")
  if (!panel.book || panel.book.length === 0) {
    lines.push("  - no book suggestions")
  } else {
    for (const item of panel.book) {
      lines.push(
        `  - ${item.move} | weight=${item.weight} | ${item.percentage.toFixed(2)}%`
      )
    }
  }

  lines.push("")
  lines.push("Engine")
  if (!panel.engine || panel.engine.length === 0) {
    lines.push("  - no engine suggestion")
  } else {
    for (const item of panel.engine) {
      let label = `  - ${item.engine}: ${item.bestMove || "(no move)"}`
      if (item.cached) {
        label += " [cached]"
      }
      lines.push(label)

      if (item.raw) {
        lines.push(`    raw: ${item.raw}`)
      }
    }
  }

  recommendationsEl.textContent = lines.join("\n")
}

async function playMove(move) {
  if (!currentGame?.id) return

  currentGame = await api(`/api/game/${currentGame.id}/move`, {
    method: "POST",
    body: JSON.stringify({ move })
  })

  renderSession(currentGame)
  await loadRecommendations()
}

async function engineMove() {
  if (!currentGame?.id) return

  currentGame = await api(`/api/game/${currentGame.id}/engine-move`, {
    method: "POST"
  })

  renderSession(currentGame)
  await loadRecommendations()
}

async function undo() {
  if (!currentGame?.id) return

  currentGame = await api(`/api/game/${currentGame.id}/undo`, {
    method: "POST"
  })

  renderSession(currentGame)
  await loadRecommendations()
}

async function redo() {
  if (!currentGame?.id) return

  currentGame = await api(`/api/game/${currentGame.id}/redo`, {
    method: "POST"
  })

  renderSession(currentGame)
  await loadRecommendations()
}

async function loadReplay(rawPGN) {
  replay = await api("/api/replay/load", {
    method: "POST",
    body: rawPGN
  })
  replayIndex = 0
  renderReplayFrame()
}

function renderReplayFrame() {
  if (!replay || !replay.frames || replay.frames.length === 0) {
    replayInfoEl.textContent = "No replay loaded."
    return
  }

  const frame = replay.frames[replayIndex]
  board.setPosition(frame.fen || FEN.start, true)
  replayInfoEl.textContent = JSON.stringify({
    index: replayIndex,
    headers: replay.headers,
    frame
  }, null, 2)

  renderMoveList(frame.moveLabels || frame.moves || [])
}

board.enableMoveInput(async (event) => {
  switch (event.type) {
    case INPUT_EVENT_TYPE.moveInputStarted: {
      if (!currentGame?.id) return true

      try {
        board.removeMarkers(MARKER_TYPE.dot)
        const result = await api(`/api/game/${currentGame.id}/legal?square=${event.square}`)

        ;(result.moves || []).forEach(move => {
          board.addMarker(MARKER_TYPE.dot, move.slice(2, 4))
        })
      } catch (err) {
        console.error(err)
      }

      return true
    }

    case INPUT_EVENT_TYPE.validateMoveInput: {
      try {
        let move = `${event.squareFrom}${event.squareTo}${event.promotion || ""}`

        const isPawn = event.piece && event.piece.endsWith("p")
        const reachesLastRank =
          event.squareTo.endsWith("8") || event.squareTo.endsWith("1")

        if (!event.promotion && isPawn && reachesLastRank) {
          board.showPromotionDialog(
            event.squareTo,
            event.piece.startsWith("w") ? COLOR.white : COLOR.black,
            async (result) => {
              if (result?.piece) {
                const pieceCode = result.piece.slice(-1).toLowerCase()
                await playMove(`${event.squareFrom}${event.squareTo}${pieceCode}`)
              }
            }
          )
          return false
        }

        await playMove(move)
        board.removeMarkers(MARKER_TYPE.dot)
        return true
      } catch (err) {
        alert(err.message)
        return false
      }
    }

    default:
      return true
  }
})

document.getElementById("newGameBtn").onclick = () => newGame().catch(showError)
document.getElementById("playVsEngineBtn").onclick = () => newVsEngine().catch(showError)
document.getElementById("undoBtn").onclick = () => undo().catch(showError)
document.getElementById("redoBtn").onclick = () => redo().catch(showError)
document.getElementById("recommendBtn").onclick = () => loadRecommendations().catch(showError)
document.getElementById("engineMoveBtn").onclick = () => engineMove().catch(showError)

document.getElementById("loadSampleBtn").onclick = async () => {
  try {
    const pgn = await api("/api/samples/morphy-opera.pgn")
    pgnInputEl.value = pgn
    await loadReplay(pgn)
  } catch (err) {
    showError(err)
  }
}

document.getElementById("loadPgnBtn").onclick = () => loadReplay(pgnInputEl.value).catch(showError)
document.getElementById("settingsBtn").onclick = () => loadSettings().catch(showError)
document.getElementById("saveSettingsBtn").onclick = () => saveSettings().catch(showError)

document.getElementById("replayPrevBtn").onclick = () => {
  if (replayIndex > 0) replayIndex--
  renderReplayFrame()
}

document.getElementById("replayNextBtn").onclick = () => {
  if (replay?.frames && replayIndex < replay.frames.length - 1) replayIndex++
  renderReplayFrame()
}

function showError(err) {
  console.error(err)
  alert(err.message || String(err))
}

await loadSettings().catch(showError)
await newGame().catch(showError)