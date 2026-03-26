(function initSharedContactDocumentType(global) {
  var root = (global.ABNShared = global.ABNShared || {});
  var registry = root.documentTypes;

  if (!registry?.register) return;

  function escapeHtml(value) {
    if (typeof global.escapeHtml === "function") return global.escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function contactScreen() {
    return root.contactScreen || null;
  }

  function tagSystem() {
    return root.tags || null;
  }

  function getContactTypeLabel(type) {
    return contactScreen()?.getContactTypeLabel?.(type) || type || "";
  }

  function renderTagsMarkup(tags) {
    var list = Array.isArray(tags)
      ? tags.map(function (tag) { return String(tag || "").trim(); }).filter(Boolean)
      : [];
    if (!list.length) return "";

    var sharedTags = tagSystem();
    var normalized = sharedTags?.dedupe ? sharedTags.dedupe(list) : list;

    return '<div class="abn-tag-list">' + normalized
      .map(function (tag) {
        var label = sharedTags?.formatLabel
          ? sharedTags.formatLabel(tag, { displayMode: "title" })
          : tag;
        var className = sharedTags ? "abn-tag" : "da-tag";
        return '<span class="' + className + '">' + escapeHtml(label) + '</span>';
      })
      .join("") + '</div>';
  }

  function toPlainText(markdown) {
    return String(markdown || "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_~`>#-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatRelativeDate(isoStr) {
    if (!isoStr) return "";
    var date = new Date(isoStr);
    var now = new Date();
    var diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Hoy";
    if (diffDays === 1) return "Ayer";
    if (diffDays < 30) return "Hace " + diffDays + " días";
    var months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return date.getDate() + " " + months[date.getMonth()] + " " + date.getFullYear();
  }

  function normalizeRow(row) {
    return {
      id: row.id,
      chronicle_id: row.chronicle_id,
      character_sheet_id: row.character_sheet_id,
      player_id: row.player_id,
      name: row.name || "Sin nombre",
      description: row.description || "",
      contact_type: row.contact_type || "mortal",
      vinculo_sangre: row.vinculo_sangre || 0,
      domitor: row.domitor || "",
      stats: row.stats || {},
      tags: Array.isArray(row.tags) ? row.tags : [],
      avatar_url: row.avatar_url || null,
      is_archived: Boolean(row.is_archived),
      is_favorite: Boolean(row.is_favorite),
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || row.created_at || new Date().toISOString(),
    };
  }

  async function fetchRows(ctx) {
    var supabase = global.supabase;
    if (!supabase || !ctx.characterSheetId) return [];

    var result = await supabase
      .from("character_contacts")
      .select("*")
      .eq("character_sheet_id", ctx.characterSheetId)
      .order("is_favorite", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (result.error) {
      console.error("ContactDocumentType: fetch error", result.error);
      return [];
    }

    return (result.data || []).map(normalizeRow);
  }

  function filterRows(rows, query, _ctx, filters) {
    var source = Array.isArray(rows) ? rows : [];
    var normalizedQuery = String(query || "").trim().toLowerCase();
    var sharedTags = tagSystem();
    var selectedTag = String((filters || {}).selectedTag || "").trim().toLowerCase();
    if (!normalizedQuery && !selectedTag) return source;

    return source.filter(function (row) {
      var haystack = (row.name + " " + row.description + " " + (row.tags || []).join(" ") + " " + row.contact_type).toLowerCase();
      var tags = Array.isArray(row?.tags) ? row.tags : [];
      var matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
      var matchesTag =
        !selectedTag ||
        tags.some(function (tag) {
          var normalizedTag = sharedTags?.createTagKey
            ? sharedTags.createTagKey(tag)
            : String(tag || "").trim().toLowerCase();
          return normalizedTag === selectedTag;
        });
      return matchesQuery && matchesTag;
    });
  }

  function getTagFilterStats(rows, _ctx, filters) {
    var sharedTags = tagSystem();
    if (!sharedTags?.collectStats) return [];

    return sharedTags.collectStats(rows, {
      getTags: function (row) { return row?.tags; },
      selectedTag: (filters || {}).selectedTag || null,
      selectedLabel: (filters || {}).selectedTagLabel || "",
    });
  }

  function buildDetailedListItemOptions(row) {
    var plain = toPlainText(row?.description || "");
    var preview = root.documentList?.buildPreviewText
      ? root.documentList.buildPreviewText(plain, { maxLines: 3 })
      : plain;
    var metaParts = [
      getContactTypeLabel(row?.contact_type),
      row?.vinculo_sangre > 0 ? "Vínculo: " + (contactScreen()?.VINCULO_LABELS?.[row.vinculo_sangre] || "") : null,
      formatRelativeDate(row?.updated_at || row?.created_at),
    ].filter(Boolean);

    return {
      title: row?.name || "Sin nombre",
      meta: metaParts.join(" · "),
      tagsHtml: renderTagsMarkup(row?.tags),
      preview: preview,
    };
  }

  function getVitaeFromStats(stats) {
    if (!stats?.groups) return 0;
    for (var i = 0; i < stats.groups.length; i++) {
      var fields = stats.groups[i].fields;
      for (var j = 0; j < fields.length; j++) {
        if (fields[j].name === "Vitae") return fields[j].value || 0;
      }
    }
    return 0;
  }

  function renderVitaeSquares(value) {
    var MAX = 10;
    var html = '';
    for (var i = 1; i <= MAX; i++) {
      html += '<span class="ct-blood-square' + (i <= value ? ' ct-blood-square--filled' : '') + '"></span>';
    }
    return '<span class="ct-blood-track">' + html + '</span>';
  }

  function renderCard(row) {
    var plain = toPlainText(row.description || "");
    var lines = plain.split(/\n/).slice(0, 5).join("\n");
    var preview = lines.length > 240 ? lines.slice(0, 240) + "…" : lines;
    var favClass = row.is_favorite ? " objeto-fav--active" : "";

    var vinculoDots = contactScreen()?.renderVinculoDots
      ? contactScreen().renderVinculoDots(row.vinculo_sangre || 0, { inline: true })
      : "";
    var domitorHtml = row.domitor
      ? 'Domitor: ' + escapeHtml(row.domitor)
      : "";
    var vitaeValue = getVitaeFromStats(row.stats);

    /* Footer line: Vínculo + Domitor */
    var footerParts = [];
    footerParts.push('Vínculo: ' + vinculoDots);
    if (domitorHtml) footerParts.push(domitorHtml);
    var footerLine = footerParts.join(' &nbsp;·&nbsp; ');

    var avatarPos = row.stats?.avatarPosition || { x: 50, y: 50, scale: 1 };
    var avatarHtml = row.avatar_url
      ? '<div class="contacto-archive-avatar" style="background-image:url(' + escapeHtml(row.avatar_url) + ');background-position:' + (avatarPos.x || 50) + '% ' + (avatarPos.y || 50) + '%;background-size:' + ((avatarPos.scale || 1) * 100) + '%"></div>'
      : '';

    return '' +
      '<article class="contacto-archive-card" data-document-id="' + escapeHtml(row.id) + '">' +
        '<div class="contacto-archive-top">' +
          avatarHtml +
          '<div class="contacto-archive-info">' +
            '<div class="contacto-archive-head">' +
              '<h3 class="contacto-archive-name">' + escapeHtml(row.name) + '</h3>' +
              '<button type="button" class="objeto-fav-btn' + favClass + '" data-fav-id="' + escapeHtml(row.id) + '" title="' + (row.is_favorite ? "Quitar de favoritos" : "Marcar como favorito") + '" aria-label="' + (row.is_favorite ? "Quitar de favoritos" : "Marcar como favorito") + '">' +
                '<i data-lucide="star" class="objeto-fav-icon"></i>' +
              '</button>' +
            '</div>' +
            '<p class="contacto-archive-meta">' +
              '<span class="contacto-type-badge contacto-type-badge--' + escapeHtml(row.contact_type) + '">' + escapeHtml(getContactTypeLabel(row.contact_type)) + '</span> ' +
              escapeHtml(formatRelativeDate(row.updated_at || row.created_at)) +
            '</p>' +
            renderTagsMarkup(row.tags) +
          '</div>' +
        '</div>' +
        (preview ? '<p class="contacto-archive-preview">' + escapeHtml(preview) + '</p>' : '') +
        '<div class="contacto-archive-footer">' +
          '<div class="contacto-archive-footer-line">' + footerLine + '</div>' +
          '<div class="contacto-archive-footer-line">Vitae: ' + renderVitaeSquares(vitaeValue) + '</div>' +
        '</div>' +
      '</article>';
  }

  async function openCreate(ctx, helpers) {
    if (!ctx.currentPlayerId || !ctx.chronicleId || !ctx.characterSheetId) return;

    var supabase = global.supabase;

    contactScreen()?.openForm?.({
      title: "Nuevo Contacto",
      persistence: {
        type: "character-contact",
        supabase: supabase,
        chronicleId: ctx.chronicleId,
        characterSheetId: ctx.characterSheetId,
        playerId: ctx.currentPlayerId,
        errorMessagePrefix: "No se pudo guardar el contacto",
      },
      onSaved: async function (result) {
        await helpers?.refresh?.();
        if (result?.contactId) {
          contactScreen()?.showForPlayer?.({
            contactId: result.contactId,
            characterSheetId: ctx.characterSheetId,
            onSaved: function () { helpers?.refresh?.(); },
          });
        }
      },
    });
  }

  async function handleListClick(event, ctx, helpers) {
    var favBtn = event.target.closest("[data-fav-id]");
    if (favBtn?.dataset.favId) {
      event.preventDefault();
      event.stopPropagation();
      await toggleFavorite(favBtn.dataset.favId, helpers);
      return true;
    }

    /* Vitae blood square click — toggle without opening viewer */
    var square = event.target.closest(".ct-blood-square");
    if (square) {
      event.preventDefault();
      event.stopPropagation();
      var card = square.closest("[data-document-id]");
      var contactId = card?.dataset.documentId;
      if (!contactId) return true;

      var row = (helpers?.allRows || []).find(function (r) { return String(r.id) === String(contactId); });
      if (!row) return true;

      var idx = Array.from(square.parentNode.children).indexOf(square) + 1;
      var oldVitae = getVitaeFromStats(row.stats);
      var newVitae = (oldVitae === idx) ? idx - 1 : idx;

      /* Update local stats */
      setVitaeInStats(row.stats, newVitae);

      /* Re-render squares in this card */
      var track = square.parentNode;
      track.innerHTML = "";
      for (var i = 1; i <= 10; i++) {
        var sq = document.createElement("span");
        sq.className = "ct-blood-square" + (i <= newVitae ? " ct-blood-square--filled" : "");
        track.appendChild(sq);
      }

      /* Persist to DB */
      var supabase = global.supabase;
      if (supabase) {
        supabase
          .from("character_contacts")
          .update({ stats: row.stats, updated_at: new Date().toISOString() })
          .eq("id", contactId)
          .then(function (res) {
            if (res.error) console.error("Vitae save error:", res.error);
          });
      }
      return true;
    }

    var card = event.target.closest("[data-document-id]");
    if (!card?.dataset.documentId) return false;

    contactScreen()?.showForPlayer?.({
      contactId: card.dataset.documentId,
      characterSheetId: ctx.characterSheetId,
      onSaved: function () { helpers?.refresh?.(); },
    });
    return true;
  }

  function setVitaeInStats(stats, value) {
    if (!stats?.groups) return;
    for (var i = 0; i < stats.groups.length; i++) {
      var fields = stats.groups[i].fields;
      for (var j = 0; j < fields.length; j++) {
        if (fields[j].name === "Vitae") {
          fields[j].value = value;
          return;
        }
      }
    }
  }

  async function toggleFavorite(contactId, helpers) {
    var supabase = global.supabase;
    if (!supabase || !contactId) return;

    var rows = Array.isArray(helpers?.allRows) ? helpers.allRows : [];
    var row = rows.find(function (r) { return String(r.id) === String(contactId); });
    var nextFavorite = !Boolean(row?.is_favorite);

    var result = await supabase
      .from("character_contacts")
      .update({ is_favorite: nextFavorite })
      .eq("id", contactId);

    if (result.error) {
      console.error("ContactDocumentType: toggle favorite error", result.error);
      return;
    }

    await helpers?.refresh?.();
  }

  registry.register("contacto", {
    getArchiveTitle: function (ctx) {
      return "Archivo de Contactos · " + (ctx.chronicle?.name || "Crónica");
    },
    getArchiveSubtitle: function () {
      return "Contactos de tu personaje";
    },
    getSearchPlaceholder: function () {
      return "Buscar por nombre, tipo o tag...";
    },
    getCreateLabel: function () {
      return "Nuevo Contacto";
    },
    canCreate: function (ctx) {
      return Boolean(ctx.characterSheetId && ctx.currentPlayerId);
    },
    getPageSize: function () {
      return 12;
    },
    getListLayout: function () {
      return "grid";
    },
    getEmptyMessage: function (_ctx, opts) {
      if (opts?.query) return "Sin resultados.";
      return "No hay contactos registrados.";
    },
    buildDetailedListItemOptions: buildDetailedListItemOptions,
    fetchRows: fetchRows,
    filterRows: filterRows,
    getTagFilterStats: getTagFilterStats,
    renderCard: renderCard,
    openCreate: openCreate,
    handleListClick: handleListClick,
  });
})(window);
