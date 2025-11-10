.PHONY: run build clean

run:
	@if [ -f .env ]; then export $$(cat .env | grep -v '^#' | xargs) && go run main.go crypto.go; else go run main.go crypto.go; fi

build:
	go build -o proxy main.go crypto.go

clean:
	rm -f proxy

help:
	@echo "Available targets:"
	@echo "  run    - Run the proxy server"
	@echo "  build  - Build the proxy binary"
	@echo "  clean  - Remove the built binary"
