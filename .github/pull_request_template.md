## What & why

<!-- What changed, and the problem it solves. Link the issue: Closes #NNN -->

## Bootstrap / runbook changes

<!-- Delete this whole section if you did not touch BOOTSTRAP.md, README.md,
     scripts/bootstrap.sh, or scripts/lib/**. -->

GitHub Actions is currently disabled on this repo, so the invariant guard does **not** run
automatically. Run it locally and paste the result:

```bash
bash scripts/check-runbook-invariants.sh
```

- [ ] Guard passes (or this PR does not touch the runbook/bootstrap)
- [ ] pnpm is still installed via `npm install -g pnpm@<pinned>` — **not** `corepack enable`/`prepare` (ENV-0, #69)
- [ ] Phase 0 of `BOOTSTRAP.md` still has runnable commands, not prose-only guidance
- [ ] Corporate-network logic still lives only in `scripts/lib/corp-network.sh`, sourced by both consumers
- [ ] `README.md` and `BOOTSTRAP.md` still agree on the pnpm install method

> Why these exist: the corepack guard was deleted once and then silently reintroduced by a
> docs-sync commit, breaking setup for everyone on a network that blocks public npm. See
> `AGENTS.md` → "Bootstrap invariants".

## Testing

<!-- What you ran, and what you did NOT verify. Be explicit about the gaps. -->

## Risk / rollback

<!-- Blast radius, and how to revert if this misbehaves. -->
