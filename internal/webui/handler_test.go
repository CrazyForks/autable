package webui

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestHandlerRoutesAPIRequestsToAPI(t *testing.T) {
	apiHit := false
	handler := HandlerWithFS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiHit = true
		w.WriteHeader(http.StatusTeapot)
	}), testFrontendFS())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/metadata", nil))

	if !apiHit {
		t.Fatal("expected API handler to be called")
	}
	if response.Code != http.StatusTeapot {
		t.Fatalf("expected API status, got %d", response.Code)
	}
}

func TestHandlerServesFrontendAssetsAndSPAFallback(t *testing.T) {
	handler := HandlerWithFS(http.NotFoundHandler(), testFrontendFS())

	asset := httptest.NewRecorder()
	handler.ServeHTTP(asset, httptest.NewRequest(http.MethodGet, "/assets/app.js", nil))
	if asset.Code != http.StatusOK || asset.Body.String() != "console.log('ok');" {
		t.Fatalf("expected asset response, got status=%d body=%q", asset.Code, asset.Body.String())
	}

	route := httptest.NewRecorder()
	handler.ServeHTTP(route, httptest.NewRequest(http.MethodGet, "/workspace/table", nil))
	if route.Code != http.StatusOK || !strings.Contains(route.Body.String(), "<main>app</main>") {
		t.Fatalf("expected SPA fallback, got status=%d body=%q", route.Code, route.Body.String())
	}

	missingAsset := httptest.NewRecorder()
	handler.ServeHTTP(missingAsset, httptest.NewRequest(http.MethodGet, "/assets/missing.js", nil))
	if missingAsset.Code != http.StatusNotFound {
		t.Fatalf("expected missing asset 404, got %d", missingAsset.Code)
	}
}

func testFrontendFS() fs.FS {
	return fstest.MapFS{
		"index.html":    {Data: []byte("<main>app</main>")},
		"assets/app.js": {Data: []byte("console.log('ok');")},
	}
}
