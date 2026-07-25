# Manual tests

Tests here touch real cloud resources and need a macOS host, so they cannot run in CI.
Run them by hand before merging changes to the phase they cover.

## `test_phase8_origin_live.sh` — Phase 8 app origin (issue #19)

`tests/test_phase8_origin.sh` checks the *shape* of Phase 8: that the serving origin is
read rather than constructed, that no alias is pinned, that the deploy is explicitly
`--prod`. Those are static checks and they run anywhere.

This one checks the *behaviour*. It deploys to Vercel for real and reads
`BETTER_AUTH_URL` back out of the running deployment, which is the only way to catch a
regression that comes from Vercel's side rather than ours.

### Why it runs Phase 8 twice

A bare `vercel deploy` is a production deployment only on a project's **first** deploy.
On every deploy after that it produces a preview with a per-deployment host. So a test
that creates a fresh project each run — every run a first run — cannot see a bug where
the *second* run points `BETTER_AUTH_URL` at a host the guest never opens.

Issue #19 has shipped broken twice, and both times the test setup, not the code, is what
let it through:

| | validated with | condition never exercised |
|---|---|---|
| first fix | a unique project name | the domain collision |
| second fix | a fresh project per run | the second Phase 8 run |

This test executes Phase 8 twice against the same project and asserts after each.

### What it asserts, per run

- the collision path was exercised — Vercel assigned a suffixed domain, not `<name>.vercel.app`
- the final deployment is production
- production `BETTER_AUTH_URL` exists
- the **deployed runtime** reports that same origin, read live from the fixture's `/api/auth-url`

### Requirements

```
brew install cirruslabs/cli/tart hudochenkov/sshpass/sshpass
vercel login          # writes ~/Library/Application Support/com.vercel.cli/auth.json
```

Plus a **`SOURCE_VM`**: a stopped macOS VM, cloned fresh for each run, with Node/npm
available and the host's Vercel credentials baked in. The test installs a pinned Vercel
CLI into the clone itself, builds a minimal Next.js fixture, and stubs the Databricks and
Neon calls Phase 8 makes — so the VM needs no Databricks setup.

### Running it

```bash
SOURCE_VM=<your-vm> VERCEL_TEAM=<slug> bash tests/manual/test_phase8_origin_live.sh
```

Useful knobs:

| Variable | Purpose |
|---|---|
| `PHASE8_PROJECT` | Pin a project name known to be claimed by **another** Vercel account. |
| `HOST_REPO` | Repo under test. Defaults to this checkout. |
| `KEEP_VM=1`, `KEEP_PROJECT=1` | Leave the VM / Vercel project behind to investigate a failure. |
| `VERCEL_VERSION` | CLI version installed in the guest. Pinned, because deploy-target semantics differ across versions. |

Set `PHASE8_PROJECT` when you can. The built-in candidate list is a heuristic: a name is
only a usable fixture while some other account still holds it, and that can change
underneath you — `firefly-genie` stopped colliding on 2026-07-25 when its project was
deleted, which would silently turn the collision assertion into a false failure.

Side effects are one temporary Vercel project, removed on exit unless `KEEP_PROJECT=1`.
A run takes roughly five minutes.

### If it fails

The log path is printed on failure. `KEEP_VM=1 KEEP_PROJECT=1` preserves both sides so
you can inspect `~/phase8-fixture/.firefly-bootstrap/state.env` in the guest and compare
it against the project's real domain:

```bash
vercel project inspect <project> --scope <team>
```
