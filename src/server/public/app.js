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

let runDetailUnsubscribe = null;

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

function fmtOffset(ts, start) {
  const d = ts - start;
  if (d < 1000) return `+${d}ms`;
  return `+${(d / 1000).toFixed(1)}s`;
}

function collapsibleJson(obj, maxPreview = 160) {
  const str = JSON.stringify(obj, null, 2);
  if (str.length <= maxPreview) {
    return h("pre", { class: "payload" }, str);
  }
  const details = h("details", { class: "payload" });
  details.append(
    h("summary", {}, `{…} ${str.length} chars`),
    h("pre", {}, str)
  );
  return details;
}

function renderTextBlock(block) {
  return h("div", { class: "block block-text" }, block.text ?? "");
}

function renderThinkingBlock(block) {
  const body = h("div", { class: "thinking-body" }, block.thinking ?? "");
  const details = h("details", { class: "block block-thinking" });
  details.append(h("summary", {}, "💭 thinking"), body);
  return details;
}

function renderToolUseBlock(block) {
  const name = block.name ?? "(tool)";
  const input = block.input ?? {};
  const wrap = h("details", { class: "block block-tool-use", open: true });
  wrap.append(
    h("summary", {},
      h("span", { class: "tool-name" }, `⚙ ${name}`),
      h("span", { class: "tool-id" }, block.id ? ` · ${block.id.slice(-8)}` : "")
    ),
    h("pre", { class: "tool-input" }, JSON.stringify(input, null, 2))
  );
  return wrap;
}

function renderToolResultBlock(block) {
  const content = block.content;
  const body = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((c) => c.type === "text" ? c.text : JSON.stringify(c)).join("\n")
      : JSON.stringify(content, null, 2);
  const wrap = h("details", { class: "block block-tool-result" + (block.is_error ? " error" : "") });
  const label = block.is_error ? "↩ tool error" : "↩ tool result";
  wrap.append(
    h("summary", {},
      label,
      block.tool_use_id ? h("span", { class: "tool-id" }, ` · ${String(block.tool_use_id).slice(-8)}`) : null
    ),
    h("pre", {}, body)
  );
  return wrap;
}

function renderAssistantMessage(payload) {
  const blocks = payload.message?.content ?? [];
  const wrap = h("div", { class: "event assistant-event" });
  const label = h("div", { class: "event-label" }, "assistant");
  wrap.append(label);
  for (const b of blocks) {
    if (b.type === "text") wrap.append(renderTextBlock(b));
    else if (b.type === "tool_use") wrap.append(renderToolUseBlock(b));
    else if (b.type === "thinking") wrap.append(renderThinkingBlock(b));
    else wrap.append(collapsibleJson(b));
  }
  return wrap;
}

function renderUserMessage(payload) {
  const blocks = payload.message?.content ?? [];
  const wrap = h("div", { class: "event user-event" });
  const label = h("div", { class: "event-label" }, "user");
  wrap.append(label);
  for (const b of blocks) {
    if (b.type === "tool_result") wrap.append(renderToolResultBlock(b));
    else if (b.type === "text") wrap.append(renderTextBlock(b));
    else wrap.append(collapsibleJson(b));
  }
  return wrap;
}

function renderSystemEvent(payload) {
  const subtype = payload.subtype ?? "";
  const model = payload.model ?? "";
  const parts = [subtype];
  if (model) parts.push(`model: ${model}`);
  return h("div", { class: "event system-event" }, `▸ system · ${parts.filter(Boolean).join(" · ")}`);
}

function renderResultEvent(payload) {
  const ok = payload.subtype === "success";
  const cls = "event result-event" + (ok ? " ok" : " err");
  const costPart = typeof payload.total_cost_usd === "number"
    ? ` · $${payload.total_cost_usd.toFixed(4)}` : "";
  const turnPart = typeof payload.num_turns === "number" ? ` · ${payload.num_turns} turns` : "";
  return h("div", { class: cls }, `▸ result · ${payload.subtype ?? ""}${costPart}${turnPart}`);
}

function renderSummaryCard(payload) {
  const ok = payload.subtype === "success";
  const cost = typeof payload.total_cost_usd === "number"
    ? `$${payload.total_cost_usd.toFixed(4)}` : "—";
  const dur = typeof payload.duration_ms === "number"
    ? fmtDuration(payload.duration_ms) : "—";
  const turns = typeof payload.num_turns === "number" ? payload.num_turns : "—";
  return h("div", { class: "summary-card" + (ok ? " ok" : " err") },
    h("div", { class: "summary-head" },
      h("strong", {}, ok ? "✔ success" : "✘ " + (payload.subtype ?? "error")),
      h("span", { class: "summary-meta" }, ` · ${dur} · ${turns} turns · ${cost}`)
    ),
    payload.result ? h("div", { class: "summary-result" }, payload.result) : null
  );
}

function renderControlEvent(e, start) {
  const tsLabel = h("span", { class: "ts" }, fmtOffset(e.ts, start));
  const seqLabel = h("span", { class: "seq" }, `#${e.seq}`);
  const type = e.type;
  if (type === "start") {
    return h("div", { class: "event control-event start" },
      seqLabel, tsLabel, " ", h("span", { class: "etype" }, "start"));
  }
  if (type === "preflight") {
    const p = e.payload ?? {};
    const ok = p.proceed ? "✓" : "✗";
    const tail = h("span", { class: "etail" },
      ` exit=${p.exitCode ?? "—"} · ${p.durationMs ?? 0}ms${p.timedOut ? " · TIMED OUT" : ""}`);
    const body = h("div", { class: "event control-event preflight" },
      seqLabel, tsLabel, " ", h("span", { class: "etype" }, `${ok} preflight`), tail);
    if (p.stdout || p.stderr) {
      const d = h("details", {});
      d.append(h("summary", {}, "output"), h("pre", {}, (p.stdout || "") + (p.stderr ? "\n[stderr] " + p.stderr : "")));
      body.append(d);
    }
    return body;
  }
  if (type === "prompt_cmd") {
    const p = e.payload ?? {};
    return h("div", { class: "event control-event prompt-cmd" },
      seqLabel, tsLabel, " ",
      h("span", { class: "etype" }, "prompt_cmd"),
      " → ",
      h("code", {}, p.prompt ?? ""));
  }
  if (type === "claude_stderr") {
    const line = e.payload?.line ?? "";
    return h("div", { class: "event stderr-event" },
      seqLabel, tsLabel, " ",
      h("span", { class: "etype" }, "stderr"),
      " ",
      h("code", {}, line));
  }
  if (type === "end") {
    const p = e.payload ?? {};
    return h("div", { class: "event control-event end" },
      seqLabel, tsLabel, " ",
      h("span", { class: "etype" }, "end"),
      h("span", { class: "etail" }, ` · ${p.status ?? ""}`));
  }
  return null;
}

function renderEvent(e, start) {
  if (e.type === "claude_stdout") {
    const p = e.payload;
    // Stream-json shape: { type: "system" | "assistant" | "user" | "result", ... }
    if (p && typeof p === "object" && typeof p.type === "string") {
      switch (p.type) {
        case "system":    return wrapEventMeta(renderSystemEvent(p), e, start);
        case "assistant": return wrapEventMeta(renderAssistantMessage(p), e, start);
        case "user":      return wrapEventMeta(renderUserMessage(p), e, start);
        case "result":    return wrapEventMeta(renderResultEvent(p), e, start);
      }
    }
    // Legacy/fallback: { line: "raw string" }
    if (p && typeof p === "object" && typeof p.line === "string") {
      return h("div", { class: "event legacy-stdout" },
        h("span", { class: "seq" }, `#${e.seq}`),
        h("span", { class: "ts" }, fmtOffset(e.ts, start)),
        " ",
        h("code", {}, p.line));
    }
    // Unknown stdout payload: show as collapsible JSON
    const wrap = h("div", { class: "event" },
      h("span", { class: "seq" }, `#${e.seq}`),
      h("span", { class: "ts" }, fmtOffset(e.ts, start)),
      " ", h("span", { class: "etype" }, "stdout"));
    wrap.append(collapsibleJson(p));
    return wrap;
  }
  return renderControlEvent(e, start);
}

function wrapEventMeta(child, e, start) {
  const meta = h("div", { class: "event-meta" },
    h("span", { class: "seq" }, `#${e.seq}`),
    h("span", { class: "ts" }, fmtOffset(e.ts, start))
  );
  child.prepend(meta);
  return child;
}

async function renderRunDetail() {
  const pane = document.getElementById("run-detail");
  if (runDetailUnsubscribe) { runDetailUnsubscribe(); runDetailUnsubscribe = null; }

  if (state.selectedRunId == null) {
    pane.hidden = true;
    pane.replaceChildren();
    return;
  }
  pane.hidden = false;
  pane.replaceChildren(h("div", {}, "Loading…"));

  let run;
  try {
    run = await api.get(`/api/runs/${state.selectedRunId}`);
  } catch (e) {
    pane.replaceChildren(h("div", { style: "color:#f66" }, `Failed: ${e.message}`));
    return;
  }

  const header = h("div", {},
    h("button", { class: "close", onclick: () => { location.hash = `#/${state.view}`; } }, "×"),
    h("h3", {}, `${run.project}/${run.job}`),
    h("div", {},
      statusPill(run.status), " · started ", fmtTime(run.started_at),
      " · ", fmtDuration(run.duration_ms),
      run.cost_usd != null ? ` · ${fmtCost(run.cost_usd)}` : ""
    )
  );

  const summaryNode = h("div", { class: "run-summary" });
  const eventsNode = h("div", { class: "events" });
  const runStart = run.started_at;

  const appendEvent = (e) => {
    const node = renderEvent(e, runStart);
    if (node) eventsNode.append(node);
    // Final result event populates the top summary card.
    if (e.type === "claude_stdout" && e.payload && typeof e.payload === "object"
        && e.payload.type === "result") {
      summaryNode.replaceChildren(renderSummaryCard(e.payload));
    }
    // Live status update when result arrives
    if (e.type === "end" && e.payload?.status) {
      const pill = header.querySelector(".status-pill");
      if (pill) { pill.className = `status-pill ${e.payload.status}`; pill.textContent = e.payload.status; }
    }
  };
  for (const e of run.events) appendEvent(e);

  const actions = h("div", { style: "margin:12px 0" });
  if (run.status === "running") {
    actions.append(h("button", {
      class: "btn btn-danger",
      onclick: async () => {
        try { await api.post(`/api/runs/${run.id}/stop`); }
        catch (e) { alert(e.message); }
      },
    }, "■ stop"));
  }

  pane.replaceChildren(header, summaryNode, actions, eventsNode);

  if (run.status === "running") {
    let knownSeq = run.events.length > 0 ? run.events[run.events.length - 1].seq : -1;
    runDetailUnsubscribe = api.subscribe(run.id, {
      onEvent: (e) => {
        if (e.seq <= knownSeq) return;
        knownSeq = e.seq;
        appendEvent(e);
        pane.scrollTop = pane.scrollHeight;
      },
      onStatus: (s) => {
        const pill = header.querySelector(".status-pill");
        if (pill) { pill.className = `status-pill ${s.status}`; pill.textContent = s.status; }
      },
      onEnd: () => {
        api.get(`/api/runs/${run.id}`).then(() => {
          renderRunDetail();
        }).catch(() => {});
      },
      onError: () => { /* EventSource auto-reconnects */ },
    });
  }
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
