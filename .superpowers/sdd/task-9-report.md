# Task 9 report: Thread list + chat pane + customer role

## Completed

- Replaced placeholder threads and messages with API-backed `ThreadList` and `ChatPane` components.
- Fetches threads for the active bot, loads the selected thread's messages and draft, and derives the selected row's `last_role` from its message history.
- Added Customer/Agent sender controls; only Customer messages enable the composer. Sending reloads the thread and list, flashes its row, and pulses the Task 10 generate hook.
- Added `threadBadge` with Vitest coverage for escalated, resolved, agent-replied, draft-needed, pending, and approved states.

## Verification

- `npx vitest run` passed: 1 file, 6 tests.
- `npm run build` passed (TypeScript and Vite).
- IDE diagnostics report no errors in the modified source files.
- `npm run lint` remains blocked by the checked-in installation missing oxlint's Darwin native optional binding.

## Notes

- Vite emits a non-blocking warning because the local Node `22.11.0` is below its stated `22.12.0` minimum.
- List endpoints do not return `last_role`; it is deliberately derived from `getThread` when the user selects a thread, without changing the backend API.

## Task 9 review fix (race + flash)

- `loadThread` skips `setSelectedThread` / thread list updates when the effect cleanup sets `cancelled`, avoiding stale thread detail after rapid thread switches.
- `flashThreadId` clears after ~1.2s so the row flash animation can run again on subsequent sends.
- `pulseGenerate` left for Task 10 (DraftPanel ownership); vitest re-run recorded below.

### Post-fix verification

- `cd frontend && npx vitest run` — 1 file, 6 tests passed.
