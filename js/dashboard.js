// Admin dashboard. Reads cached snapshots from dash_get_overview() and
// renders pulse charts on demand via dash_get_session_buckets().
//
// UX: KPI cards act as tabs. The first card ("General") is always selected
// on load. Clicking a clickable KPI swaps the panel below with the matching
// detail view. Disabled KPIs are non-interactive until they get a panel.

(function () {
  var CHART_JS_URL = "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js";
  var chartJsLoading = null;

  var state = {
    overview: null,
    activeTab: "general",
    chartsBySession: {},
  };

  // Order matters — first entry is the default tab.
  // `kpi` identifies the panel; absence of `kpi` means the card is disabled.
  // `icon` is used instead of a numeric value (only on the General card).
  var KPI_DEFS = [
    { kpi: "general",                  label: "General",            icon: "layout-dashboard" },
    { key: "total_players",            label: "Jugadores",          fmt: intFmt, kpi: "players" },
    { key: "total_narrators",          label: "Narradores",         fmt: intFmt, kpi: "narrators" },
    { key: "total_characters",         label: "Personajes",         fmt: intFmt, kpi: "characters" },
    { key: "active_chronicles",        label: "Crónicas activas",   fmt: intFmt, kpi: "chronicles" },
    { key: "avg_chars_per_player",     label: "Personajes / jugador",  fmt: numFmt },
    { key: "avg_players_per_chronicle",label: "Jugadores / crónica",   fmt: numFmt },
    { key: "rolls_30d",                label: "Tiradas (30d)",      fmt: intFmt },
    { key: "messages_30d",             label: "Mensajes (30d)",     fmt: intFmt },
    { key: "total_inferred_sessions",  label: "Partidas inferidas", fmt: intFmt },
  ];

  window.initDashboard = async function () {
    var sb = window.supabase;
    if (!sb) return showError("Supabase no está disponible.");

    var isAdmin = false;
    try {
      isAdmin = await window.ABNPlayer?.isAdmin?.();
    } catch (_e) {}
    if (!isAdmin) {
      showError("Acceso restringido a administradores.");
      return;
    }

    document.getElementById("dash-refresh-btn").addEventListener("click", onRefreshClick);
    bindRollsModal();
    bindConvModal();
    await loadOverview();
  };

  async function loadOverview() {
    var sb = window.supabase;
    var { data, error } = await sb.rpc("dash_get_overview");
    if (error) {
      showError("No se pudo cargar el dashboard: " + error.message);
      return;
    }
    state.overview = data || {};
    renderRefreshedAt(state.overview.refreshed_at);
    renderKpis(state.overview.snapshot || {});
    renderActiveTab();
  }

  async function onRefreshClick(ev) {
    var btn = ev.currentTarget;
    btn.disabled = true;
    var label = btn.querySelector("span");
    var prevText = label ? label.textContent : "";
    if (label) label.textContent = "Refrescando…";

    try {
      var sb = window.supabase;
      var { error } = await sb.rpc("dash_refresh");
      if (error) {
        showError("Error al refrescar: " + error.message);
      } else {
        hideError();
        // Drop chart cache because session ids may have changed.
        state.chartsBySession = {};
        await loadOverview();
      }
    } finally {
      btn.disabled = false;
      if (label) label.textContent = prevText || "Refrescar";
    }
  }

  // ---------- KPI grid (tabs) ----------

  function renderRefreshedAt(iso) {
    var el = document.getElementById("dash-refreshed-at");
    if (!el) return;
    if (!iso) {
      el.textContent = "Sin datos cacheados — presioná Refrescar";
      return;
    }
    var d = new Date(iso);
    el.textContent = "Actualizado: " + d.toLocaleString();
  }

  function renderKpis(snap) {
    var grid = document.getElementById("dash-kpi-grid");
    if (!grid) return;
    grid.innerHTML = "";

    KPI_DEFS.forEach(function (def) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "dash-kpi";
      if (def.kpi === "general") card.classList.add("dash-kpi--general");

      var value = document.createElement("div");
      value.className = "dash-kpi-value";
      if (def.icon) {
        value.innerHTML = '<i data-lucide="' + def.icon + '"></i>';
      } else {
        var v = snap[def.key];
        value.textContent = (v == null) ? "—" : def.fmt(v);
      }

      var lbl = document.createElement("div");
      lbl.className = "dash-kpi-label";
      lbl.textContent = def.label;

      card.appendChild(value);
      card.appendChild(lbl);

      if (def.kpi) {
        card.classList.add("dash-kpi--clickable");
        card.dataset.kpi = def.kpi;
        if (state.activeTab === def.kpi) card.classList.add("dash-kpi--active");
        card.addEventListener("click", function () { setActiveTab(def.kpi); });
      } else {
        card.disabled = true;
      }

      grid.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function setActiveTab(kpi) {
    state.activeTab = kpi;
    document.querySelectorAll(".dash-kpi").forEach(function (el) {
      el.classList.toggle("dash-kpi--active", el.dataset.kpi === kpi);
    });
    renderActiveTab();
  }

  function renderActiveTab() {
    var panel = document.getElementById("dash-tab-panel");
    if (!panel) return;
    panel.innerHTML = "";

    var ov = state.overview || {};
    var content;
    switch (state.activeTab) {
      case "players":
        content = renderPlayersPanel(ov.players_detail || [], ov.top_users || []);
        break;
      case "narrators":
        content = renderNarratorsPanel(ov.narrators_detail || []);
        break;
      case "characters":
        content = renderCharactersPanel(ov.characters_detail || []);
        break;
      case "chronicles":
        content = renderChroniclesPanel(ov.chronicles || []);
        break;
      case "general":
      default:
        content = renderGeneralPanel();
        break;
    }
    panel.appendChild(content);
    if (window.lucide) window.lucide.createIcons();
  }

  // ---------- Tab panels ----------

  function renderGeneralPanel() {
    var div = document.createElement("div");
    div.className = "dash-tab-empty";
    div.innerHTML =
      '<i data-lucide="bar-chart-3"></i>' +
      '<p>Seleccioná un indicador para ver detalles.</p>';
    return div;
  }

  function renderPlayersPanel(players, topUsers) {
    var section = document.createElement("div");
    section.className = "dash-tab-content";

    // Top: full player list
    var headPlayers = document.createElement("h3");
    headPlayers.className = "dash-section-title";
    headPlayers.textContent = "Todos los jugadores";
    section.appendChild(headPlayers);
    section.appendChild(renderPlayersTable(players));

    // Bottom: 7-day activity (only those with activity)
    var headAct = document.createElement("h3");
    headAct.className = "dash-section-title";
    headAct.innerHTML = 'Actividad reciente <span class="dash-section-hint">(últimos 7 días)</span>';
    section.appendChild(headAct);
    section.appendChild(renderActivityTable(topUsers));

    return section;
  }

  function renderNarratorsPanel(narrators) {
    var section = document.createElement("div");
    section.className = "dash-tab-content";
    section.appendChild(renderNarratorsTable(narrators));
    return section;
  }

  function renderCharactersPanel(characters) {
    var section = document.createElement("div");
    section.className = "dash-tab-content";

    var listHead = document.createElement("h3");
    listHead.className = "dash-section-title";
    listHead.textContent = "Listado de personajes";
    section.appendChild(listHead);
    section.appendChild(renderCharactersTable(characters));

    var statsHead = document.createElement("h3");
    statsHead.className = "dash-section-title";
    statsHead.textContent = "Distribución";
    section.appendChild(statsHead);

    var grid = document.createElement("div");
    grid.className = "dash-pie-grid";
    grid.innerHTML =
      '<div class="dash-pie-card">' +
        '<h4 class="dash-pie-title">Clanes</h4>' +
        '<div class="dash-pie-wrap"><canvas class="dash-pie-clans"></canvas></div>' +
      '</div>' +
      '<div class="dash-pie-card">' +
        '<h4 class="dash-pie-title">Generaciones</h4>' +
        '<div class="dash-pie-wrap"><canvas class="dash-pie-generations"></canvas></div>' +
      '</div>';
    section.appendChild(grid);

    // Lazy-load Chart.js then render the pies
    ensureChartJs().then(function () {
      renderPie(grid.querySelector(".dash-pie-clans"),
                aggregateBy(characters, "clan"));
      renderPie(grid.querySelector(".dash-pie-generations"),
                aggregateBy(characters, "generation", true));
    }).catch(function () {
      grid.innerHTML = '<p class="dash-empty">No se pudo cargar Chart.js.</p>';
    });

    return section;
  }

  function renderChroniclesPanel(chronicles) {
    var section = document.createElement("div");
    section.className = "dash-tab-content";
    if (!chronicles.length) {
      var empty = document.createElement("p");
      empty.className = "dash-empty";
      empty.textContent = "No hay crónicas registradas.";
      section.appendChild(empty);
      return section;
    }
    chronicles.forEach(function (c) {
      section.appendChild(renderChronicleCard(c));
    });
    return section;
  }

  // ---------- Tables ----------

  function renderPlayersTable(players) {
    var wrap = document.createElement("div");
    wrap.className = "dash-table-wrap";
    if (!players.length) {
      wrap.innerHTML = '<p class="dash-empty">No hay jugadores registrados.</p>';
      return wrap;
    }
    var table = document.createElement("table");
    table.className = "dash-table";
    table.innerHTML =
      "<thead><tr>" +
      "<th>Jugador</th>" +
      "<th>Email</th>" +
      "<th>Personajes</th>" +
      "<th>Crónicas</th>" +
      "<th>Registro</th>" +
      "<th>Promedio sem. (4 sem)</th>" +
      "</tr></thead>";
    var tbody = document.createElement("tbody");
    players.forEach(function (p) {
      var nameCell = escapeHtml(p.name || "—") +
        (p.is_admin ? ' <span class="dash-tag dash-tag--admin">admin</span>' : '') +
        (p.narrator_chronicle_count > 0 ? ' <span class="dash-tag dash-tag--narrator">narrador</span>' : '');
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + nameCell + "</td>" +
        "<td><span class=\"dash-email\">" + escapeHtml(p.email || "—") + "</span></td>" +
        "<td class=\"dash-num\">" + intFmt(p.character_count || 0) + "</td>" +
        "<td class=\"dash-num\">" + intFmt(p.chronicle_count || 0) + "</td>" +
        "<td>" + (p.joined_at ? new Date(p.joined_at).toLocaleDateString() : "—") + "</td>" +
        "<td class=\"dash-num\">" + (p.avg_weekly_seconds_4w ? formatDuration(p.avg_weekly_seconds_4w) : "—") + "</td>";
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderCharactersTable(characters) {
    var wrap = document.createElement("div");
    wrap.className = "dash-table-wrap";
    if (!characters.length) {
      wrap.innerHTML = '<p class="dash-empty">No hay personajes registrados.</p>';
      return wrap;
    }

    var sortState = { key: "activity", dir: "desc" };

    function sortAccessor(c, k) {
      switch (k) {
        case "name":           return (c.name || "").toLowerCase();
        case "clan":           return (c.clan || "").toLowerCase();
        case "generation":     return parseInt(c.generation, 10) || 0;
        case "player_name":    return (c.player_name || "").toLowerCase();
        case "chronicle_name": return (c.chronicle_name || "").toLowerCase();
        case "created_at":     return c.created_at ? new Date(c.created_at).getTime() : 0;
        case "activity":       return c.activity || 0;
      }
      return null;
    }

    function applySort() {
      characters.sort(function (a, b) {
        var av = sortAccessor(a, sortState.key);
        var bv = sortAccessor(b, sortState.key);
        if (av < bv) return sortState.dir === "asc" ? -1 : 1;
        if (av > bv) return sortState.dir === "asc" ? 1 : -1;
        return 0;
      });
    }

    var cols = [
      { key: "name",           label: "Nombre" },
      { key: "clan",           label: "Clan" },
      { key: "generation",     label: "Generación", numeric: true },
      { key: "player_name",    label: "Jugador" },
      { key: "chronicle_name", label: "Crónica" },
      { key: "created_at",     label: "Creado" },
      { key: "activity",       label: "Actividad", numeric: true },
    ];

    function rebuild() {
      applySort();
      wrap.innerHTML = "";
      var table = document.createElement("table");
      table.className = "dash-table dash-table--sortable";

      var thead = document.createElement("thead");
      var trh = document.createElement("tr");
      cols.forEach(function (col) {
        var th = document.createElement("th");
        th.textContent = col.label;
        if (col.numeric) th.classList.add("dash-num");
        th.dataset.sortKey = col.key;
        th.classList.add("dash-th-sort");
        if (sortState.key === col.key) {
          th.classList.add("dash-th-sort-active");
          th.dataset.sortDir = sortState.dir;
        }
        th.addEventListener("click", function () {
          if (sortState.key === col.key) {
            sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
          } else {
            sortState.key = col.key;
            sortState.dir = col.numeric ? "desc" : "asc";
          }
          rebuild();
        });
        trh.appendChild(th);
      });
      thead.appendChild(trh);
      table.appendChild(thead);

      var tbody = document.createElement("tbody");
      characters.forEach(function (c) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + escapeHtml(c.name || "—") + "</td>" +
          "<td>" + escapeHtml(c.clan || "—") + "</td>" +
          "<td class=\"dash-num\">" + escapeHtml(c.generation || "—") + "</td>" +
          "<td>" + escapeHtml(c.player_name || "—") + "</td>" +
          "<td>" + escapeHtml(c.chronicle_name || "—") + "</td>" +
          "<td>" + (c.created_at ? new Date(c.created_at).toLocaleDateString() : "—") + "</td>" +
          "<td class=\"dash-num\">" + intFmt(c.activity || 0) + "</td>";
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
    }

    rebuild();
    return wrap;
  }

  function aggregateBy(items, key, sortByLabelNumeric) {
    var counts = {};
    items.forEach(function (it) {
      var v = it[key];
      var label = (v == null || v === "") ? "Sin definir" : String(v);
      counts[label] = (counts[label] || 0) + 1;
    });
    var entries = Object.keys(counts).map(function (k) {
      return { label: k, count: counts[k] };
    });
    if (sortByLabelNumeric) {
      entries.sort(function (a, b) {
        var an = parseInt(a.label, 10);
        var bn = parseInt(b.label, 10);
        if (isNaN(an) && isNaN(bn)) return a.label.localeCompare(b.label);
        if (isNaN(an)) return 1;
        if (isNaN(bn)) return -1;
        return an - bn;
      });
    } else {
      entries.sort(function (a, b) { return b.count - a.count; });
    }
    return entries;
  }

  function renderPie(canvas, entries) {
    if (!canvas || !window.Chart) return;
    if (!entries.length) {
      canvas.parentElement.innerHTML = '<p class="dash-empty">Sin datos.</p>';
      return;
    }
    var palette = ["#c62828", "#2d6b3f", "#4a7c8e", "#9c640c", "#6d4c8a", "#1f7a8c", "#a16f22", "#5d4037", "#557799", "#888888"];
    var ctx = canvas.getContext("2d");
    return new window.Chart(ctx, {
      type: "doughnut",
      data: {
        labels: entries.map(function (e) { return e.label; }),
        datasets: [{
          data: entries.map(function (e) { return e.count; }),
          backgroundColor: entries.map(function (_, i) { return palette[i % palette.length]; }),
          borderColor: "rgba(0,0,0,0.4)",
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right" },
          tooltip: {
            callbacks: {
              label: function (item) {
                var total = item.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                var pct = total ? Math.round(item.parsed * 100 / total) : 0;
                return item.label + ": " + item.parsed + " (" + pct + "%)";
              },
            },
          },
        },
      },
    });
  }

  function renderNarratorsTable(narrators) {
    var wrap = document.createElement("div");
    wrap.className = "dash-table-wrap";
    if (!narrators.length) {
      wrap.innerHTML = '<p class="dash-empty">No hay narradores asignados a ninguna crónica.</p>';
      return wrap;
    }
    var table = document.createElement("table");
    table.className = "dash-table";
    table.innerHTML =
      "<thead><tr>" +
      "<th>Jugador</th>" +
      "<th>Crónicas</th>" +
      "<th>MB acumulados</th>" +
      "<th>Registro</th>" +
      "</tr></thead>";
    var tbody = document.createElement("tbody");
    narrators.forEach(function (n) {
      var names = (n.chronicle_names || []).join(", ");
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(n.name || "—") + "</td>" +
        "<td class=\"dash-num\" title=\"" + escapeHtml(names) + "\">" +
          intFmt(n.chronicle_count || 0) +
          (names ? ' <span class="dash-cell-hint">' + escapeHtml(names) + '</span>' : '') +
        "</td>" +
        "<td class=\"dash-num\">" + formatMB(n.total_storage_bytes || 0) + "</td>" +
        "<td>" + (n.joined_at ? new Date(n.joined_at).toLocaleDateString() : "—") + "</td>";
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderActivityTable(users) {
    var wrap = document.createElement("div");
    wrap.className = "dash-table-wrap";
    if (!users.length) {
      wrap.innerHTML = '<p class="dash-empty">Sin actividad registrada en los últimos 7 días.</p>';
      return wrap;
    }
    var table = document.createElement("table");
    table.className = "dash-table";
    table.innerHTML =
      "<thead><tr>" +
      "<th>Jugador</th>" +
      "<th>Tiempo activo</th>" +
      "<th>Sección más usada</th>" +
      "</tr></thead>";
    var tbody = document.createElement("tbody");
    users.forEach(function (u) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(u.player_name || "—") + "</td>" +
        "<td>" + formatDuration(u.seconds_active || 0) + "</td>" +
        "<td><code>" + escapeHtml(u.top_route || "—") + "</code></td>";
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  // ---------- Chronicles & sessions ----------

  function renderChronicleCard(c) {
    var sessions = c.sessions || [];

    var card = document.createElement("article");
    card.className = "dash-chronicle";

    var header = document.createElement("header");
    header.className = "dash-chronicle-header";
    var lastAt = c.last_activity_at
      ? "Última actividad: " + new Date(c.last_activity_at).toLocaleDateString()
      : "Sin actividad registrada";
    header.innerHTML =
      '<div class="dash-chronicle-title">' +
        '<h3>' + escapeHtml(c.name) + '</h3>' +
        '<span class="dash-chronicle-status status-' + escapeHtml(c.status || "") + '">' +
          escapeHtml(c.status || "") +
        '</span>' +
      '</div>' +
      '<div class="dash-chronicle-meta">' +
        '<span>' + escapeHtml(lastAt) + '</span>' +
        '<span>' + sessions.length + ' partida' + (sessions.length === 1 ? '' : 's') + '</span>' +
      '</div>';
    card.appendChild(header);

    if (!sessions.length) {
      var empty = document.createElement("p");
      empty.className = "dash-empty";
      empty.textContent = "Sin partidas inferidas todavía.";
      card.appendChild(empty);
      return card;
    }

    var list = document.createElement("ul");
    list.className = "dash-sessions";
    sessions.forEach(function (s) {
      list.appendChild(renderSessionRow(s));
    });
    card.appendChild(list);
    return card;
  }

  function renderSessionRow(s) {
    var li = document.createElement("li");
    li.className = "dash-session";

    var summary = document.createElement("button");
    summary.type = "button";
    summary.className = "dash-session-summary";
    summary.setAttribute("aria-expanded", "false");
    summary.innerHTML =
      '<div class="dash-session-when">' +
        '<i data-lucide="chevron-right"></i>' +
        '<span>' + formatDateRange(s.started_at, s.ended_at) + '</span>' +
        (s.is_closed ? '' : '<span class="dash-tag dash-tag--open">en curso</span>') +
      '</div>' +
      '<div class="dash-session-stats">' +
        statChip("clock", formatMin(s.duration_min)) +
        statChip("users", (s.participant_names || []).length + " jugadores") +
        statChip("dices", (s.roll_count || 0) + " tiradas") +
        statChip("message-square", (s.message_count || 0) + " mensajes") +
        (s.avg_pool != null ? statChip("hash", "pool ø " + numFmt(s.avg_pool)) : "") +
        (s.avg_successes != null ? statChip("check", "éxitos ø " + numFmt(s.avg_successes)) : "") +
        (s.avg_ones != null ? statChip("skull", "1s ø " + numFmt(s.avg_ones)) : "") +
      '</div>';
    li.appendChild(summary);

    var detail = document.createElement("div");
    detail.className = "dash-session-detail hidden";
    detail.innerHTML =
      '<div class="dash-participants">' +
        '<span class="dash-participants-label">Participantes:</span> ' +
        ((s.participant_names || []).map(escapeHtml).join(", ") || "—") +
      '</div>' +
      '<div class="dash-pulse-section dash-pulse-section--rolls">' +
        '<h4 class="dash-pulse-title">Tiradas</h4>' +
        '<div class="dash-pulse-wrap"><canvas class="dash-pulse-chart-rolls"></canvas></div>' +
      '</div>' +
      '<div class="dash-pulse-section dash-pulse-section--msgs">' +
        '<h4 class="dash-pulse-title">Mensajes</h4>' +
        '<div class="dash-pulse-wrap"><canvas class="dash-pulse-chart-msgs"></canvas></div>' +
      '</div>';
    li.appendChild(detail);

    summary.addEventListener("click", function () {
      var expanded = summary.getAttribute("aria-expanded") === "true";
      summary.setAttribute("aria-expanded", expanded ? "false" : "true");
      detail.classList.toggle("hidden", expanded);
      var chevron = summary.querySelector("[data-lucide]");
      if (chevron) chevron.setAttribute("data-lucide", expanded ? "chevron-right" : "chevron-down");
      if (window.lucide) window.lucide.createIcons();
      if (!expanded && !state.chartsBySession[s.id]) {
        loadAndRenderPulse(s, detail);
      }
    });

    return li;
  }

  async function loadAndRenderPulse(session, container) {
    if (!container) return;
    var rollsSection = container.querySelector(".dash-pulse-section--rolls");
    var msgsSection  = container.querySelector(".dash-pulse-section--msgs");
    var rollsCanvas  = container.querySelector(".dash-pulse-chart-rolls");
    var msgsCanvas   = container.querySelector(".dash-pulse-chart-msgs");

    function fillBoth(html) {
      container.querySelectorAll(".dash-pulse-wrap").forEach(function (el) {
        el.innerHTML = html;
      });
    }

    try {
      await ensureChartJs();
    } catch (e) {
      fillBoth('<p class="dash-pulse-empty">No se pudo cargar Chart.js.</p>');
      return;
    }

    var sb = window.supabase;
    var { data, error } = await sb.rpc("dash_get_session_buckets", { p_session_id: session.id });
    if (error) {
      fillBoth('<p class="dash-pulse-empty">Error: ' + escapeHtml(error.message) + '</p>');
      return;
    }
    var buckets = data || [];
    if (!buckets.length) {
      fillBoth('<p class="dash-pulse-empty">Sin actividad registrada en esta partida.</p>');
      return;
    }

    // Aggregate. For rolls the bucket has no recipient (null) so we collapse
    // by character. For messages we keep one entry per (character × recipient)
    // so the same character with multiple conversations becomes multiple
    // stacked segments of the same color.
    var rollsByActor = {};   // key = character_sheet_id || "_npcs"
    var convsByKey   = {};   // key = "<char>::<recipient_type>:<recipient_id>"
    var charNames    = {};   // char_key -> display name
    var bucketSet    = new Set();

    buckets.forEach(function (b) {
      bucketSet.add(b.bucket_start);
      var charKey = b.character_sheet_id ? b.character_sheet_id : "_npcs";
      var charName = b.character_sheet_id
        ? (b.character_name || "Sin nombre")
        : "NPCs";
      charNames[charKey] = charName;

      if (b.roll_count > 0) {
        if (!rollsByActor[charKey]) {
          rollsByActor[charKey] = { name: charName, byBucket: {}, total: 0 };
        }
        rollsByActor[charKey].byBucket[b.bucket_start] =
          (rollsByActor[charKey].byBucket[b.bucket_start] || 0) + b.roll_count;
        rollsByActor[charKey].total += b.roll_count;
      }

      if (b.message_count > 0) {
        var convKey = charKey + "::" + (b.recipient_type || "") + ":" + (b.recipient_id || "");
        if (!convsByKey[convKey]) {
          convsByKey[convKey] = {
            charKey:        charKey,
            charName:       charName,
            recipientType:  b.recipient_type,
            recipientId:    b.recipient_id,
            recipientLabel: b.recipient_label || "—",
            byBucket:       {},
            total:          0,
          };
        }
        convsByKey[convKey].byBucket[b.bucket_start] =
          (convsByKey[convKey].byBucket[b.bucket_start] || 0) + b.message_count;
        convsByKey[convKey].total += b.message_count;
      }
    });

    var labels = Array.from(bucketSet).sort();

    // Stable color per character; NPCs always grey + last
    var palette = ["#c62828", "#2d6b3f", "#4a7c8e", "#9c640c", "#6d4c8a", "#1f7a8c", "#a16f22", "#5d4037"];
    var charKeysSorted = Object.keys(charNames).sort(function (a, b) {
      if (a === "_npcs") return 1;
      if (b === "_npcs") return -1;
      return charNames[a].localeCompare(charNames[b]);
    });
    var colorByChar = {};
    charKeysSorted.forEach(function (k, i) {
      colorByChar[k] = (k === "_npcs") ? "#888888" : palette[i % palette.length];
    });

    state.chartsBySession[session.id] = {
      rolls: renderRollsPulse(rollsCanvas, rollsSection, labels, charKeysSorted, rollsByActor, colorByChar, session),
      msgs:  renderMessagesPulse(msgsCanvas, msgsSection, labels, charKeysSorted, convsByKey, colorByChar, session),
    };
  }

  function renderRollsPulse(canvas, section, labels, charKeysSorted, rollsByActor, colorByChar, session) {
    var datasets = charKeysSorted
      .filter(function (k) { return rollsByActor[k] && rollsByActor[k].total > 0; })
      .map(function (k) {
        return {
          label:           rollsByActor[k].name,
          _actorKey:       k,
          data:            labels.map(function (l) { return rollsByActor[k].byBucket[l] || 0; }),
          backgroundColor: colorByChar[k],
          stack:           "rolls",
        };
      });

    if (!datasets.length) {
      section.querySelector(".dash-pulse-wrap").innerHTML =
        '<p class="dash-pulse-empty">No hay tiradas registradas en esta partida.</p>';
      return null;
    }

    return makeStackedBar(canvas, labels, datasets, function (ds, bucketIso) {
      openRollsModal(session, ds._actorKey, ds.label, bucketIso);
    });
  }

  function renderMessagesPulse(canvas, section, labels, charKeysSorted, convsByKey, colorByChar, session) {
    // Order: characters in their stable order, then conversations alphabetically by recipient label.
    var convKeys = Object.keys(convsByKey).sort(function (a, b) {
      var ca = convsByKey[a].charKey;
      var cb = convsByKey[b].charKey;
      var ai = charKeysSorted.indexOf(ca);
      var bi = charKeysSorted.indexOf(cb);
      if (ai !== bi) return ai - bi;
      return convsByKey[a].recipientLabel.localeCompare(convsByKey[b].recipientLabel);
    });

    var datasets = convKeys
      .filter(function (k) { return convsByKey[k].total > 0; })
      .map(function (k) {
        var c = convsByKey[k];
        return {
          label:           c.charName + " → " + c.recipientLabel,
          _actorKey:       c.charKey,
          _charName:       c.charName,
          _recipientType:  c.recipientType,
          _recipientId:    c.recipientId,
          data:            labels.map(function (l) { return c.byBucket[l] || 0; }),
          backgroundColor: colorByChar[c.charKey],
          // Thin border so same-color segments of the same character stay
          // visually distinct when stacked.
          borderColor:     "rgba(0,0,0,0.55)",
          borderWidth:     { top: 1, bottom: 0, left: 0, right: 0 },
          stack:           "msgs",
        };
      });

    if (!datasets.length) {
      section.querySelector(".dash-pulse-wrap").innerHTML =
        '<p class="dash-pulse-empty">No hay mensajes registrados en esta partida.</p>';
      return null;
    }

    return makeStackedBar(canvas, labels, datasets, function (ds, bucketIso) {
      openConvModal(session, ds._actorKey, ds.label, bucketIso, ds._recipientType, ds._recipientId);
    });
  }

  function makeStackedBar(canvas, labels, datasets, onBarClick) {
    var ctx = canvas.getContext("2d");
    return new window.Chart(ctx, {
      type: "bar",
      data: { labels: labels.map(formatBucketLabel), datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              // Deduplicate by _actorKey: keep the first dataset per character,
              // rewrite its label to just the character name. Default
              // generateLabels handles everything else.
              filter: function (item, chartData) {
                var ds = chartData.datasets[item.datasetIndex];
                if (!ds) return true;
                var key = ds._actorKey;
                if (key) {
                  for (var i = 0; i < item.datasetIndex; i++) {
                    if (chartData.datasets[i]._actorKey === key) return false;
                  }
                  item.text = ds._charName || ds.label;
                }
                return true;
              },
            },
            onClick: function (_e, legendItem, legend) {
              var chart = legend.chart;
              var refDs = chart.data.datasets[legendItem.datasetIndex];
              if (!refDs) return;
              var key = refDs._actorKey;
              if (!key) {
                // Fall back to default toggle behavior
                var meta = chart.getDatasetMeta(legendItem.datasetIndex);
                meta.hidden = meta.hidden === null ? !refDs.hidden : !meta.hidden;
                chart.update();
                return;
              }
              // Toggle all datasets sharing this _actorKey together
              var allVisible = chart.data.datasets.every(function (d, idx) {
                if (d._actorKey !== key) return true;
                return chart.getDatasetMeta(idx).hidden !== true;
              });
              chart.data.datasets.forEach(function (d, idx) {
                if (d._actorKey !== key) return;
                chart.getDatasetMeta(idx).hidden = allVisible ? true : false;
              });
              chart.update();
            },
          },
        },
        scales: {
          x: { stacked: true, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        },
        onHover: function (event, elements) {
          if (event.native && event.native.target) {
            event.native.target.style.cursor = elements.length ? "pointer" : "default";
          }
        },
        onClick: function (event, elements, chart) {
          if (!elements.length) return;
          var el = elements[0];
          var ds = chart.data.datasets[el.datasetIndex];
          var bucketIso = labels[el.index];
          onBarClick(ds, bucketIso);
        },
      },
    });
  }

  // ---------- Rolls detail modal ----------

  function bindRollsModal() {
    var overlay = document.getElementById("dash-rolls-modal");
    var closeBtn = document.getElementById("dash-rolls-modal-close");
    if (!overlay || !closeBtn) return;
    closeBtn.addEventListener("click", closeRollsModal);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeRollsModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) closeRollsModal();
    });
  }

  function closeRollsModal() {
    var overlay = document.getElementById("dash-rolls-modal");
    if (!overlay) return;
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }

  async function openRollsModal(session, actorKey, actorName, bucketIso) {
    var sb = window.supabase;
    var bucketStart = new Date(bucketIso);
    var bucketEnd = new Date(bucketStart.getTime() + 5 * 60 * 1000);

    var query = sb.from("dash_dice_rolls")
      .select("*")
      .eq("chronicle_id", session.chronicle_id)
      .gte("created_at", bucketStart.toISOString())
      .lt("created_at", bucketEnd.toISOString())
      .order("created_at");
    if (actorKey === "_npcs") {
      query = query.is("character_sheet_id", null);
    } else {
      query = query.eq("character_sheet_id", actorKey);
    }
    var { data, error } = await query;

    var title = actorName + " · " + formatBucketLabel(bucketIso);
    var body = document.getElementById("dash-rolls-modal-body");
    var titleEl = document.getElementById("dash-rolls-modal-title");
    var overlay = document.getElementById("dash-rolls-modal");
    if (!overlay || !body || !titleEl) return;

    titleEl.textContent = title;
    body.innerHTML = "";

    if (error) {
      body.innerHTML = '<p class="dash-empty">Error: ' + escapeHtml(error.message) + '</p>';
    } else if (!data || !data.length) {
      body.innerHTML = '<p class="dash-empty">Sin tiradas en este intervalo.</p>';
    } else {
      data.forEach(function (r) {
        body.appendChild(renderRollCard(r));
      });
    }
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    if (window.lucide) window.lucide.createIcons();
  }

  function renderRollCard(r) {
    var meta = r.metadata || {};
    var card = document.createElement("article");
    card.className = "dash-roll-card";

    var timeStr = new Date(r.created_at).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });

    var poolParts = [meta.pool1, meta.pool2].filter(function (p) { return p && String(p).trim(); });
    var poolLabel = poolParts.join(" + ");
    var rollName = meta.rollName && String(meta.rollName).trim();

    var metaBits = ["pool " + (r.pool != null ? r.pool : "?")];
    if (r.difficulty != null) metaBits.push("D" + r.difficulty);
    if (meta.modifier && Number(meta.modifier) !== 0) {
      metaBits.push((meta.modifier > 0 ? "+" : "") + meta.modifier);
    }

    var tags = [];
    if (meta.willpower) tags.push("Voluntad");
    if (meta.specialty) tags.push("Especialidad");
    if (meta.potencia)  tags.push("Potencia" + (meta.potenciaLevel ? " " + meta.potenciaLevel : ""));

    var diff = r.difficulty;
    var diceHtml = (r.results || []).map(function (d) {
      var cls = "dash-die";
      if (d === 1) cls += " dash-die--one";
      else if (d === 10) cls += " dash-die--ten";
      else if (diff != null && d >= diff) cls += " dash-die--success";
      else cls += " dash-die--fail";
      return '<span class="' + cls + '">' + d + '</span>';
    }).join("");

    var resultText = r.is_botch
      ? "¡Pifia!"
      : (meta.result || (r.successes + " éxito" + (r.successes === 1 ? "" : "s")));

    card.innerHTML =
      '<header class="dash-roll-header">' +
        '<span class="dash-roll-time">' + escapeHtml(timeStr) + '</span>' +
        (rollName ? '<span class="dash-roll-name">' + escapeHtml(rollName) + '</span>' : '') +
      '</header>' +
      '<div class="dash-roll-pool">' +
        (poolLabel ? '<span class="dash-roll-pool-label">' + escapeHtml(poolLabel) + '</span>' : '') +
        '<span class="dash-roll-pool-meta">' + escapeHtml(metaBits.join(" · ")) + '</span>' +
      '</div>' +
      (tags.length
        ? '<div class="dash-roll-tags">' +
            tags.map(function (t) { return '<span class="dash-chip">' + escapeHtml(t) + '</span>'; }).join("") +
          '</div>'
        : "") +
      '<div class="dash-roll-dice">' + diceHtml + '</div>' +
      '<div class="dash-roll-result' + (r.is_botch ? ' dash-roll-result--botch' : '') + '">' +
        escapeHtml(resultText) +
      '</div>';

    return card;
  }

  // ---------- Conversation modal ----------

  function bindConvModal() {
    var overlay = document.getElementById("dash-conv-modal");
    var closeBtn = document.getElementById("dash-conv-modal-close");
    if (!overlay || !closeBtn) return;
    closeBtn.addEventListener("click", closeConvModal);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeConvModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) closeConvModal();
    });
  }

  function closeConvModal() {
    var overlay = document.getElementById("dash-conv-modal");
    if (!overlay) return;
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }

  async function openConvModal(session, actorKey, datasetLabel, bucketIso, recipientType, recipientId) {
    var sb = window.supabase;
    var actorSheetId = actorKey === "_npcs" ? null : actorKey;
    var { data, error } = await sb.rpc("dash_get_message_conversation", {
      p_chronicle_id:   session.chronicle_id,
      p_actor_sheet_id: actorSheetId,
      p_recipient_type: recipientType,
      p_recipient_id:   recipientId,
      p_bucket_start:   bucketIso,
    });

    var overlay = document.getElementById("dash-conv-modal");
    var titleEl = document.getElementById("dash-conv-modal-title");
    var subtitleEl = document.getElementById("dash-conv-modal-subtitle");
    var body = document.getElementById("dash-conv-modal-body");
    if (!overlay || !titleEl || !body) return;

    if (error) {
      titleEl.textContent = "Conversación";
      subtitleEl.textContent = "";
      body.innerHTML = '<p class="dash-empty">Error: ' + escapeHtml(error.message) + '</p>';
      overlay.classList.remove("hidden");
      return;
    }

    var conv = data || {};
    if (conv.kind === "group") {
      titleEl.textContent = "Grupo: " + (conv.group_name || "—");
      subtitleEl.textContent = (conv.group_members || []).map(function (m) { return m.label; }).join(" · ");
    } else if (conv.kind === "pair") {
      titleEl.textContent = (conv.a_label || "—") + " ↔ " + (conv.b_label || "—");
      subtitleEl.textContent = formatBucketLabel(bucketIso) + " · click para resaltar este intervalo";
    } else {
      titleEl.textContent = "Conversación";
      subtitleEl.textContent = "";
    }

    var bucketStart = new Date(bucketIso).getTime();
    var bucketEnd = bucketStart + 5 * 60 * 1000;

    body.innerHTML = "";
    var msgs = conv.messages || [];
    if (!msgs.length) {
      body.innerHTML = '<p class="dash-empty">Sin mensajes en esta conversación.</p>';
    } else {
      // For pair conversations, the "actor side" is whichever entity was
      // sending in the clicked bucket → keep that on the right.
      var rightSideKey = null;
      if (conv.kind === "pair") {
        rightSideKey = conv.a_type + ":" + conv.a_id;
      }
      // For group conversations, the actor we clicked stays on the right.
      if (conv.kind === "group" && actorSheetId) {
        rightSideKey = "pc:" + actorSheetId;
      }

      var firstHighlightedEl = null;
      msgs.forEach(function (m) {
        var t = new Date(m.created_at).getTime();
        var inBucket = t >= bucketStart && t < bucketEnd;
        var senderKey = m.sender_type + ":" + m.sender_id;
        var alignRight = rightSideKey && senderKey === rightSideKey;
        var bubble = renderConvBubble(m, alignRight, inBucket, conv.kind === "group");
        if (inBucket && !firstHighlightedEl) firstHighlightedEl = bubble;
        body.appendChild(bubble);
      });

      // Scroll to first highlighted message after the modal is visible
      requestAnimationFrame(function () {
        if (firstHighlightedEl) {
          firstHighlightedEl.scrollIntoView({ block: "center", behavior: "instant" in HTMLElement.prototype.scrollIntoView ? "instant" : "auto" });
        }
      });
    }

    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    if (window.lucide) window.lucide.createIcons();
  }

  function renderConvBubble(m, alignRight, inBucket, isGroup) {
    var row = document.createElement("div");
    row.className = "dash-msg-row dash-msg-row--" + (alignRight ? "right" : "left");
    if (inBucket) row.classList.add("dash-msg-row--highlight");

    var time = new Date(m.created_at).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit"
    });
    var date = new Date(m.created_at).toLocaleDateString();

    var bubble = document.createElement("article");
    bubble.className = "dash-msg-bubble dash-msg-bubble--" + (m.sender_type === "npc" ? "npc" : "pc");

    var showSender = isGroup || !alignRight;
    bubble.innerHTML =
      (showSender
        ? '<header class="dash-msg-sender">' + escapeHtml(m.sender_label || "—") + '</header>'
        : "") +
      '<div class="dash-msg-body">' + escapeHtml(m.body || "") + '</div>' +
      '<footer class="dash-msg-time">' + escapeHtml(date + " · " + time) + '</footer>';

    row.appendChild(bubble);
    return row;
  }

  // ---------- Helpers ----------

  function ensureChartJs() {
    if (window.Chart) return Promise.resolve();
    if (chartJsLoading) return chartJsLoading;
    chartJsLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = CHART_JS_URL;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return chartJsLoading;
  }

  function statChip(icon, text) {
    return '<span class="dash-chip"><i data-lucide="' + icon + '"></i>' + escapeHtml(text) + '</span>';
  }

  function showError(msg) {
    var el = document.getElementById("dash-error");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function hideError() {
    var el = document.getElementById("dash-error");
    if (el) el.classList.add("hidden");
  }

  function intFmt(v) {
    return Number(v || 0).toLocaleString();
  }

  function numFmt(v) {
    var n = Number(v);
    if (!isFinite(n)) return "—";
    return n.toFixed(2);
  }

  function formatDuration(seconds) {
    var s = Math.max(0, Math.round(seconds));
    if (s < 60) return s + "s";
    var m = Math.round(s / 60);
    if (m < 60) return m + " min";
    var h = Math.floor(m / 60);
    var mm = m % 60;
    return h + "h " + (mm ? mm + "m" : "");
  }

  function formatMB(bytes) {
    var mb = Number(bytes || 0) / 1048576;
    if (mb === 0) return "0 MB";
    if (mb < 0.1) return mb.toFixed(2) + " MB";
    return mb.toFixed(1) + " MB";
  }

  function formatMin(min) {
    var n = Math.max(0, Number(min || 0));
    if (n < 60) return n + " min";
    var h = Math.floor(n / 60);
    var rem = n % 60;
    return h + "h " + (rem ? rem + "m" : "");
  }

  function formatDateRange(startIso, endIso) {
    var s = new Date(startIso);
    var e = new Date(endIso);
    var sameDay = s.toDateString() === e.toDateString();
    var dateStr = s.toLocaleDateString();
    var timeStart = s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    var timeEnd = e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return sameDay
      ? dateStr + " · " + timeStart + " – " + timeEnd
      : s.toLocaleString() + " → " + e.toLocaleString();
  }

  function formatBucketLabel(iso) {
    var d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
})();
