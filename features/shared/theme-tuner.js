/**
 * Theme Tuner — Live CSS variable editor for admin color tuning.
 * Floating panel with color pickers that update in real-time.
 * Toggle with: ABNThemeTuner.toggle() or Ctrl+Shift+T
 */
(function initThemeTuner(global) {
  var TUNABLE_VARS = [
    { key: "--color-bg-base", label: "BG Base" },
    { key: "--color-bg-surface", label: "BG Surface" },
    { key: "--color-bg-raised", label: "BG Raised" },
    { key: "--color-text-primary", label: "Text Primary" },
    { key: "--color-text-secondary", label: "Text Secondary" },
    { key: "--color-text-muted", label: "Text Muted" },
    { key: "--color-border-subtle", label: "Border Subtle" },
    { key: "--color-border-strong", label: "Border Strong" },
    { key: "--color-accent", label: "Accent" },
    { key: "--color-accent-soft", label: "Accent Soft" },
    { key: "--color-success", label: "Success" },
    { key: "--color-warning", label: "Warning" },
    { key: "--color-danger", label: "Danger" },
    { key: "--color-danger-soft", label: "Danger Soft" },
    { key: "--color-text-on-accent", label: "Text on Accent" },
    { key: "--color-info", label: "Info" },
    { key: "--color-info-soft", label: "Info Soft" },
  ];

  var panelEl = null;
  var isOpen = false;
  var originalValues = {};

  function getComputedVar(key) {
    return getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  }

  function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function resolveToHex(cssValue) {
    if (!cssValue) return "#000000";
    var trimmed = cssValue.trim();

    if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) {
      if (trimmed.length === 4) {
        return "#" + trimmed[1] + trimmed[1] + trimmed[2] + trimmed[2] + trimmed[3] + trimmed[3];
      }
      return trimmed.slice(0, 7);
    }

    var rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
      return rgbToHex(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]));
    }

    var tmp = document.createElement("div");
    tmp.style.color = trimmed;
    tmp.style.display = "none";
    document.body.appendChild(tmp);
    var computed = getComputedStyle(tmp).color;
    tmp.remove();
    var match = computed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!match) return "#000000";
    return rgbToHex(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
  }

  /**
   * Propagate a CSS variable change to all same-origin iframes.
   */
  function setVarEverywhere(key, value) {
    document.documentElement.style.setProperty(key, value);
    document.querySelectorAll("iframe").forEach(function (iframe) {
      try {
        var doc = iframe.contentDocument;
        if (doc) doc.documentElement.style.setProperty(key, value);
      } catch (_e) { /* cross-origin */ }
    });
  }

  function removeVarEverywhere(key) {
    document.documentElement.style.removeProperty(key);
    document.querySelectorAll("iframe").forEach(function (iframe) {
      try {
        var doc = iframe.contentDocument;
        if (doc) doc.documentElement.style.removeProperty(key);
      } catch (_e) { /* cross-origin */ }
    });
  }

  function refreshRow(key) {
    if (!panelEl) return;
    var picker = panelEl.querySelector('.theme-tuner-picker[data-var="' + key + '"]');
    var hexInput = panelEl.querySelector('.theme-tuner-hex[data-var="' + key + '"]');
    if (!picker || !hexInput) return;
    var hex = resolveToHex(getComputedVar(key));
    picker.value = hex;
    hexInput.value = hex;
  }

  function buildPanel() {
    if (panelEl) return;

    panelEl = document.createElement("div");
    panelEl.className = "theme-tuner";

    var header =
      '<div class="theme-tuner-header">' +
      '<span class="theme-tuner-title">Theme Tuner</span>' +
      '<div class="theme-tuner-actions">' +
      '<button class="theme-tuner-btn" id="tt-reset" title="Restaurar todos">Reset</button>' +
      '<button class="theme-tuner-btn theme-tuner-btn--accent" id="tt-copy" title="Copiar valores">Copiar</button>' +
      '<button class="theme-tuner-close" id="tt-close" aria-label="Cerrar">&times;</button>' +
      "</div></div>";

    var rows = TUNABLE_VARS.map(function (v) {
      var current = getComputedVar(v.key);
      var hex = resolveToHex(current);
      originalValues[v.key] = current;

      return (
        '<div class="theme-tuner-row" data-token="' + v.key + '">' +
        '<label class="theme-tuner-label">' + v.label + "</label>" +
        '<div class="theme-tuner-controls">' +
        '<input type="color" class="theme-tuner-picker" data-var="' + v.key + '" value="' + hex + '">' +
        '<input type="text" class="theme-tuner-hex" data-var="' + v.key + '" value="' + hex + '" spellcheck="false">' +
        '<button class="theme-tuner-row-reset" data-var="' + v.key + '" title="Restaurar este token">&#8634;</button>' +
        "</div></div>"
      );
    }).join("");

    panelEl.innerHTML = header + '<div class="theme-tuner-body">' + rows + "</div>";
    document.body.appendChild(panelEl);

    // Color picker / hex input change
    panelEl.addEventListener("input", function (e) {
      var picker = e.target.closest(".theme-tuner-picker");
      var hexInput = e.target.closest(".theme-tuner-hex");

      if (picker) {
        var varName = picker.dataset.var;
        setVarEverywhere(varName, picker.value);
        var sibling = picker.parentNode.querySelector(".theme-tuner-hex");
        if (sibling) sibling.value = picker.value;
      }

      if (hexInput) {
        var val = hexInput.value.trim();
        if (/^#[0-9a-f]{6}$/i.test(val)) {
          var vName = hexInput.dataset.var;
          setVarEverywhere(vName, val);
          var siblingPicker = hexInput.parentNode.querySelector(".theme-tuner-picker");
          if (siblingPicker) siblingPicker.value = val;
        }
      }
    });

    // Per-row reset
    panelEl.addEventListener("click", function (e) {
      var resetBtn = e.target.closest(".theme-tuner-row-reset");
      if (!resetBtn) return;
      var key = resetBtn.dataset.var;
      removeVarEverywhere(key);
      refreshRow(key);
    });

    // Close
    panelEl.querySelector("#tt-close").addEventListener("click", function () {
      toggle();
    });

    // Global reset
    panelEl.querySelector("#tt-reset").addEventListener("click", function () {
      TUNABLE_VARS.forEach(function (v) {
        removeVarEverywhere(v.key);
      });
      TUNABLE_VARS.forEach(function (v) {
        refreshRow(v.key);
      });
    });

    // Copy
    panelEl.querySelector("#tt-copy").addEventListener("click", function () {
      var themeName =
        document.documentElement.getAttribute("data-app-theme") ||
        document.body.getAttribute("data-app-theme") ||
        "dark";
      var lines = ["/* Theme: " + themeName + " */"];
      TUNABLE_VARS.forEach(function (v) {
        var hex = resolveToHex(getComputedVar(v.key));
        lines.push("  " + v.key + ": " + hex + ";");
      });
      var text = lines.join("\n");
      navigator.clipboard.writeText(text).then(function () {
        var btn = panelEl.querySelector("#tt-copy");
        var original = btn.textContent;
        btn.textContent = "Copiado!";
        setTimeout(function () {
          btn.textContent = original;
        }, 1500);
      });
    });

    // Draggable
    makeDraggable(panelEl, panelEl.querySelector(".theme-tuner-header"));
  }

  function makeDraggable(el, handle) {
    var offsetX = 0;
    var offsetY = 0;
    var dragging = false;

    handle.addEventListener("mousedown", function (e) {
      if (e.target.closest("button")) return;
      dragging = true;
      offsetX = e.clientX - el.getBoundingClientRect().left;
      offsetY = e.clientY - el.getBoundingClientRect().top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      el.style.left = (e.clientX - offsetX) + "px";
      el.style.top = (e.clientY - offsetY) + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
    });

    document.addEventListener("mouseup", function () {
      dragging = false;
    });
  }

  function toggle() {
    if (!panelEl) buildPanel();
    isOpen = !isOpen;
    panelEl.classList.toggle("open", isOpen);
  }

  // Keyboard shortcut: Ctrl+Shift+T
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.shiftKey && e.key === "T") {
      e.preventDefault();
      toggle();
    }
  });

  global.ABNThemeTuner = {
    toggle: toggle,
  };
})(window);
