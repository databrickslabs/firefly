.PHONY: help db-generate db-push db-migrate db-studio db-drop db-check db-up db-pull auth-generate auth-migrate

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
