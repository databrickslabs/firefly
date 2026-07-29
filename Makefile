.PHONY: help check db-generate db-push db-migrate db-studio db-drop db-check db-up db-pull auth-generate auth-migrate

# Load environment variables from .env.local
-include .env.local
export

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

db-generate: ## Generate migration files from schema changes
	pnpm drizzle-kit generate

db-push: ## Push schema changes directly to database (development)
	pnpm drizzle-kit push

db-migrate: ## Run pending migrations on database (production)
	pnpm drizzle-kit migrate

db-studio: ## Open Drizzle Studio to browse database
	pnpm drizzle-kit studio

db-drop: ## Drop all tables (WARNING: destructive)
	pnpm drizzle-kit drop

db-check: ## Check for schema drift
	pnpm drizzle-kit check

db-up: db-generate db-push ## Generate and push schema changes

db-pull: ## Pull schema from database and generate TypeScript schema
	pnpm drizzle-kit introspect

auth-generate: ## Generate Better Auth schema (output to auth-schema.ts for reference)
	pnpm dlx @better-auth/cli@latest generate

auth-setup: ## Setup auth tables (uses Drizzle push)
	@echo "Pushing Better Auth schema to database using Drizzle..."
	pnpm drizzle-kit push

# GitHub Actions is disabled on this repository ({"enabled": false} on
# /actions/permissions), so the runbook invariants and the TypeScript build are enforced by
# nothing automatic -- they hold only when somebody runs them. Repo-local git hooks cannot
# help either: core.hooksPath points at ~/.databricks/githooks globally, and that directory
# is not ours to edit. So the least-bad option is to make the check trivial to invoke and
# name it in the contributing path. Run this before pushing anything that touches
# BOOTSTRAP.md, scripts/, or src/.
check: ## Run the runbook invariants, agent unit tests, and typecheck (CI is disabled; this is the only gate)
	@bash scripts/check-runbook-invariants.sh
	@# The invariants read source; these EXERCISE it. Both are needed: static checks could not
	@# see that the two Genie backends expose different tool names, which shipped a broken
	@# default past nine green end-to-end runs.
	@cd agent && python3 -m unittest discover -s tests -p 'test_*.py' -q && echo "agent tests: clean"
	@npx --yes tsc --noEmit -p tsconfig.json && echo "typecheck: clean"
