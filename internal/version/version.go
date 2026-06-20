package version

import "fmt"

var (
	Version = "dev"
	Commit  = "unknown"
	BuiltAt = "unknown"
)

func String() string {
	if Commit == "unknown" && BuiltAt == "unknown" {
		return Version
	}
	return fmt.Sprintf("%s (%s, %s)", Version, Commit, BuiltAt)
}
