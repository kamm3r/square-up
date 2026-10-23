# Square Up - three.js + p2-es + TypeScript, all vendored in lib/. No npm, no node_modules.
#
#   make deps           download three.js, p2-es and TypeScript into lib/ (once)
#   make                compile src/ and tools/ into build/
#   make watch          recompile on every save
#   make serve          compile, then serve the game on http://localhost:5317 (needs node)
#   make share          same, and also share it with your phone over Tailscale (see README)
#   make check-levels   run the bot that proves every level can be beaten (needs node)
#   make dist           build downloadable programs for Windows, macOS and Linux (needs go)
#   make clean          delete build/

TSC   := lib/typescript/tsc
PORT  ?= 5317
SRC   := $(shell find src tools -name '*.ts')

.PHONY: all deps watch serve share unshare check-levels dist clean

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
	node build/tools/serve.js $(PORT)

# Serves the game on this computer's Tailscale address, so only your own Tailscale devices can
# open it, at two links:
#   https://<this computer>.<tailnet>.ts.net   via `tailscale serve`, stays on until `make unshare`
#   http://<tailscale ip>:PORT                 plain IP, for when the phone can't look up the name
share: all
	@ip=$$(tailscale ip -4) && \
	tailscale serve --bg http://$$ip:$(PORT) > /dev/null && \
	echo "On your phone (Tailscale on) open:" && \
	echo "  https://$$(tailscale status --json | grep -m1 '"DNSName"' | sed -E 's/.*"([^"]+)\.",?$$/\1/')" && \
	echo "  http://$$ip:$(PORT)   (if the first one says the address can't be found)" && \
	node build/tools/serve.js $(PORT) $$ip

unshare:
	tailscale serve reset

check-levels: all
	node --import ./build/tools/lib-resolve.js build/tools/check-levels.js $(ARGS)

# One program per system, each holding the whole game (see launcher/main.go), in dist/.
# GAME is everything the browser loads: the page, assets, compiled JS and the runtime libraries.
GAME      := launcher/game
PLATFORMS := linux/amd64/linux-x64 linux/arm64/linux-arm64 windows/amd64/windows-x64.exe \
             darwin/amd64/macos-x64 darwin/arm64/macos-arm64

dist: all
	rm -rf $(GAME) dist
	mkdir -p $(GAME)/lib/three $(GAME)/lib/p2-es dist
	cp -r index.html style.css public $(GAME)/
	cd build && find src -name '*.js' -exec install -D -m 644 {} ../$(GAME)/build/{} \;
	cp lib/three/three.module.js lib/three/three.core.js lib/three/LICENSE $(GAME)/lib/three/
	cp lib/p2-es/p2-es.js lib/p2-es/LICENSE $(GAME)/lib/p2-es/
	@for p in $(PLATFORMS); do \
		os=$${p%%/*}; rest=$${p#*/}; arch=$${rest%%/*}; name=$${rest#*/}; \
		echo "  dist/square-up-$$name"; \
		(cd launcher && CGO_ENABLED=0 GOOS=$$os GOARCH=$$arch \
			go build -trimpath -ldflags '-s -w' -o ../dist/square-up-$$name .) || exit 1; \
	done

clean:
	rm -rf build dist $(GAME)
