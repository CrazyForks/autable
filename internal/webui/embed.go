package webui

import "embed"

//go:embed dist
var embeddedDist embed.FS

func Embedded() embed.FS {
	return embeddedDist
}
