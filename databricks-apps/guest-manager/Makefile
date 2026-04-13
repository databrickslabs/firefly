.PHONY: setup install run clean

setup:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env from .env.example — fill in GUEST_API_SECRET and APP_BASE_URL"; \
	fi
	uv sync

install:
	uv sync

run:
	uv run streamlit run app.py

clean:
	rm -rf .venv
