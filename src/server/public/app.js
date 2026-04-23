// claude-cron dashboard — vanilla JS, module

const api = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`${r.status}: ${(await r.json().catch(() => ({}))).error ?? r.statusText}`);
    return r.json();
  },
  async post(path) {
    const r = await fetch(path, { method: "POST" });
    if (!r.ok) throw new Error(`${r.status}: ${(await r.json().catch(() => ({}))).error ?? r.statusText}`);
    return r.json();
  },
  subscribe(runId, handlers) {
    const es = new EventSource(`/api/runs/${runId}/stream`);
    es.addEventListener("event", (e) => handlers.onEvent(JSON.parse(e.data)));
    es.addEventListener("status", (e) => handlers.onStatus(JSON.parse(e.data)));
    es.addEventListener("end", (e) => { handlers.onEnd(JSON.parse(e.data)); es.close(); });
    es.onerror = () => handlers.onError?.();
    return () => es.close();
  },
};

const state = {
  view: localStorage.getItem("cc:view") || "activity",
  selectedRunId: null,
};

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v === false || v == null) { /* skip */ }
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    el.append(typeof c === "string" || typeof c === "number" ? String(c) : c);
  }
  return el;
}

function fmtTime(ms) { return new Date(ms).toLocaleTimeString(); }
function fmtDuration(ms) { return ms == null ? "—" : ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`; }
function fmtCost(c) { return c == null ? "—" : `$${c.toFixed(4)}`; }
function statusPill(s) { return h("span", { class: `status-pill ${s}` }, s); }

function setView(view) {
  if (view !== "activity" && view !== "config") view = "activity";
  state.view = view;
  localStorage.setItem("cc:view", view);
  document.querySelectorAll("#topbar .view-toggle button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
  });
}

function parseHash() {
  const hash = location.hash || "#/activity";
  const m = hash.match(/^#\/(activity|config)(?:\?run=(\d+))?$/);
  if (m) {
    const view = m[1];
    const runId = m[2] ? Number(m[2]) : null;
    if (view !== state.view) setView(view);
    state.selectedRunId = runId;
  }
}

async function refreshStatus() {
  try {
    const s = await api.get("/api/status");
    const dot = document.getElementById("status-dot");
    const text = document.getElementById("status-text");
    const cls = s.healthy ? "ok" : (s.problems.length > 2 ? "err" : "warn");
    dot.className = cls;
    text.textContent = s.healthy ? "healthy" : `${s.problems.length} issue${s.problems.length === 1 ? "" : "s"}`;
  } catch { /* ignore */ }
}

async function render() {
  const main = document.getElementById("main");
  main.replaceChildren();
  if (state.view === "activity") {
    main.append(await renderActivity());
  } else {
    main.append(await renderConfig());
  }
  renderRunDetail();
}

async function renderActivity() {
  return h("div", { class: "placeholder" }, "Activity view — stub");
}

async function renderConfig() {
  return h("div", { class: "placeholder" }, "Config view — stub");
}

function renderRunDetail() {
  const pane = document.getElementById("run-detail");
  if (state.selectedRunId == null) {
    pane.hidden = true;
    pane.replaceChildren();
    return;
  }
  pane.hidden = false;
  pane.replaceChildren(h("div", {}, "Run detail — stub"));
}

function init() {
  document.querySelectorAll("#topbar .view-toggle button").forEach((b) => {
    b.addEventListener("click", () => { location.hash = `#/${b.dataset.view}`; });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "v" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      location.hash = `#/${state.view === "activity" ? "config" : "activity"}`;
    }
    if (e.key === "Escape" && state.selectedRunId != null) {
      location.hash = `#/${state.view}`;
    }
  });
  window.addEventListener("hashchange", () => { parseHash(); render(); });
  parseHash();
  refreshStatus();
  setInterval(refreshStatus, 10_000);
  render();
}

init();

// Exports for subsequent task files to extend:
export { api, state, h, fmtTime, fmtDuration, fmtCost, statusPill, render };
