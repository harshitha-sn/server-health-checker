/**
 * Watchtower — dashboard front-end
 * Fetches JSON from Flask, renders cards, charts (Chart.js), and auto-refresh.
 */

(function () {
  "use strict";

  const REFRESH_MS = 30000;
  const API = {
    servers: "/api/servers",
    stats: "/api/stats",
    checkAll: "/api/check-all",
    history: (id) => `/api/servers/${id}/history?limit=80`,
    checkOne: (id) => `/api/servers/${id}/check`,
    delete: (id) => `/api/servers/${id}`,
  };

  /** @type {any[]} */
  let serversCache = [];
  let chartResponse = null;
  let chartUptime = null;
  let secondsLeft = REFRESH_MS / 1000;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    wireNav();
    wireTheme();
    wireForms();
    wireActions();
    wireSearch();

    loadAll({ showGlobalLoader: true }).finally(() => {
      const el = document.getElementById("app-loader");
      if (el) el.classList.add("done");
    });

    startAutoRefresh();
  }

  function wireNav() {
    const items = document.querySelectorAll(".nav-item");
    const titles = {
      dashboard: ["Dashboard", "Live status of your endpoints"],
      targets: ["Targets", "Register and manage monitored URLs"],
      analytics: ["Analytics", "Response time and uptime trends"],
    };
    items.forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        items.forEach((b) => b.classList.toggle("active", b === btn));
        document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
        const pane = document.getElementById("view-" + view);
        if (pane) pane.classList.remove("hidden");
        const t = titles[view] || titles.dashboard;
        const pt = document.getElementById("page-title");
        const ps = document.getElementById("page-sub");
        if (pt) pt.textContent = t[0];
        if (ps) ps.textContent = t[1];
        if (view === "analytics") {
          populateChartSelect();
          refreshCharts();
        }
      });
    });
  }

  function wireTheme() {
    const stored = localStorage.getItem("watchtower-theme");
    if (stored === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
    syncThemeLabel();
    document.getElementById("btn-theme")?.addEventListener("click", () => {
      const html = document.documentElement;
      const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
      html.setAttribute("data-theme", next);
      localStorage.setItem("watchtower-theme", next);
      syncThemeLabel();
      refreshCharts();
    });
  }

  function syncThemeLabel() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    const label = document.getElementById("theme-label");
    const btn = document.getElementById("btn-theme");
    if (label) label.textContent = dark ? "Light mode" : "Dark mode";
    if (btn) btn.setAttribute("aria-pressed", dark ? "true" : "false");
  }

  function wireForms() {
    document.getElementById("form-add")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("input-name")?.value || "";
      const url = document.getElementById("input-url")?.value || "";
      if (!url.trim()) {
        notify("Please enter a URL.", "error");
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(API.servers, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, url }),
        });
        const data = await res.json();
        if (!data.ok) {
          notify(data.error || "Could not add target.", "error");
          return;
        }
        notify("Target added.", "success");
        e.target.reset();
        await loadAll({ showGlobalLoader: false });
      } catch (err) {
        notify("Network error while adding target.", "error");
      } finally {
        setLoading(false);
      }
    });
  }

  function wireActions() {
    document.getElementById("btn-refresh")?.addEventListener("click", () => {
      loadAll({ showGlobalLoader: false });
    });
    document.getElementById("btn-check-all")?.addEventListener("click", async () => {
      setLoading(true);
      try {
        const res = await fetch(API.checkAll, { method: "POST" });
        const data = await res.json();
        if (!data.ok) {
          notify(data.error || "Check failed.", "error");
          return;
        }
        notify("All targets checked.", "success");
        await loadAll({ showGlobalLoader: false });
      } catch {
        notify("Network error during check-all.", "error");
      } finally {
        setLoading(false);
      }
    });
    document.getElementById("chart-server-select")?.addEventListener("change", refreshCharts);
  }

  function wireSearch() {
    const input = document.getElementById("search-input");
    input?.addEventListener("input", () => {
      const q = (input.value || "").toLowerCase().trim();
      document.querySelectorAll(".server-card").forEach((card) => {
        const hay = (card.getAttribute("data-search") || "").toLowerCase();
        card.classList.toggle("hidden", q.length > 0 && !hay.includes(q));
      });
    });
  }

  function startAutoRefresh() {
    resetCountdown();
    setInterval(() => {
      loadAll({ showGlobalLoader: false, silent: true });
      resetCountdown();
    }, REFRESH_MS);
    setInterval(() => {
      secondsLeft = Math.max(0, secondsLeft - 1);
      const el = document.getElementById("stat-countdown");
      if (el) el.textContent = secondsLeft + "s";
    }, 1000);
  }

  function resetCountdown() {
    secondsLeft = REFRESH_MS / 1000;
    const el = document.getElementById("stat-countdown");
    if (el) el.textContent = secondsLeft + "s";
  }

  async function loadAll(opts) {
    const { showGlobalLoader, silent } = opts || {};
    if (!silent) setLoading(true);
    try {
      const [statsRes, serversRes] = await Promise.all([
        fetch(API.stats),
        fetch(API.servers),
      ]);
      const statsJson = await statsRes.json();
      const serversJson = await serversRes.json();

      if (!statsJson.ok) throw new Error(statsJson.error || "stats");
      if (!serversJson.ok) throw new Error(serversJson.error || "servers");

      serversCache = serversJson.data || [];
      renderStats(statsJson.data);
      renderGrid(serversCache);
      renderTargetsTable(serversCache);
      document.getElementById("empty-hint")?.classList.toggle("hidden", serversCache.length > 0);

      const sync = document.getElementById("last-sync");
      if (sync) sync.textContent = "Last sync: " + new Date().toLocaleTimeString();

      const sel = document.getElementById("chart-server-select");
      if (sel && !document.getElementById("view-analytics")?.classList.contains("hidden")) {
        refreshCharts();
      }
    } catch (e) {
      if (!silent) notify(String(e.message || e), "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  function renderStats(s) {
    const t = document.getElementById("stat-total");
    const o = document.getElementById("stat-online");
    const c = document.getElementById("stat-checks");
    if (t) t.textContent = String(s.total_servers ?? "0");
    if (o) o.textContent = String(s.online_now ?? "0");
    if (c) c.textContent = String(s.total_checks ?? "0");
  }

  function renderGrid(servers) {
    const grid = document.getElementById("servers-grid");
    if (!grid) return;
    grid.innerHTML = "";
    servers.forEach((s, idx) => {
      const card = document.createElement("article");
      card.className = "server-card";
      card.style.animationDelay = idx * 0.04 + "s";
      card.setAttribute("data-search", (s.name || "") + " " + (s.url || ""));
      const unknown = !s.last_checked_at;
      const online = Number(s.last_online) === 1;
      const badgeClass = unknown ? "badge-unknown" : online ? "badge-online" : "badge-offline";
      const badgeText = unknown ? "Pending" : online ? "Online" : "Offline";
      const code = s.last_status_code != null ? String(s.last_status_code) : "—";
      const ms = s.last_response_ms != null ? `${Number(s.last_response_ms).toFixed(0)} ms` : "—";
      const when = s.last_checked_at ? formatShort(s.last_checked_at) : "Never";

      card.innerHTML = `
        <div class="server-card-head">
          <div>
            <h3 class="server-name"></h3>
            <p class="server-url mono"></p>
          </div>
          <span class="badge ${badgeClass}"><span class="badge-dot"></span>${badgeText}</span>
        </div>
        <div class="metrics">
          <div class="metric"><div class="metric-label">HTTP status</div><div class="metric-value mono">${escapeHtml(code)}</div></div>
          <div class="metric"><div class="metric-label">Latency</div><div class="metric-value mono">${escapeHtml(ms)}</div></div>
          <div class="metric" style="grid-column:1/-1"><div class="metric-label">Last checked</div><div class="metric-value">${escapeHtml(when)}</div></div>
        </div>
        ${
          s.last_error
            ? `<p class="mono" style="font-size:0.8rem;color:var(--danger);margin:0 0 0.75rem">${escapeHtml(s.last_error)}</p>`
            : ""
        }
        <div class="card-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-action="check" data-id="${s.id}">Check now</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="${s.id}">Remove</button>
        </div>
      `;
      card.querySelector(".server-name").textContent = s.name || "Untitled";
      card.querySelector(".server-url").textContent = s.url || "";

      card.querySelector('[data-action="check"]')?.addEventListener("click", async () => {
        setLoading(true);
        try {
          const res = await fetch(API.checkOne(s.id), { method: "POST" });
          const data = await res.json();
          if (!data.ok) {
            notify(data.error || "Check failed.", "error");
            return;
          }
          notify("Check completed.", "success");
          await loadAll({ showGlobalLoader: false });
        } catch {
          notify("Network error on check.", "error");
        } finally {
          setLoading(false);
        }
      });
      card.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
        if (!confirm("Remove this target?")) return;
        setLoading(true);
        try {
          const res = await fetch(API.delete(s.id), { method: "DELETE" });
          const data = await res.json();
          if (!data.ok) {
            notify(data.error || "Delete failed.", "error");
            return;
          }
          notify("Target removed.", "info");
          await loadAll({ showGlobalLoader: false });
        } catch {
          notify("Network error on delete.", "error");
        } finally {
          setLoading(false);
        }
      });

      grid.appendChild(card);
    });
  }

  function renderTargetsTable(servers) {
    const tbody = document.getElementById("targets-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    servers.forEach((s) => {
      const tr = document.createElement("tr");
      const unknown = !s.last_checked_at;
      const online = Number(s.last_online) === 1;
      const badgeClass = unknown ? "badge-unknown" : online ? "badge-online" : "badge-offline";
      const badgeText = unknown ? "Pending" : online ? "Online" : "Offline";
      tr.innerHTML = `
        <td>${escapeHtml(s.name || "")}</td>
        <td class="mono">${escapeHtml(s.url || "")}</td>
        <td><span class="badge ${badgeClass}">${badgeText}</span></td>
        <td>${escapeHtml(s.last_checked_at ? formatShort(s.last_checked_at) : "—")}</td>
        <td><button type="button" class="btn btn-danger btn-sm" data-del="${s.id}">Delete</button></td>
      `;
      tr.querySelector("[data-del]")?.addEventListener("click", async () => {
        if (!confirm("Delete this target?")) return;
        setLoading(true);
        try {
          const res = await fetch(API.delete(s.id), { method: "DELETE" });
          const data = await res.json();
          if (!data.ok) {
            notify(data.error || "Delete failed.", "error");
            return;
          }
          notify("Deleted.", "info");
          await loadAll({ showGlobalLoader: false });
        } catch {
          notify("Network error.", "error");
        } finally {
          setLoading(false);
        }
      });
      tbody.appendChild(tr);
    });
  }

  function populateChartSelect() {
    const sel = document.getElementById("chart-server-select");
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = "";
    serversCache.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = String(s.id);
      opt.textContent = s.name || s.url;
      sel.appendChild(opt);
    });
    if (current && [...sel.options].some((o) => o.value === current)) {
      sel.value = current;
    }
  }

  async function refreshCharts() {
    const sel = document.getElementById("chart-server-select");
    const panels = document.querySelectorAll(".chart-panel");
    panels.forEach((p) => p.classList.add("is-chart-loading"));
    try {
      populateChartSelect();
      const id = sel?.value || (serversCache[0] && serversCache[0].id);
      if (!id) {
        destroyCharts();
        return;
      }
      const res = await fetch(API.history(id));
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "history");
      const rows = json.data || [];
      buildCharts(rows);
    } catch (e) {
      notify(String(e.message || e), "error");
    } finally {
      panels.forEach((p) => p.classList.remove("is-chart-loading"));
    }
  }

  function destroyCharts() {
    chartResponse?.destroy();
    chartUptime?.destroy();
    chartResponse = chartUptime = null;
  }

  function buildCharts(rows) {
    if (typeof Chart === "undefined") return;
    destroyCharts();

    const labels = rows.map((r) => formatChartTime(r.checked_at));
    const responseData = rows.map((r) => (r.response_ms != null ? Number(r.response_ms) : null));
    const uptimeData = rows.map((r) => (Number(r.is_online) === 1 ? 100 : 0));

    const gridColor =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "rgba(148,163,184,0.15)"
        : "rgba(100,116,139,0.15)";
    const textColor =
      document.documentElement.getAttribute("data-theme") === "dark" ? "#94a3b8" : "#64748b";

    const commonOpts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { maxTicksLimit: 8, color: textColor },
          grid: { color: gridColor },
        },
        y: {
          ticks: { color: textColor },
          grid: { color: gridColor },
        },
      },
    };

    const ctx1 = document.getElementById("chart-response")?.getContext("2d");
    if (ctx1) {
      chartResponse = new Chart(ctx1, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "ms",
              data: responseData,
              borderColor: "#6366f1",
              backgroundColor: "rgba(99,102,241,0.15)",
              fill: true,
              tension: 0.35,
              spanGaps: true,
            },
          ],
        },
        options: {
          ...commonOpts,
          scales: {
            ...commonOpts.scales,
            y: { ...commonOpts.scales.y, beginAtZero: true, title: { display: true, text: "ms", color: textColor } },
          },
        },
      });
    }

    const ctx2 = document.getElementById("chart-uptime")?.getContext("2d");
    if (ctx2) {
      chartUptime = new Chart(ctx2, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Up",
              data: uptimeData,
              stepped: true,
              borderColor: "#10b981",
              backgroundColor: "rgba(16,185,129,0.12)",
              fill: true,
              tension: 0,
            },
          ],
        },
        options: {
          ...commonOpts,
          scales: {
            ...commonOpts.scales,
            y: {
              ...commonOpts.scales.y,
              min: 0,
              max: 100,
              ticks: { ...commonOpts.scales.y.ticks, callback: (v) => v + "%" },
              title: { display: true, text: "Uptime", color: textColor },
            },
          },
        },
      });
    }
  }

  function formatShort(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  }

  function formatChartTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setLoading(on) {
    document.body.classList.toggle("is-loading", !!on);
  }

  function notify(message, type) {
    const area = document.getElementById("notifications");
    if (!area) return;
    const t = document.createElement("div");
    t.className = "toast " + (type || "info");
    t.textContent = message;
    area.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transform = "translateY(6px)";
      t.style.transition = "opacity 0.35s, transform 0.35s";
      setTimeout(() => t.remove(), 400);
    }, 4500);
  }
})();
