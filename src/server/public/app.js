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

const filterState = JSON.parse(localStorage.getItem("cc:activity-filters") || "{}");
function persistFilters() {
  localStorage.setItem("cc:activity-filters", JSON.stringify(filterState));
}

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
  const container = h("div", {});

  const projectSel = h("select", {
    onchange: (e) => { filterState.project = e.target.value || undefined; persistFilters(); reloadActivity(); },
  }, h("option", { value: "" }, "all projects"));

  const statusSel = h("select", {
    onchange: (e) => { filterState.status = e.target.value || undefined; persistFilters(); reloadActivity(); },
  },
    h("option", { value: "" }, "all statuses"),
    ...["success", "failure", "timeout", "running", "interrupted",
        "skipped_preflight", "skipped_overlap", "config_error", "abandoned"]
      .map((s) => h("option", { value: s, selected: filterState.status === s }, s))
  );

  const clearBtn = h("button", {
    class: "btn",
    onclick: () => {
      Object.keys(filterState).forEach((k) => delete filterState[k]);
      persistFilters();
      projectSel.value = "";
      statusSel.value = "";
      reloadActivity();
    },
  }, "Clear");

  const projects = await api.get("/api/projects").catch(() => []);
  for (const p of projects) {
    const opt = h("option", { value: p.name, selected: filterState.project === p.name }, p.name);
    projectSel.append(opt);
  }

  container.append(h("div", { class: "filters" }, projectSel, statusSel, clearBtn));

  const table = h("table", { class: "runs" });
  const tbody = h("tbody");
  table.append(
    h("thead", {}, h("tr", {},
      h("th", {}, "time"),
      h("th", {}, "project/job"),
      h("th", {}, "status"),
      h("th", {}, "duration"),
      h("th", {}, "cost"),
      h("th", {}, "")
    )),
    tbody
  );
  container.append(table);

  async function reloadActivity() {
    tbody.replaceChildren();
    const q = new URLSearchParams();
    if (filterState.project) q.set("project", filterState.project);
    if (filterState.status) q.set("status", filterState.status);
    q.set("limit", "100");
    const data = await api.get("/api/runs?" + q.toString()).catch(() => ({ runs: [] }));
    for (const r of data.runs) {
      tbody.append(rowFor(r, reloadActivity));
    }
    if (data.runs.length === 0) {
      tbody.append(h("tr", {}, h("td", { colspan: 6, style: "padding:12px;color:#888;text-align:center" }, "No runs.")));
    }
  }

  function rowFor(r, reload) {
    const actions = r.status === "running"
      ? h("button", {
          class: "btn btn-danger",
          onclick: async (e) => {
            e.stopPropagation();
            try { await api.post(`/api/runs/${r.id}/stop`); }
            catch (err) { alert(err.message); }
            reload();
          },
        }, "■ stop")
      : h("span", { style: "color:#888" }, "→");

    return h("tr", { onclick: () => { location.hash = `#/${state.view}?run=${r.id}`; } },
      h("td", {}, fmtTime(r.started_at)),
      h("td", {}, `${r.project}/${r.job}`),
      h("td", {}, statusPill(r.status)),
      h("td", {}, fmtDuration(r.duration_ms)),
      h("td", {}, fmtCost(r.cost_usd)),
      h("td", {}, actions),
    );
  }

  await reloadActivity();

  if (!renderActivity._interval) {
    renderActivity._interval = setInterval(() => {
      if (document.visibilityState === "visible" && state.view === "activity") {
        reloadActivity();
      }
    }, 5000);
  }

  return container;
}

async function renderConfig() {
  const container = h("div", { class: "config-layout" });
  const tree = h("div", { class: "config-tree" });
  const detail = h("div", { class: "config-detail" });
  container.append(tree, detail);

  const projects = await api.get("/api/projects");
  const selected = localStorage.getItem("cc:config-selected-job");

  async function renderTree() {
    tree.replaceChildren();
    for (const p of projects) {
      const projectNode = h("div", { class: "project" },
        h("div", { class: "label" }, `▾ ${p.name}`)
      );
      const jobs = await api.get(`/api/projects/${p.name}/jobs`).catch(() => []);
      for (const j of jobs) {
        const key = `${p.name}/${j.name}`;
        const cls = "job" + (key === selected ? " selected" : "");
        projectNode.append(
          h("div", { class: cls, onclick: () => openJob(p.name, j.name) },
            j.name,
            h("div", { class: "schedule" }, `${j.schedule} · ${j.enabled ? "enabled" : "disabled"}`)
          )
        );
      }
      tree.append(projectNode);
    }
  }

  async function reloadTree() { await renderTree(); }

  async function openJob(project, name) {
    localStorage.setItem("cc:config-selected-job", `${project}/${name}`);
    const detailData = await api.get(`/api/projects/${project}/jobs/${name}`);
    detail.replaceChildren(jobDetailNode(detailData, async () => {
      // After an action (enable/disable), refetch and re-render
      const fresh = await api.get(`/api/projects/${project}/jobs/${name}`);
      detail.replaceChildren(jobDetailNode(fresh, () => openJob(project, name)));
      await renderTree();
    }));
  }

  await renderTree();
  if (selected) {
    const [p, j] = selected.split("/");
    if (p && j && projects.some((x) => x.name === p)) {
      openJob(p, j).catch(() => { /* job may have been removed */ });
    }
  }

  return container;
}

function jobDetailNode(job, onChange) {
  const actions = h("div", { style: "margin:12px 0" });
  if (job.enabled) {
    actions.append(h("button", {
      class: "btn",
      onclick: async () => {
        try { await api.post(`/api/projects/${job.project}/jobs/${job.name}/disable`); }
        catch (e) { alert(e.message); return; }
        onChange();
      },
    }, "Disable"));
  } else {
    actions.append(h("button", {
      class: "btn",
      onclick: async () => {
        try { await api.post(`/api/projects/${job.project}/jobs/${job.name}/enable`); }
        catch (e) { alert(e.message); return; }
        onChange();
      },
    }, "Enable"));
  }

  const recent = h("div", {});
  recent.append(h("h4", {}, "Recent runs"));
  api.get(`/api/runs?project=${encodeURIComponent(job.project)}&job=${encodeURIComponent(job.name)}&limit=10`)
    .then((data) => {
      recent.replaceChildren(h("h4", {}, "Recent runs"));
      if (data.runs.length === 0) {
        recent.append(h("div", { style: "color:#888" }, "(none yet)"));
        return;
      }
      for (const r of data.runs) {
        recent.append(h("div", {
          onclick: () => { location.hash = `#/config?run=${r.id}`; },
          style: "padding:4px 0;cursor:pointer",
        },
          fmtTime(r.started_at), " ",
          statusPill(r.status), " ",
          fmtDuration(r.duration_ms), " ",
          fmtCost(r.cost_usd)
        ));
      }
    })
    .catch(() => {
      recent.replaceChildren(h("h4", {}, "Recent runs"), h("div", { style: "color:#f66" }, "(failed to load)"));
    });

  return h("div", {},
    h("h3", {}, `${job.project}/${job.name}`),
    job.description ? h("p", { style: "color:#aaa" }, job.description) : null,
    h("div", {}, "Schedule: ", h("code", {}, job.schedule)),
    h("div", {}, "Enabled: ", job.enabled ? "✅" : "⊘"),
    actions,
    h("h4", {}, "YAML"),
    h("pre", {}, job.yaml),
    recent,
  );
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
