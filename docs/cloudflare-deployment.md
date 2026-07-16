# Cloudflare Deployment

DropOut deploys the documentation site as a Cloudflare Worker with Static
Assets. The root `wrangler.jsonc` is the source of truth for the Worker script,
asset binding, custom domain, compatibility date, and observability settings.

## Deployment Surface

| Concern | Source of truth |
|---|---|
| Worker name | `wrangler.jsonc` `name` |
| Worker entry | `packages/docs/worker.ts` |
| Static assets | `packages/docs/build/client` through the `ASSETS` binding |
| Production domain | `dropout.hydroroll.team` in `wrangler.jsonc` `routes` |
| CI smoke target | `dropout.opensource-d6b.workers.dev` in `.github/workflows/production-smoke.yml` |
| Required merge checks | Repository ruleset `verify-push` |

## Local Validation

Run these from the repository root:

```bash
pnpm install
pnpm -C packages/docs --lockfile-dir "$PWD" install
pnpm docs:build
pnpm deploy:docs:dry-run
```

`deploy:docs:dry-run` runs the same Wrangler build command used by Cloudflare
and validates the Worker entry plus Static Assets binding without publishing.

## Production Deploy

Cloudflare builds the Worker from GitHub. Manual deploys should use the pinned
project Wrangler version:

```bash
pnpm deploy:docs
```

After deploy, verify the production routes:

```bash
curl -I https://dropout.hydroroll.team/
curl -I https://dropout.hydroroll.team/image.png
curl -I https://dropout.hydroroll.team/docs/manual/getting-started
curl -I https://dropout.hydroroll.team/en/docs/manual/getting-started
```

The required smoke workflow checks the same route families against
`https://dropout.opensource-d6b.workers.dev`. The custom domain can apply
Cloudflare bot challenges to GitHub-hosted runners, so use the workflow dispatch
`base_url` input for `https://dropout.hydroroll.team` only when that challenge
policy allows CI access.

## Merge Gates

The `verify-push` repository ruleset should require the check contexts that are
created on pull requests:

- `Test on Ubuntu 22.04`
- `Test on Arch Linux (Wayland)`
- `Test on macOS`
- `Test on Windows`
- `Build on Linux x86_64 (GNU)`
- `Build on Linux arm64 (GNU)`
- `Build on macOS x86_64`
- `Build on macOS arm64`
- `Build on Windows x86_64 (MSVC)`
- `Build on Windows arm64 (MSVC)`
- `Build Docs`
- `check`
- `prek`
- `Smoke dropout.hydroroll.team`
- `Workers Builds: dropout`

Do not require workflow names such as `Unit Test` or `Semifold CI`; GitHub
rulesets require the concrete job or external status context.
