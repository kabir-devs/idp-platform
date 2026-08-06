const STEP_LABELS = {
  namespace: "Provision namespace",
  build: "Build container image",
  deploy: "Deploy application",
  ingress: "Configure ingress",
  monitoring: "Generate monitoring",
  dashboard: "Create dashboards",
};

const state = {
  deployments: [],
  activeId: null,
  activeStream: null,
  expandedSteps: new Set(),
};

const el = (id) => document.getElementById(id);

function fmtTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function shortRepo(repo) {
  return repo.replace(/^https?:\/\//, "").replace(/\.git$/, "");
}

// ---------- Sidebar ----------

function renderSidebar() {
  const list = el("deployment-list");
  if (state.deployments.length === 0) {
    list.innerHTML = `<p class="sidebar-empty">Nothing shipped yet.</p>`;
    return;
  }
  list.innerHTML = "";
  for (const d of state.deployments) {
    const item = document.createElement("div");
    item.className = "deployment-item" + (d.id === state.activeId ? " active" : "");
    item.innerHTML = `
      <span class="dot ${d.status}"></span>
      <div class="deployment-item-text">
        <div class="name">${shortRepo(d.repo)}</div>
        <div class="meta">${d.environment}</div>
      </div>
    `;
    item.addEventListener("click", () => selectDeployment(d.id));
    list.appendChild(item);
  }
}

// ---------- Form ----------

function showForm() {
  el("empty-state").classList.add("hidden");
  el("detail-panel").classList.add("hidden");
  el("form-panel").classList.remove("hidden");
}

function showEmpty() {
  el("form-panel").classList.add("hidden");
  el("detail-panel").classList.add("hidden");
  el("empty-state").classList.remove("hidden");
}

el("new-btn").addEventListener("click", showForm);
el("empty-new-btn").addEventListener("click", showForm);
el("cancel-form-btn").addEventListener("click", () => {
  if (state.activeId) selectDeployment(state.activeId);
  else showEmpty();
});

el("deploy-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const payload = {
    repo: form.get("repo").trim(),
    language: form.get("language"),
    environment: form.get("environment"),
  };

  const res = await fetch("/api/deployments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "request failed" }));
    alert(err.error || "Could not submit deployment");
    return;
  }

  const deployment = await res.json();
  e.target.reset();
  state.expandedSteps = new Set(["namespace"]);
  await refreshList();
  selectDeployment(deployment.id);
});

// ---------- Detail / rail ----------

function statusLabel(status) {
  return status;
}

function renderDetail(deployment) {
  el("detail-eyebrow").textContent = deployment.environment;
  el("detail-repo").textContent = shortRepo(deployment.repo);

  const badge = el("detail-status");
  badge.textContent = statusLabel(deployment.status);
  badge.className = "status-badge " + deployment.status;

  renderChips(deployment);
  renderRail(deployment);
}

function renderChips(deployment) {
  const r = deployment.resources || {};
  const chips = [];
  if (r.namespace) chips.push(["namespace", r.namespace]);
  if (r.image) chips.push(["image", r.image]);
  if (r.replicas) chips.push(["replicas", r.replicas]);
  if (r.ingressHost) chips.push(["host", r.ingressHost]);
  if (r.dashboardUrl) chips.push(["dashboard", r.dashboardUrl]);

  const container = el("resource-chips");
  container.innerHTML = chips
    .map(([label, value]) => `<span class="chip">${label}: <b>${value}</b></span>`)
    .join("");
}

function renderRail(deployment) {
  const rail = el("rail");
  rail.innerHTML = "";

  deployment.steps.forEach((step, idx) => {
    const isLast = idx === deployment.steps.length - 1;
    const expanded =
      state.expandedSteps.has(step.id) || step.status === "running";

    const stepEl = document.createElement("div");
    stepEl.className = "step";

    const filled = step.status === "success" || step.status === "failed";

    stepEl.innerHTML = `
      <div class="step-node-col">
        <div class="step-node ${step.status}"></div>
        ${!isLast ? `<div class="step-connector ${filled ? "filled" : ""}"></div>` : ""}
      </div>
      <div class="step-body">
        <div class="step-head" data-step="${step.id}">
          <span class="step-name">${step.name || STEP_LABELS[step.id]}</span>
          <span class="step-time">${
            step.startedAt
              ? fmtTime(step.startedAt) + (step.finishedAt ? " – " + fmtTime(step.finishedAt) : "")
              : ""
          }</span>
        </div>
        <div class="step-console ${expanded ? "" : "hidden"}" data-console="${step.id}">${step.logs
          .map((l) => `<div class="log-line">${escapeHtml(l)}</div>`)
          .join("")}</div>
      </div>
    `;

    rail.appendChild(stepEl);
  });

  rail.querySelectorAll(".step-head").forEach((h) => {
    h.addEventListener("click", () => {
      const id = h.dataset.step;
      if (state.expandedSteps.has(id)) state.expandedSteps.delete(id);
      else state.expandedSteps.add(id);
      const consoleEl = rail.querySelector(`[data-console="${id}"]`);
      consoleEl.classList.toggle("hidden");
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Data flow ----------

async function refreshList() {
  const res = await fetch("/api/deployments");
  state.deployments = await res.json();
  renderSidebar();
}

function selectDeployment(id) {
  state.activeId = id;
  if (state.activeStream) {
    state.activeStream.close();
    state.activeStream = null;
  }

  el("empty-state").classList.add("hidden");
  el("form-panel").classList.add("hidden");
  el("detail-panel").classList.remove("hidden");
  renderSidebar();

  const stream = new EventSource(`/api/deployments/${id}/stream`);
  state.activeStream = stream;

  let current = state.deployments.find((d) => d.id === id) || null;

  stream.onmessage = (evt) => {
    const payload = JSON.parse(evt.data);

    if (payload.type === "deployment-update" && payload.deployment) {
      current = payload.deployment;
      const idx = state.deployments.findIndex((d) => d.id === id);
      if (idx >= 0) state.deployments[idx] = current;
      else state.deployments.unshift(current);
      renderDetail(current);
      renderSidebar();
    }

    if (payload.type === "step-update" && payload.step && current) {
      const idx = current.steps.findIndex((s) => s.id === payload.step.id);
      if (idx >= 0) current.steps[idx] = payload.step;
      renderDetail(current);
      renderSidebar();
    }
  };
}

refreshList();

