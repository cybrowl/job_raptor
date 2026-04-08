# JobFlow

JobFlow is a local-first desktop job application dashboard: SvelteKit on the frontend, Tauri v2 for the native shell, SQLite for on-device persistence, and a local URL parser flow that can use your Grok/xAI key.

## Stack

- `src/ui/`: SvelteKit + TypeScript dashboard
- `src/ai/`: shared URL parsing heuristics
- `tauri/`: native shell, SQLite migrations, and desktop parser command

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev

# desktop shell
npm run tauri
```

## Notes

- Application data is stored locally in SQLite when running inside Tauri.
- Plain browser mode falls back to `localStorage` so `npm run dev` still works without the desktop shell.
- Save an xAI API key in the dashboard to enable richer Grok-based desktop parsing through the native Tauri command layer.
- Use `Export Backup` / `Import Backup` in the dashboard settings panel to move your local pipeline between `tauri dev` and the installed app.
- Backups are portable JSON files and include both your saved applications and local Grok parser settings.
- `XAI_API_KEY` in `.env` is also supported as an optional developer fallback.
- `XAI_JOB_PARSER_MODEL` is optional and defaults to `grok-4-fast-non-reasoning`.

## Scripts

- `npm run dev`: start the SvelteKit dashboard
- `npm run build`: build static frontend assets into `build/`
- `npm run check`: run `svelte-check`
- `npm run tauri`: launch the Tauri desktop shell
- `npm run tauri:build`: build the desktop app
