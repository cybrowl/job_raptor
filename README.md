# JobFlow

JobFlow is a desktop-friendly job application dashboard built on the same core layout as `poro`: Motoko canister storage, Internet Identity auth, a SvelteKit frontend rooted in `src/ui`, and an optional Tauri v2 wrapper.

## Stack

- `src/applications/`: Motoko persistent actor backed by `mo:core/Map`
- `src/ui/`: SvelteKit + TypeScript dashboard
- `src/ai/`: lightweight URL parsing proxy entrypoint
- `tauri/`: optional desktop shell for local/native packaging

## Quick Start

```bash
npm install
mops install
dfx start --clean --background
dfx deploy
npm run dev

# desktop shell
npm run tauri dev
```

## Notes

- `canister_ids.json` is checked in as a placeholder and will be updated by `dfx deploy`.
- The app falls back to demo data until Internet Identity is connected and the `applications` canister is reachable.
- `/api/parse-job` works inside SvelteKit for local development, and `src/ai/api/parse-job.ts` mirrors the same behavior for a separate deployment target.

## Scripts

- `npm run dev`: start the SvelteKit dashboard
- `npm run build`: build static frontend assets into `build/`
- `npm run check`: run `svelte-check`
- `npm run tauri dev`: launch the Tauri desktop shell
