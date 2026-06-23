package backup

import (
	"context"
	"time"

	"autable/internal/metadata"
)

type S3Options struct {
	Endpoint        string
	Region          string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
	ForcePathStyle  bool
}

type Options struct {
	DataPath       string
	RepositoryPath string
	Catalog        metadata.Catalog
	IncludeLevelDB bool
	TmpDir         string
	ObjectPrefix   string
	Now            func() time.Time
	Uploader       Uploader
}

type Uploader interface {
	Upload(ctx context.Context, path string, key string) error
}

type Result struct {
	Key        string
	SizeBytes  int64
	StartedAt  time.Time
	FinishedAt time.Time
}

type Manifest struct {
	Version        int            `json:"version"`
	CreatedAt      string         `json:"created_at"`
	IncludeLevelDB bool           `json:"include_leveldb"`
	DataPath       string         `json:"data_path"`
	RepositoryPath string         `json:"repository_path,omitempty"`
	Files          []ManifestFile `json:"files"`
}

type ManifestFile struct {
	Path      string `json:"path"`
	Kind      string `json:"kind"`
	SizeBytes int64  `json:"size_bytes"`
}
