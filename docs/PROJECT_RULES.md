# Project Rules & Guidelines

See also: `docs/ENGINEERING_STANDARDS.md` (source of truth for architecture + UI standards).

## Code Style

1. **No Inline Styles**: All styling must be done via CSS classes in the appropriate `.css` file. Do not use `.style` properties in JavaScript.
2. **Design Tokens**: Use semantic tokens from `css/theme-tokens.css` (`--color-*` / `--theme-*` during migration), avoid hardcoded colors.
3. **Modularity**: New features must follow modular structure (`service/view/controller/index`) and avoid duplication.

## Workflow

1. **Check Before Edit**: Verify if functionality exists globally before re-implementing it.
2. **Clean Cleanup**: When removing code, ensure all references (variables, listeners) are also removed or updated.

## Specific Directives
