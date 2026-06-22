const PANEL_ORDER_KEY = "veldatlas.panelOrder";

const DEFAULT_PANEL_ORDER = [
  "gameInfoPanel",
  "moveListPanel",
  "recommendationsPanel",
  "analysisPanel",
  "replayPanel",
  "pgnDetailsPanel",
];

const PANEL_LABELS = {
  gameInfoPanel: "Game information",
  moveListPanel: "Move list",
  recommendationsPanel: "Recommendations",
  analysisPanel: "Analysis",
  replayPanel: "Replay",
  pgnDetailsPanel: "PGN details",
};

function normalizeOrder(order) {
  const out = [];

  (order || []).forEach((id) => {
    if (DEFAULT_PANEL_ORDER.includes(id) && !out.includes(id)) {
      out.push(id);
    }
  });

  DEFAULT_PANEL_ORDER.forEach((id) => {
    if (!out.includes(id)) {
      out.push(id);
    }
  });

  return out;
}

export function loadPanelOrder() {
  try {
    const raw = localStorage.getItem(PANEL_ORDER_KEY);
    return normalizeOrder(raw ? JSON.parse(raw) : DEFAULT_PANEL_ORDER);
  } catch {
    return [...DEFAULT_PANEL_ORDER];
  }
}

export function savePanelOrder(order) {
  try {
    localStorage.setItem(
      PANEL_ORDER_KEY,
      JSON.stringify(normalizeOrder(order))
    );
  } catch {
    // ignore
  }
}

export function resetPanelOrder() {
  savePanelOrder(DEFAULT_PANEL_ORDER);
  return [...DEFAULT_PANEL_ORDER];
}

export function applyPanelOrder(container, order) {
  const normalized = normalizeOrder(order);

  normalized.forEach((panelId) => {
    const panel = document.getElementById(panelId);
    if (panel) {
      container.appendChild(panel);
    }
  });

  return normalized;
}

export function renderPanelOrderList({
  listElement,
  order,
  hiddenState,
  onOrderChanged,
}) {
  const normalized = normalizeOrder(order);
  listElement.innerHTML = "";

  let dragIndex = -1;

  normalized.forEach((panelId, index) => {
    const row = document.createElement("div");
    row.className = "panel-order-item";
    row.draggable = true;

    if (hiddenState?.[panelId]) {
      row.classList.add("is-hidden");
    }

    row.innerHTML = `
      <div class="panel-order-handle">☰</div>
      <div class="panel-order-labels">
        <div class="panel-order-title">${PANEL_LABELS[panelId] || panelId}</div>
        <div class="panel-order-subtitle">${hiddenState?.[panelId] ? "Hidden in view" : "Visible"}</div>
      </div>
      ${
        hiddenState?.[panelId]
          ? '<div class="panel-order-hidden-badge">hidden</div>'
          : ""
      }
    `;

    row.addEventListener("dragstart", () => {
      dragIndex = index;
      row.classList.add("dragging");
    });

    row.addEventListener("dragend", () => {
      dragIndex = -1;
      row.classList.remove("dragging");
      listElement
        .querySelectorAll(".drag-over")
        .forEach((el) => el.classList.remove("drag-over"));
    });

    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      row.classList.add("drag-over");
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });

    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");

      if (dragIndex < 0 || dragIndex === index) {
        return;
      }

      const next = [...normalized];
      const [item] = next.splice(dragIndex, 1);
      next.splice(index, 0, item);

      onOrderChanged(normalizeOrder(next));
    });

    listElement.appendChild(row);
  });
}