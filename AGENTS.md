# GoSpots Engineering Agent Instructions

GoSpots is the standalone venue operating system; GuestCheck → Settlement → Payment/Refund → Ledger is the canonical financial authority. No shadow POS or second financial truth. Before work, inspect `docs/ai-execution/SESSION_HANDOFF.md`, `CURRENT_STATE.md` and live branch/HEAD; check existing code/tests before implementing. Track T-001–T-017 and P0–P17/R0–R15 evidence, not unverified completion claims.

Never develop directly on main, merge or deploy production without owner approval, use Edulytics environments, perform real financial operations, or run destructive migrations. Feature-branch commits must not trigger Vercel previews; consult `apps/web/vercel.json` and `docs/program/VERCEL_RELEASE_POLICY.md`. Batch related commits; run focused tests first and exact-head release CI at meaningful checkpoints. Update `docs/ai-execution/` before handing off. Follow any narrower nested AGENTS.md.
