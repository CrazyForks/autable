package backup

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/mattn/go-sqlite3"
)

func backupSQLiteFile(ctx context.Context, sourcePath string, destinationPath string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if _, err := os.Stat(sourcePath); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(destinationPath), 0o755); err != nil {
		return err
	}
	if err := os.RemoveAll(destinationPath); err != nil {
		return err
	}

	sourceDB, err := sql.Open("sqlite3", sqliteReadOnlyDSN(sourcePath))
	if err != nil {
		return err
	}
	defer sourceDB.Close()
	destinationDB, err := sql.Open("sqlite3", destinationPath)
	if err != nil {
		return err
	}
	defer destinationDB.Close()

	sourceConn, err := sourceDB.Conn(ctx)
	if err != nil {
		return err
	}
	defer sourceConn.Close()
	destinationConn, err := destinationDB.Conn(ctx)
	if err != nil {
		return err
	}
	defer destinationConn.Close()

	return destinationConn.Raw(func(destinationDriverConn any) error {
		destinationSQLiteConn, ok := destinationDriverConn.(*sqlite3.SQLiteConn)
		if !ok {
			return fmt.Errorf("destination sqlite connection has unexpected type %T", destinationDriverConn)
		}
		return sourceConn.Raw(func(sourceDriverConn any) error {
			sourceSQLiteConn, ok := sourceDriverConn.(*sqlite3.SQLiteConn)
			if !ok {
				return fmt.Errorf("source sqlite connection has unexpected type %T", sourceDriverConn)
			}
			sqliteBackup, err := destinationSQLiteConn.Backup("main", sourceSQLiteConn, "main")
			if err != nil {
				return err
			}
			for {
				if err := ctx.Err(); err != nil {
					return errors.Join(err, sqliteBackup.Finish())
				}
				done, err := sqliteBackup.Step(128)
				if err != nil {
					return errors.Join(err, sqliteBackup.Finish())
				}
				if done {
					return sqliteBackup.Finish()
				}
				time.Sleep(10 * time.Millisecond)
			}
		})
	})
}

func sqliteReadOnlyDSN(path string) string {
	absolutePath, err := filepath.Abs(path)
	if err != nil {
		absolutePath = path
	}
	u := url.URL{Scheme: "file", Path: absolutePath}
	q := u.Query()
	q.Set("mode", "ro")
	q.Set("_busy_timeout", "5000")
	u.RawQuery = q.Encode()
	return u.String()
}
