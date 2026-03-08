# CLAUDE.md — API Observer

## Project
Generic API Observer tool for discovering, analyzing, and documenting web application APIs through browser-based traffic observation. Not tied to any specific application or organization.

## Language
- Communication and reports: Dutch
- Code, configs, skill names/descriptions: English

## Stack
- **Runtime**: Node.js 22+ (LTS)
- **Language**: TypeScript with `strict: true`
- **Modules**: ESM (`import/export`, `"type": "module"`)
- **UI**: Server-rendered HTML with VS Code-style dark theme, WebSocket for real-time updates
- **Database**: SQLite via better-sqlite3 (WAL mode)
- **Browser**: Playwright (Chromium, headful mode)
- **Validation**: Zod for all external input

## Architecture
Pragmatic flat `src/` structure grouped by function. Golden-rulebook principles (TypeScript strict, ESM, Zod, security headers, file limits) are followed, but no 5-layer abstraction — this is a single-process local tool.

## Rules & Skills
Rules and skills are sourced from [rwrw01/golden-rulebook](https://github.com/rwrw01/golden-rulebook). See `.claude/rules/` and `.claude/skills/`.

## Reporting standard (all audit skills)
- **Severity levels**: CRITICAL > HIGH > MEDIUM > LOW
- **Per finding**: location (file:line), description, impact, fix, reference (CWE/OWASP)
- **Report structure**: Management summary -> Critical -> Medium -> Low -> Action list
- **Maturity scores**: 1 (absent) — 5 (best practice / exemplary)

## Skill conventions
- All skills: `disable-model-invocation: true` (manual trigger only)
- Names and descriptions in English (better matching)
- Report content in Dutch
- Use `$ARGUMENTS` for project-specific parameters
- Naming: `rwrw01-{function}` (kebab-case)

## Git & Licensing (Non-Negotiable)
- **License**: EUPL-1.2. Include a `LICENSE` file in every new repo.
- **No AI co-author**: NEVER add `Co-Authored-By` lines for Claude, Anthropic, or any AI model in commit messages.
- **Dependency license table**: The README of every project MUST contain a table listing all used software/dependencies with their license.

## Security
- Server binds to `127.0.0.1` only
- Cookie values encrypted with AES-256-GCM
- Sensitive headers redacted in UI
- No `eval()`, no dynamic `import()` from user input

## Data Isolation
This is a **generic** tool. No organization-specific files, HAR dumps, or configuration may be committed. The `data/` directory is gitignored.
