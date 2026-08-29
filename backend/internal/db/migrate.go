// Package db holds infrastructure concerns (currently just the migration
// runner) that don't belong in main.go or in a feature package.
package db

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RunMigrations applies any migrations/*.up.sql file not yet recorded in
// schema_migrations, in alphabetical (zero-padded numeric prefix) order.
// It tolerates "already exists" errors so a partially-applied migration
// (e.g. from a crash mid-run) can be safely re-run and recorded.
func RunMigrations(pool *pgxpool.Pool) error {
	ctx := context.Background()

	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name TEXT PRIMARY KEY,
			applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	files, err := os.ReadDir("migrations")
	if err != nil {
		return err
	}

	for _, f := range files {
		if f.IsDir() || !strings.HasSuffix(f.Name(), ".up.sql") {
			continue
		}

		var exists bool
		if err := pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name = $1)", f.Name()).Scan(&exists); err != nil {
			return fmt.Errorf("failed to check migration status: %w", err)
		}
		if exists {
			continue
		}

		log.Printf("Running migration: %s\n", f.Name())
		content, err := os.ReadFile("migrations/" + f.Name())
		if err != nil {
			return err
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return err
		}
		defer tx.Rollback(ctx)

		_, err = tx.Exec(ctx, string(content))
		if err != nil {
			var pgErr *pgconn.PgError
			isAlreadyExists := false
			if errors.As(err, &pgErr) {
				// 42710: duplicate_object, 42P07: duplicate_table, 42701: duplicate_column
				if pgErr.Code == "42710" || pgErr.Code == "42P07" || pgErr.Code == "42701" {
					log.Printf("Migration %s already partially or fully applied (SQLSTATE %s), skipping...\n", f.Name(), pgErr.Code)
					isAlreadyExists = true
				}
			}

			if !isAlreadyExists {
				return fmt.Errorf("error in migration %s: %w", f.Name(), err)
			}

			tx.Rollback(ctx)
			tx, err = pool.Begin(ctx)
			if err != nil {
				return fmt.Errorf("failed to start recording transaction for %s: %w", f.Name(), err)
			}
			defer tx.Rollback(ctx)
		}

		if _, err = tx.Exec(ctx, "INSERT INTO schema_migrations (name) VALUES ($1)", f.Name()); err != nil {
			return fmt.Errorf("failed to record migration %s: %w", f.Name(), err)
		}

		if err := tx.Commit(ctx); err != nil {
			return err
		}
	}
	return nil
}
