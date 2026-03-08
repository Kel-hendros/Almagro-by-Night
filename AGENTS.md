## Skills

### Available skills

- `use-tags`: Use the shared tag system in this repo for tag rendering, tag editors, normalization, dedupe, and tag filter bars. Use when a task touches tags in notes, revelations, document archives, resource manager, or any screen that should rely on `ABNShared.tags` instead of custom local tag logic. (file: `/Users/kelhendrosmacmini/Library/Mobile Documents/com~apple~CloudDocs/Development/Projects/Almagro-by-Night/.agents/skills/use-tags/SKILL.md`)
- `use-themes`: Use the shared theme system and global UI components in this repo when working on colors, typography, tokens, theme-aware styling, document shell visuals, and shared controls like buttons, icon buttons, and modal close buttons. Use this before creating a new screen or introducing local styling that might already exist in shared CSS. (file: `/Users/kelhendrosmacmini/Library/Mobile Documents/com~apple~CloudDocs/Development/Projects/Almagro-by-Night/.agents/skills/use-themes/SKILL.md`)
- `use-supabase-domain`: Use the shared Supabase auth, current-user, player, and chronicle-permission patterns in this repo when a task touches sessions, players, `chronicle_participants`, or feature services that resolve the current actor. Use this before adding new Supabase queries so you do not re-authenticate unnecessarily or drift from the repo's permission model. (file: `/Users/kelhendrosmacmini/Library/Mobile Documents/com~apple~CloudDocs/Development/Projects/Almagro-by-Night/.agents/skills/use-supabase-domain/SKILL.md`)
- `use-documents`: Use the shared document system in this repo when a task touches `document-archive`, `document-screen`, note/recap/revelation viewers or forms, document-type adapters, or document list/card variants. Use this before creating a new document-like screen so new work plugs into the existing registry, archive route, shared shells, and list presets. (file: `/Users/kelhendrosmacmini/Library/Mobile Documents/com~apple~CloudDocs/Development/Projects/Almagro-by-Night/.agents/skills/use-documents/SKILL.md`)

### How to use skills

- When the task clearly involves tags, read the skill before editing.
- When the task clearly involves colors, fonts, shared components, or theme-aware styling, read the theme skill before editing.
- When the task clearly involves auth, current user, players, participation, or Supabase permission guards, read the Supabase domain skill before editing.
- When the task clearly involves document archives, document viewers/forms, doc types, or document list variants, read the documents skill before editing.
- Keep repo-local skills concise and point them at real source files and live examples in the codebase.
