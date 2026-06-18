package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"time"

	"codetable/internal/api"
	"codetable/internal/codefiles"
	"codetable/internal/config"
	"codetable/internal/history"
	"codetable/internal/metadata"
	"codetable/internal/recorddb"
	"codetable/internal/repository"
	"codetable/internal/systemdb"
	"codetable/internal/table"
)

func main() {
	configPath := flag.String("config", "config.yml", "path to codetable config.yml")
	flag.Parse()

	if err := run(context.Background(), *configPath); err != nil {
		slog.Error("codetable stopped", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, configPath string) error {
	cfg, err := config.Load(configPath)
	if err != nil {
		return err
	}
	repoLayout := repository.NewLayout(cfg.Repository.Path)
	metadataPath := repoLayout.MetadataPath()
	catalog, err := metadata.Load(metadataPath)
	if err != nil {
		return err
	}
	system, err := systemdb.Open(ctx, cfg.SystemDB.Path)
	if err != nil {
		return err
	}
	defer system.Close()

	historyStore, err := history.OpenLevelDB(cfg.History.Path)
	if err != nil {
		return err
	}
	defer historyStore.Close()

	rowRepository, err := recorddb.OpenCatalog(ctx, catalog)
	if err != nil {
		return err
	}
	defer rowRepository.Close()

	address := cfg.Server.Address
	if address == "" {
		address = "127.0.0.1:8080"
	}
	server := api.NewServerWithOIDCProviders(
		catalog,
		system,
		table.NewServiceWithRepository(historyStore, rowRepository),
		historyStore,
		cfg.OIDC.Providers,
	)
	server.EnableMetadataWrites(metadataPath)
	server.SetDatabaseOpener(rowRepository.OpenDatabase)
	server.SetCodeFileStore(codefiles.NewStore(cfg.Repository.Path))
	server.StartWorkflowWorkers(ctx)
	server.StartWorkflowScheduler(ctx, 15*time.Second)
	slog.Info("codetable listening", "address", address)
	return http.ListenAndServe(address, server)
}
