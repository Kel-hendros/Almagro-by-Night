# Dock Pagination + Rituals Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add paginated dock tabs (2 pages of 6 slots) and a Rituals CRUD system grouped by discipline.

**Architecture:** Pure vanilla JS/HTML/CSS. No frameworks, no build step. Three files change: `index.html` (structure), `style.css` (styles), `script.js` (logic). The rituals system follows the existing merits/defects CRUD pattern. The discipline modal gains a single-select mode via options parameter.

**Tech Stack:** Vanilla JS, HTML5, CSS3, Supabase (existing save/load)

---

### Task 1: HTML — Dock pager widget + page wrappers

**Files:**
- Modify: `characterSheets/index.html:591-599`

**Step 1: Add pager and wrap existing tabs in page 1**

Replace the `<div class="dock-tabs">` block (lines 591-599) with this structure:

```html
<div class="dock-pager">
    <button class="dock-pager-btn" id="dock-prev" type="button" aria-label="Página anterior">‹</button>
    <span class="dock-dots">
        <span class="dock-dot active" data-page="0"></span>
        <span class="dock-dot" data-page="1"></span>
    </span>
    <button class="dock-pager-btn" id="dock-next" type="button" aria-label="Página siguiente">›</button>
</div>
<div class="dock-tabs">
    <div class="dock-tab-page active" data-page="0">
        <button class="dock-tab active" data-panel="panel-disciplinas">Disciplinas</button>
        <button class="dock-tab" data-panel="panel-virtudes">Virtudes</button>
        <button class="dock-tab" data-panel="panel-trasfondos">Trasfondos</button>
        <button class="dock-tab" data-panel="panel-meritos-defectos">Méritos y Defectos</button>
        <button class="dock-tab" data-panel="panel-experiencia">Experiencia</button>
        <button class="dock-tab" data-panel="panel-notas">Notas</button>
    </div>
    <div class="dock-tab-page" data-page="1">
        <button class="dock-tab" data-panel="panel-rituales">Rituales</button>
        <button class="dock-tab" data-panel="panel-armas">Armas</button>
        <div class="dock-tab-placeholder"></div>
        <div class="dock-tab-placeholder"></div>
        <div class="dock-tab-placeholder"></div>
        <div class="dock-tab-placeholder"></div>
    </div>
</div>
```

**Step 2: Verify syntax**

Run: `node --check characterSheets/script.js`
Expected: no output (success). Also open the file in browser — the page should render without JS errors. Only page 1 tabs should be visible (page 2 hidden by CSS, which we add next).

---

### Task 2: HTML — New panels for Rituales and Armas

**Files:**
- Modify: `characterSheets/index.html` — insert after `panel-notas` section (after line ~793)

**Step 1: Add Rituales panel**

Insert before the closing `</div>` of `.dock-content`:

```html
<!-- TAB: RITUALES -->
<section class="dock-panel" id="panel-rituales">
    <div class="background-pane">
        <div class="discipline-powers-header">
            <h3>Rituales</h3>
            <button id="ritual-add-toggle" class="discipline-power-header-add" type="button" aria-label="Agregar ritual">+</button>
        </div>
        <form id="ritual-add-form" class="background-form hidden">
            <input id="ritual-name" type="text" placeholder="Nombre del ritual" autocomplete="off" required>
            <input id="ritual-level" type="number" min="1" step="1" value="1" placeholder="Nivel">
            <button id="ritual-discipline-btn" class="ritual-discipline-select" type="button">Seleccionar disciplina...</button>
            <input id="ritual-discipline-id" type="hidden" value="">
            <textarea id="ritual-description" rows="3" placeholder="Descripción del ritual (opcional)"></textarea>
            <div class="form-actions">
                <button type="submit" class="background-save-btn">Guardar ritual</button>
                <button id="ritual-add-cancel" type="button" class="form-cancel-btn">Cancelar</button>
            </div>
        </form>
        <div id="ritual-list" class="background-list"></div>
    </div>
</section>

<!-- TAB: ARMAS -->
<section class="dock-panel" id="panel-armas">
    <div class="background-pane">
        <p class="specialty-subtitle" style="text-align:center; margin:32px 0;">Próximamente: sistema de armas.</p>
    </div>
</section>
```

**Step 2: Verify**

Open in browser. The new panels should exist in the DOM but not be visible (no `.active` class). No console errors.

**Step 3: Commit**

```bash
git add characterSheets/index.html
git commit -m "feat: add dock pager widget, page wrappers, ritual/weapon panels

HTML structure for paginated dock tabs. Page 1 wraps existing 6 tabs,
page 2 has Rituales + Armas + 4 placeholders. New panel sections added."
```

---

### Task 3: CSS — Pager, pages, and placeholder styles

**Files:**
- Modify: `characterSheets/style.css` — insert after `.dock-tabs` block (after line ~2334)

**Step 1: Add pager styles**

Insert after the `.dock-tabs { ... }` rule (line ~2334):

```css
/* Dock pager navigation */
.dock-pager {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 4px 0;
}

.dock-pager-btn {
	background: transparent;
	border: 1px solid var(--ui-border);
	color: var(--muted);
	width: 24px;
	height: 24px;
	border-radius: 50%;
	cursor: pointer;
	font-size: 14px;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: color 0.15s, border-color 0.15s;
}

.dock-pager-btn:hover {
	color: var(--accent);
	border-color: var(--ui-border-strong);
}

.dock-dots {
	display: flex;
	gap: 6px;
	align-items: center;
}

.dock-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--ui-border);
	cursor: pointer;
	transition: background 0.15s;
}

.dock-dot.active {
	background: var(--accent);
}

/* Dock tab pages */
.dock-tab-page {
	display: none;
	grid-template-columns: 1fr 1fr;
	grid-auto-rows: minmax(0, auto);
	gap: 8px;
}

.dock-tab-page.active {
	display: grid;
}

/* Placeholder slots */
.dock-tab-placeholder {
	border: 1px dashed var(--ui-border);
	border-radius: 8px;
	background: transparent;
	opacity: 0.3;
	min-height: 32px;
}
```

**Step 2: Update .dock-tabs to remove its grid**

The `.dock-tabs` block (line ~2324) currently has `display: grid` and `grid-template-columns`. Since the grid now lives inside `.dock-tab-page`, update `.dock-tabs`:

```css
.dock-tabs {
	display: flex;
	flex-direction: column;
	gap: 0;
	height: 150px;
	overflow: visible;
	padding-right: 2px;
}
```

Remove these properties from `.dock-tabs`: `grid-template-columns`, `grid-auto-rows`, `align-content`, `justify-content`, `gap: 8px`.

**Step 3: Update mobile responsive rule**

Find the media query rule for `.dock-tabs` at ~line 4540 that sets `grid-template-columns: 1fr`. Change it to target `.dock-tab-page` instead:

```css
@media (max-width: 768px) {
    .dock-tab-page {
        grid-template-columns: 1fr;
    }
}
```

**Step 4: Verify**

Open in browser. Page 1 tabs should display in 2-column grid. Pager widget visible above tabs with dots. Click nothing yet — just check visual layout.

**Step 5: Commit**

```bash
git add characterSheets/style.css
git commit -m "style: add dock pager, tab page, and placeholder CSS

Pager dots + arrows, tab page grid replaces dock-tabs grid,
placeholder slots with dashed border, responsive breakpoint updated."
```

---

### Task 4: CSS — Ritual accordion and form styles

**Files:**
- Modify: `characterSheets/style.css` — insert after merit/defect styles (after line ~3040)

**Step 1: Add ritual-specific styles**

```css
/* Ritual discipline select button (in form) */
.ritual-discipline-select {
	background: var(--ui-surface);
	border: 1px solid var(--ui-border);
	color: var(--muted);
	padding: 6px 10px;
	border-radius: 8px;
	cursor: pointer;
	text-align: left;
	font-size: 0.85rem;
	transition: border-color 0.15s;
}

.ritual-discipline-select:hover {
	border-color: var(--ui-border-strong);
}

.ritual-discipline-select.has-value {
	color: var(--text);
	border-color: var(--accent);
}

/* Ritual discipline group headers */
.ritual-group {
	margin-bottom: 8px;
}

.ritual-group-header {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 10px;
	background: var(--ui-surface);
	border: 1px solid var(--ui-border);
	border-radius: 10px;
	cursor: pointer;
	font-weight: 600;
	font-size: 0.85rem;
	color: var(--text);
	transition: background 0.15s;
	width: 100%;
	text-align: left;
}

.ritual-group-header:hover {
	background: var(--ui-accent-subtle);
}

.ritual-group-header::before {
	content: "▸";
	font-size: 0.75rem;
	transition: transform 0.15s;
}

.ritual-group.open .ritual-group-header::before {
	transform: rotate(90deg);
}

.ritual-group-body {
	display: none;
	padding: 4px 0 0 0;
}

.ritual-group.open .ritual-group-body {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

/* Ritual level badge */
.ritual-level-badge {
	background: var(--accent);
	color: var(--bg);
	font-size: 0.7rem;
	font-weight: 700;
	padding: 1px 6px;
	border-radius: 10px;
	min-width: 20px;
	text-align: center;
}
```

**Step 2: Commit**

```bash
git add characterSheets/style.css
git commit -m "style: add ritual accordion and form styles

Discipline group headers with expand/collapse arrow, level badges,
discipline selector button styling."
```

---

### Task 5: JS — Dock pager logic

**Files:**
- Modify: `characterSheets/script.js` — update dock tab switching section (~line 5928)

**Step 1: Add pager state and switching logic**

Replace the existing dock tab switching block (lines 5928-5940) with:

```javascript
// ── Dock Pager ──
let currentDockPage = 0;

function switchDockPage(pageIndex) {
  const pages = document.querySelectorAll('.dock-tab-page');
  const dots = document.querySelectorAll('.dock-dot');
  if (pageIndex < 0 || pageIndex >= pages.length) return;
  currentDockPage = pageIndex;
  pages.forEach(p => p.classList.remove('active'));
  dots.forEach(d => d.classList.remove('active'));
  pages[pageIndex].classList.add('active');
  dots[pageIndex].classList.add('active');

  // If the currently active panel belongs to the hidden page, activate
  // the first real tab of the newly visible page.
  const activePage = pages[pageIndex];
  const activeTab = activePage.querySelector('.dock-tab.active');
  if (!activeTab) {
    const firstTab = activePage.querySelector('.dock-tab');
    if (firstTab) firstTab.click();
  }
}

document.getElementById('dock-prev')?.addEventListener('click', () => switchDockPage(currentDockPage - 1));
document.getElementById('dock-next')?.addEventListener('click', () => switchDockPage(currentDockPage + 1));

document.querySelectorAll('.dock-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    const page = parseInt(dot.getAttribute('data-page'), 10);
    switchDockPage(page);
  });
});

// ── Dock Tabs ──
const dockTabs = document.querySelectorAll('.dock-tab');
dockTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const panelId = tab.getAttribute('data-panel');
    dockTabs.forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dock-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add('active');
  });
});
```

**Step 2: Verify**

Run: `node --check characterSheets/script.js`
Expected: no output (success).

Open in browser: clicking `›` should switch to page 2 showing "Rituales" and "Armas" tabs + 4 placeholders. Clicking a tab on page 2 should show its panel. `‹` returns to page 1. Dots update on page change.

**Step 3: Commit**

```bash
git add characterSheets/script.js
git commit -m "feat: add dock pager switching logic

switchDockPage() handles page visibility, dot indicators, and
auto-activates first tab when switching to a new page."
```

---

### Task 6: JS — Discipline modal single-select mode

**Files:**
- Modify: `characterSheets/script.js:3867-3950` (the `initDisciplineRepoModal` function)

**Step 1: Extract openModal and refactor for mode support**

The `openModal()` function (inside `initDisciplineRepoModal`) needs to accept an options parameter. The key changes:

1. Move `openModal` and `closeModal` to module-level variables so rituals can call them.
2. Add mode parameter support.

At the top of `initDisciplineRepoModal`, after existing variable declarations, add:

```javascript
let modalMode = "multi"; // "multi" or "single"
let modalOnSelect = null; // callback for single-select mode
```

Modify `openModal` to accept options:

```javascript
function openModal(options = {}) {
    modalMode = options.mode || "multi";
    modalOnSelect = options.onSelect || null;
    // Sync working set with current state (only in multi mode)
    if (modalMode === "multi") {
      modalSelection = new Set(selectedDisciplines.map(d => d.id));
    } else {
      modalSelection = new Set();
    }
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    // Show/hide apply button based on mode
    applyBtn.style.display = modalMode === "single" ? "none" : "";
    searchInput.value = "";
    renderRepository("");
    searchInput.focus();
}
```

In `renderRepository`, modify the click handler on each discipline button:

```javascript
button.addEventListener("click", () => {
    if (modalMode === "single") {
      // Single-select: call back immediately and close
      if (modalOnSelect) modalOnSelect(d.id);
      closeModal();
      return;
    }
    // Multi-select: toggle as before
    if (modalSelection.has(d.id)) {
      modalSelection.delete(d.id);
    } else {
      modalSelection.add(d.id);
    }
    renderRepository(searchInput.value.trim().toLowerCase());
});
```

Expose `openModal` globally for rituals to use:

```javascript
window.openDisciplineModal = openModal;
```

Put this line at the end of `initDisciplineRepoModal`, after all event listener wiring.

**Step 2: Keep existing behavior intact**

The existing `openBtn` click listener now calls `openModal()` with no args, which defaults to `mode: "multi"` — no change in behavior for disciplines.

**Step 3: Verify**

Run: `node --check characterSheets/script.js`
Open in browser. The existing discipline modal should still work exactly as before (multi-select + Aplicar button).

**Step 4: Commit**

```bash
git add characterSheets/script.js
git commit -m "feat: add single-select mode to discipline modal

openModal() accepts { mode, onSelect } options. Single mode hides
Aplicar button and calls onSelect(id) on click. Exposed as
window.openDisciplineModal for ritual system."
```

---

### Task 7: JS — Ritual data model, save/load, and CRUD

**Files:**
- Modify: `characterSheets/script.js`

**Step 1: Add ritual data model**

Insert near the other data arrays (near `characterMerits`/`characterDefects` declarations, around line ~5124):

```javascript
let characterRituals = [];
// Each entry: { name: string, level: number, disciplineId: number, description: string }
```

**Step 2: Add getRitualsData and loadRitualsFromJSON**

Insert after the defect save/load functions (~after line 5339):

```javascript
function getRitualsData() {
  return characterRituals.map(r => ({
    name: r.name,
    level: r.level,
    disciplineId: r.disciplineId,
    description: r.description || ""
  }));
}

function loadRitualsFromJSON(characterData) {
  characterRituals = [];
  if (characterData.rituals && Array.isArray(characterData.rituals)) {
    characterData.rituals.forEach(r => {
      characterRituals.push({
        name: r.name || "",
        level: r.level || 1,
        disciplineId: r.disciplineId || null,
        description: r.description || ""
      });
    });
  }
  renderRitualList();
}
```

**Step 3: Wire into getCharacterData**

In `getCharacterData()` (~line 810, after the defects line), add:

```javascript
characterData.rituals = getRitualsData();
```

**Step 4: Wire into loadCharacterFromJSON**

In `loadCharacterFromJSON()`, after the "Merits & Defects" safeLoad block, add:

```javascript
safeLoad("Rituals", () => loadRitualsFromJSON(characterData));
```

**Step 5: Verify**

Run: `node --check characterSheets/script.js`
Expected: no output (success).

**Step 6: Commit**

```bash
git add characterSheets/script.js
git commit -m "feat: add ritual data model with save/load integration

characterRituals array, getRitualsData(), loadRitualsFromJSON(),
wired into getCharacterData() and loadCharacterFromJSON()."
```

---

### Task 8: JS — Ritual form wiring and renderRitualList

**Files:**
- Modify: `characterSheets/script.js`

**Step 1: Add renderRitualList function**

Insert after `loadRitualsFromJSON`:

```javascript
function renderRitualList() {
  const listEl = document.getElementById("ritual-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (characterRituals.length === 0) {
    const empty = document.createElement("p");
    empty.className = "specialty-subtitle";
    empty.style.textAlign = "center";
    empty.style.margin = "16px 0";
    empty.textContent = "No hay rituales. Usa + para agregar.";
    listEl.appendChild(empty);
    return;
  }

  // Group by disciplineId
  const groups = {};
  characterRituals.forEach((r, idx) => {
    const key = r.disciplineId || 0;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ ...r, _index: idx });
  });

  // Sort groups by discipline name
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const nameA = getDisciplineName(Number(a));
    const nameB = getDisciplineName(Number(b));
    return nameA.localeCompare(nameB);
  });

  sortedKeys.forEach(key => {
    const discName = Number(key) ? getDisciplineName(Number(key)) : "Sin disciplina";
    const rituals = groups[key].sort((a, b) => a.level - b.level);

    const group = document.createElement("div");
    group.className = "ritual-group";

    // Group header
    const header = document.createElement("button");
    header.className = "ritual-group-header";
    header.type = "button";
    header.textContent = discName;
    header.addEventListener("click", () => group.classList.toggle("open"));

    const body = document.createElement("div");
    body.className = "ritual-group-body";

    rituals.forEach(r => {
      const item = document.createElement("div");
      item.className = "background-item";

      const row = document.createElement("div");
      row.className = "background-row";

      const titleBtn = document.createElement("button");
      titleBtn.className = "background-title-btn";
      titleBtn.type = "button";
      titleBtn.textContent = r.name;
      titleBtn.addEventListener("click", () => item.classList.toggle("open"));

      const levelBadge = document.createElement("span");
      levelBadge.className = "ritual-level-badge";
      levelBadge.textContent = `Nv. ${r.level}`;

      const editBtn = document.createElement("button");
      editBtn.className = "background-edit-btn";
      editBtn.type = "button";
      editBtn.innerHTML = "✎";
      editBtn.title = "Editar ritual";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isEditing = item.classList.contains("editing");
        if (isEditing) {
          item.classList.remove("editing", "open");
          renderRitualList();
          return;
        }
        item.classList.add("editing", "open");
        descEl.innerHTML = "";

        const editForm = document.createElement("form");
        editForm.className = "background-edit-form";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = r.name;
        nameInput.placeholder = "Nombre";
        nameInput.maxLength = 100;

        const levelInput = document.createElement("input");
        levelInput.type = "number";
        levelInput.min = "1";
        levelInput.step = "1";
        levelInput.value = r.level;
        levelInput.placeholder = "Nivel";

        const descInput = document.createElement("textarea");
        descInput.rows = 3;
        descInput.value = r.description || "";
        descInput.placeholder = "Descripción (opcional)";

        // Discipline selector in edit mode
        let editDisciplineId = r.disciplineId;
        const discBtn = document.createElement("button");
        discBtn.type = "button";
        discBtn.className = "ritual-discipline-select" + (editDisciplineId ? " has-value" : "");
        discBtn.textContent = editDisciplineId ? getDisciplineName(editDisciplineId) : "Seleccionar disciplina...";
        discBtn.addEventListener("click", () => {
          if (window.openDisciplineModal) {
            window.openDisciplineModal({
              mode: "single",
              onSelect: (id) => {
                editDisciplineId = id;
                discBtn.textContent = getDisciplineName(id);
                discBtn.classList.add("has-value");
              }
            });
          }
        });

        const actions = document.createElement("div");
        actions.className = "form-actions";
        const saveBtn = document.createElement("button");
        saveBtn.type = "submit";
        saveBtn.className = "background-save-btn";
        saveBtn.textContent = "Guardar";

        editForm.append(nameInput, levelInput, discBtn, descInput, actions);
        actions.appendChild(saveBtn);

        editForm.addEventListener("submit", (ev) => {
          ev.preventDefault();
          const newName = nameInput.value.trim();
          if (!newName) return;
          characterRituals[r._index].name = newName;
          characterRituals[r._index].level = Math.max(1, Number(levelInput.value) || 1);
          characterRituals[r._index].disciplineId = editDisciplineId;
          characterRituals[r._index].description = descInput.value.trim();
          renderRitualList();
          saveCharacterData();
        });

        descEl.appendChild(editForm);
        nameInput.focus();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "background-delete-btn";
      deleteBtn.type = "button";
      deleteBtn.innerHTML = "✕";
      deleteBtn.title = "Eliminar ritual";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        characterRituals.splice(r._index, 1);
        renderRitualList();
        saveCharacterData();
      });

      const descEl = document.createElement("div");
      descEl.className = "background-description";
      descEl.textContent = r.description || "";

      row.append(titleBtn, levelBadge, editBtn, deleteBtn);
      item.append(row, descEl);
      body.appendChild(item);
    });

    group.append(header, body);
    listEl.appendChild(group);
  });
}
```

**Step 2: Add ritual form initialization**

Insert inside the `DOMContentLoaded` block (or wherever merits/defects form wiring happens — near line ~5309), add:

```javascript
// ── Ritual form wiring ──
(function initRitualForm() {
  const toggleBtn = document.getElementById("ritual-add-toggle");
  const form = document.getElementById("ritual-add-form");
  const nameInput = document.getElementById("ritual-name");
  const levelInput = document.getElementById("ritual-level");
  const discBtn = document.getElementById("ritual-discipline-btn");
  const discIdInput = document.getElementById("ritual-discipline-id");
  const descInput = document.getElementById("ritual-description");
  const cancelBtn = document.getElementById("ritual-add-cancel");

  if (!toggleBtn || !form) return;

  toggleBtn.addEventListener("click", () => {
    form.classList.toggle("hidden");
    if (!form.classList.contains("hidden") && nameInput) nameInput.focus();
  });

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      form.classList.add("hidden");
      if (nameInput) nameInput.value = "";
      if (levelInput) levelInput.value = "1";
      if (discIdInput) discIdInput.value = "";
      if (discBtn) {
        discBtn.textContent = "Seleccionar disciplina...";
        discBtn.classList.remove("has-value");
      }
      if (descInput) descInput.value = "";
    });
  }

  // Discipline selector
  if (discBtn) {
    discBtn.addEventListener("click", () => {
      if (window.openDisciplineModal) {
        window.openDisciplineModal({
          mode: "single",
          onSelect: (id) => {
            discIdInput.value = id;
            discBtn.textContent = getDisciplineName(id);
            discBtn.classList.add("has-value");
          }
        });
      }
    });
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = nameInput ? nameInput.value.trim() : "";
    if (!name) return;
    const level = Math.max(1, Number(levelInput ? levelInput.value : 1) || 1);
    const disciplineId = discIdInput ? Number(discIdInput.value) || null : null;
    const description = descInput ? descInput.value.trim() : "";

    characterRituals.push({ name, level, disciplineId, description });
    renderRitualList();
    saveCharacterData();

    // Reset form
    if (nameInput) nameInput.value = "";
    if (levelInput) levelInput.value = "1";
    if (discIdInput) discIdInput.value = "";
    if (discBtn) {
      discBtn.textContent = "Seleccionar disciplina...";
      discBtn.classList.remove("has-value");
    }
    if (descInput) descInput.value = "";
    form.classList.add("hidden");
  });
})();
```

**Step 3: Verify**

Run: `node --check characterSheets/script.js`
Expected: no output (success).

Open in browser:
1. Navigate to page 2 via pager arrows
2. Click "Rituales" tab
3. Click `+` — form should appear with Name, Level, Discipline selector, Description
4. Click "Seleccionar disciplina..." — discipline modal opens in single-select mode (no "Aplicar")
5. Click any discipline — modal closes, button shows discipline name
6. Fill name and submit — ritual appears in list grouped by discipline
7. Refresh page — ritual persists (Supabase save/load)

**Step 4: Commit**

```bash
git add characterSheets/script.js
git commit -m "feat: implement ritual CRUD with discipline-grouped accordion list

renderRitualList() groups by discipline, sorts by level. Add form
with discipline modal single-select integration. Edit/delete inline."
```

---

### Task 9: Final verification and deploy commit

**Step 1: Full syntax check**

Run: `node --check characterSheets/script.js`
Expected: no output (success).

**Step 2: End-to-end manual test**

1. Load app in browser
2. Page 1 tabs: all 6 existing tabs work as before
3. Click `›` arrow — page 2 shows Rituales, Armas, + 4 placeholders
4. Dots update: second dot active
5. Click `‹` — returns to page 1, first dot active
6. Click page 2 dot directly — switches to page 2
7. Add a ritual: name "Comunicar con Sire", level 1, discipline "Auspex", description "Permite contactar al sire"
8. Add another ritual: name "Despertar con el Ocaso", level 2, discipline "Auspex"
9. Add a ritual with different discipline: name "Fuego Fatuo", level 1, discipline "Taumaturgia"
10. Verify: two discipline groups appear. Auspex has 2 rituals sorted by level. Taumaturgia has 1.
11. Click group header to expand/collapse
12. Click ritual name to see description
13. Edit a ritual — change name, level, discipline
14. Delete a ritual
15. Refresh page — all rituals persist
16. Click "Armas" tab — shows placeholder message
17. Import a character JSON file — rituals should load if present
18. Export a character — rituals should be in JSON

**Step 3: Final commit**

```bash
git add characterSheets/index.html characterSheets/style.css characterSheets/script.js
git commit -m "feat: dock pagination + rituals system

Complete implementation of paginated dock tabs and ritual CRUD system.
Two-page dock navigation with pager widget. Rituals grouped by
discipline with accordion UI, edit/delete, discipline modal single-select."
```

---

## Task Dependency Graph

```
Task 1 (HTML pager + pages) ──┐
                               ├─► Task 5 (JS pager logic)
Task 3 (CSS pager + pages) ───┘

Task 2 (HTML panels) ─────────┐
Task 4 (CSS ritual styles) ───┤
Task 6 (JS modal single-sel) ─┼─► Task 8 (JS ritual CRUD + render)
Task 7 (JS ritual data/save) ─┘

                               └─► Task 9 (verify + deploy)
```

Tasks 1-4 and 6-7 can be done in parallel. Task 5 depends on 1+3. Task 8 depends on 2+4+6+7. Task 9 is final.
