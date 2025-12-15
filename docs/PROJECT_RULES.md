# Project Rules & Guidelines

## Code Style

1. **No Inline Styles**: All styling must be done via CSS classes in the appropriate `.css` file. Do not use `.style` properties in JavaScript.
2. **CSS Variables**: Use the variables defined in `styles.css` (e.g., `--color-red-accent`) for colors.
3. **Modularity**: New components should be modular (like `shared-picker.js`) rather than duplicated.

## Workflow

1. **Check Before Edit**: Verify if functionality exists globally before re-implementing it.
2. **Clean Cleanup**: When removing code, ensure all references (variables, listeners) are also removed or updated.

## Specific Directives
