# Character Sheet Modes

This document defines what is allowed in each character sheet mode.

## Goal
- `Edit`: modify persistent character data.
- `Play`: interact during session without changing permanent sheet values.

## Edit Mode
- Can change ratings (attributes, abilities, disciplines, sendas).
- Can reorder disciplines/sendas.
- Can open management modals that change sheet data.
- Can use temporary boosts.

## Play Mode
- Blocked (persistent edits):
  - Changing attribute/ability dots.
  - Changing discipline/senda dots.
  - Reordering disciplines/sendas.
  - Opening discipline/senda management modals.
- Allowed (session interactions):
  - Selecting attributes/abilities for dice pools.
  - Selecting discipline/senda names for dice pool 2.
  - Activating/deactivating physical disciplines (e.g. Potencia).
  - Activating/deactivating Celeridad points (consumes blood as designed).
  - Changing temporary physical attribute boosts.
  - Using quick actions ("Acciones") to prepare the dice launcher.
  - Loading rolls from discipline powers (system box) into the dice launcher.

## Dice Flow Rules
- Clicking an Action or a Discipline Power roll must only **prepare** the launcher:
  - sets pools, labels, modifier and difficulty.
  - never auto-rolls.
- Rolling always requires explicit player confirmation via the `Lanzar` button.
- This keeps room for last-second choices (Willpower, specialty, manual modifier).

## Variable Difficulty Rules
- Saved Rolls:
  - support fixed difficulty (`3..10`) and `Variable`.
  - when `Variable` is selected, clicking the action opens a mini prompt to input difficulty.
- Discipline Powers:
  - if `roll.difficulty_variable` is present, difficulty is treated as variable.
  - if `roll.difficulty` is not a numeric value, difficulty is treated as variable.
  - if no explicit roll difficulty metadata is provided, fallback is variable (not fixed `6`).
- UI summary under `Sistema` should reflect this (`dif variable (...)` when applicable).

## Rule of Thumb
- If an action edits character progression/history, it belongs to `Edit`.
- If an action is tactical for the current scene/roll, it can work in `Play`.

## UI Implementation Convention
- Use `.mode-edit-only` on any control that must disappear in `Play`.
- Global rule lives in `features/character-sheets/style.css`:
  - `html[data-sheet-mode="play"] .mode-edit-only { display: none !important; }`
- For row layouts that change when controls disappear, define explicit play-mode grid rules.
- To add/remove controls later, only update classes in markup/render functions.

## Current `.mode-edit-only` examples
- `#open-discipline-repo` (discipline management modal trigger).
- Discipline/senda row drag handles (`.drag-handle` in disciplines render).
- Senda management buttons (`.discipline-senda-btn`).
- `#attack-add-btn` (new attack modal trigger).
- Attack item edit/delete buttons (rendered in attacks module).
