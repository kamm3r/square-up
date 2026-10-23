# Square Up - three.js + p2-es + TypeScript, all vendored in lib/. No npm, no node_modules.
#
#   make deps           download three.js, p2-es and TypeScript into lib/ (once)
#   make                compile src/ and tools/ into build/
#   make watch          recompile on every save
#   make serve          compile, then serve the game on http://localhost:5317
#   make share          same, and also share it with your phone over Tailscale (see README)
#   make check-levels   run the bot that proves every level can be beaten (needs node)
#   make clean          delete build/

TSC   := lib/typescript/tsc
PORT  ?= 5317
SRC   := $(shell find src tools -name '*.ts')

.PHONY: all deps watch serve share unshare check-levels clean

all: build/.stamp

deps: $(TSC)

$(TSC) lib/three/three.module.js lib/p2-es/p2-es.js:
	./tools/fetch-deps.sh

# rebuild only when a source file (or the config) changed
build/.stamp: $(SRC) tsconfig.json | $(TSC) lib/three/three.module.js lib/p2-es/p2-es.js
	$(TSC) -p .
	@touch $@

watch: | $(TSC)
	$(TSC) -p . --watch

serve: all
	@echo "Square Up running on http://localhost:$(PORT)"
	python3 -m http.server $(PORT) --bind 127.0.0.1

# Serves the game on this computer's Tailscale address, so only your own Tailscale devices can
# open it, at two links:
#   https://<this computer>.<tailnet>.ts.net   via `tailscale serve`, stays on until `make unshare`
#   http://<tailscale ip>:PORT                 plain IP, for when the phone can't look up the name
share: all
	@ip=$$(tailscale ip -4) && \
	tailscale serve --bg http://$$ip:$(PORT) > /dev/null && \
	echo "On your phone (Tailscale on) open:" && \
	echo "  https://$$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')" && \
	echo "  http://$$ip:$(PORT)   (if the first one says the address can't be found)" && \
	python3 -m http.server $(PORT) --bind $$ip

unshare:
	tailscale serve reset

check-levels: all
	node --import ./build/tools/lib-resolve.js build/tools/check-levels.js $(ARGS)

clean:
	rm -rf build
