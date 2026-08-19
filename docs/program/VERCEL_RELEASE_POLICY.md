# Vercel Release Policy

GoSpots does not use automatic Git-triggered Vercel deployments.

## Phase workflow

1. Work on the phase in an isolated branch.
2. Run GitHub CI on every relevant commit/PR update.
3. Do not deploy routine phase commits to Vercel.
4. Merge only after the exact final phase head is green.
5. Deploy the verified `main` revision deliberately to Vercel production once the phase release gate is reached.
6. Verify production health, critical routes, runtime errors, and phase-specific smoke evidence.
7. Record acceptance only after production verification succeeds.

A preview deployment may still be created deliberately when a phase specifically requires Vercel-hosted preview evidence, but it is not automatic and should be exceptional.

This policy prevents development commits and documentation-only closeout changes from consuming Vercel deployment quota or accidentally changing production.
