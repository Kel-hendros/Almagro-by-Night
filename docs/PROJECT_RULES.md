# Project Rules & Guidelines

See also: `docs/ENGINEERING_STANDARDS.md` (source of truth for architecture + UI standards).
See also: `docs/ENCOUNTERS_RULES.md` (reglas funcionales/técnicas de Encuentros en Crónicas).

## Code Style

1. **No Inline Styles**: All styling must be done via CSS classes in the appropriate `.css` file. Do not use `.style` properties in JavaScript.
2. **Design Tokens**: Use semantic tokens from `css/theme-tokens.css` (`--color-*` / `--theme-*` during migration), avoid hardcoded colors.
3. **Modularity**: New features must follow modular structure (`service/view/controller/index`) and avoid duplication.

## Workflow

1. **Check Before Edit**: Verify if functionality exists globally before re-implementing it.
2. **Clean Cleanup**: When removing code, ensure all references (variables, listeners) are also removed or updated.

## Specific Directives

1. **Encounters Scope**: encuentros siempre se resuelven con contexto de Crónica (`currentChronicleId`). No listar encuentros globales fuera de contexto.
2. **Role-based Permissions**: edición de encuentros se define por rol en Crónica (narrador/creador), no por admin global.
3. **Template Ownership**: templates de PNJ se filtran por owner (`user_id`) salvo que exista una regla explícita de compartición.
