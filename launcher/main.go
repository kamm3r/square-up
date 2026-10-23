// Square Up launcher: one executable that holds the whole game and opens it in your browser.
//
// A browser game can't be opened straight from disk (file://): browsers block its modules and
// sound loading there. So this serves the embedded files on 127.0.0.1 and points the browser at
// it. The port is fixed because the browser keeps your saved progress per address.
//
// Built by `make dist`, which first copies the game files into launcher/game/.
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"time"
)

//go:embed all:game
var files embed.FS

const port = 47317

// The page answers this so a second launch can tell the port is taken by the game itself.
const pingPath = "/__square-up"

func main() {
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)

	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		// already running? then just open another tab
		if resp, err := http.Get(url + pingPath[1:]); err == nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			fmt.Println("Square Up is already running at", url)
			openBrowser(url)
			return
		}
		fail(fmt.Sprintf("port %d is in use by another program", port))
	}

	game, _ := fs.Sub(files, "game")
	mux := http.NewServeMux()
	mux.HandleFunc(pingPath, func(w http.ResponseWriter, r *http.Request) {})
	mux.Handle("/", noCache(http.FileServerFS(game)))

	fmt.Println("Square Up is running at", url)
	fmt.Println("Keep this window open while you play. Close it (or press Ctrl+C) to quit.")
	go func() {
		time.Sleep(200 * time.Millisecond)
		openBrowser(url)
	}()
	if err := http.Serve(listener, mux); err != nil {
		fail(err.Error())
	}
}

// Without this the browser could keep using files from an older version of the game.
func noCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		h.ServeHTTP(w, r)
	})
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		fmt.Println("Couldn't open a browser. Open this address yourself:", url)
	}
}

// Shows the error and waits, so a window opened by double-clicking doesn't vanish unread.
func fail(msg string) {
	fmt.Println("Square Up couldn't start:", msg)
	fmt.Println("Press Enter to close.")
	fmt.Scanln()
	os.Exit(1)
}
