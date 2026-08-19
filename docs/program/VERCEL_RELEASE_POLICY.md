# Vercel Release Policy

GoSpots uses Git-backed Vercel production deployments, but they are explicitly release-gated.

## Release gate

The canonical web project root is `apps/web`.

`apps/web/vercel.json` enforces two controls:

1. Git deployments are disabled for feature branches and enabled only for `main`.
2. `ignoreCommand` skips the `main` build unless `apps/web/.vercel-release` changed in that commit.

This keeps normal development, PR and documentation commits from creating Vercel builds while preserving Vercel's native monorepo checkout and `apps/web` Next.js detection. It replaces the broken manual packaging path that uploaded a small synthetic deployment bundle and failed with `NEXT_NO_VERSION` because the bundle was evaluated outside the real `apps/web` project root.

## Phase workflow

1. Work on the phase in an isolated branch.
2. Run GitHub CI on every relevant commit/PR update.
3. Do not change `apps/web/.vercel-release` during routine implementation.
4. Merge only after the exact final phase head is green.
5. At the production release gate, update `apps/web/.vercel-release` in the guarded closeout change.
6. Merge the guarded closeout change to `main`; Vercel then clones the real repository, evaluates `apps/web/vercel.json`, installs the pnpm workspace from the repository root, and builds `@gospots/web` as Next.js.
7. Verify the resulting production deployment SHA, critical routes and runtime errors.
8. Record acceptance evidence. Do not update the release marker again unless another deliberate production release is required.

A preview deployment is not created automatically for feature branches. If preview evidence is ever required, it should be enabled deliberately for that release workflow rather than weakening the normal deployment gate.

This policy keeps releases source-traceable and avoids the previous manual three-file deployment packaging failure while retaining phase-level deployment control.
