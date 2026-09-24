# First Codex Task

Read these files first:
- `AGENTS.md`
- `WORK_KICKOFF.md`
- `DEVELOPMENT_WORKFLOW.md`
- `CODEX_TASKS.md`
- `src/config/shipping.ts`

Then:

1. Verify the Expo project compiles and starts.
2. Fix only:
   - TypeScript errors
   - unresolved imports
   - Expo Router route issues
   - runtime crashes
3. Do not redesign the UI yet.
4. Do not change shipping rules.
5. Keep the app compatible with Expo Go.
6. At the end, report:
   - files changed
   - commands run
   - remaining blockers
   - recommended next task

Definition of done:
- `npx expo start` runs successfully
- Home / Catalog / Product / Cart / Checkout / Orders routes open
- No blocking runtime error
