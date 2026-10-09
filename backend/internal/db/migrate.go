// Package db holds infrastructure concerns (currently just the migration
// runner) that don't belong in main.go or in a feature package.
package db

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
)

// migrationLockKey is an arbitrary advisory-lock key reserved for RunMigrations.
const migrationLockKey int64 = 0x74696d65725f6d67 // "timer_mg"

// RunMigrations applies every *.up.sql file in migrations not yet recorded in
// schema_migrations, in filename (zero-padded numeric prefix) order.
//
// Each migration runs in one transaction together with its schema_migrations
// row, so it's either fully applied and recorded or neither - a failure (or a
// crash) leaves nothing behind, and the next start simply retries it.
func RunMigrations(ctx context.Context, pool *pgxpool.Pool, migrations fs.FS) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	// Serializes concurrent starts (e.g. two instances, or a restart overlapping a slow
	// migration) for the whole run - even CREATE TABLE IF NOT EXISTS below fails with a
	// duplicate-key error when two sessions race it. A session-level lock outlives the
	// per-migration transactions, but also outlives Release(), so it must be explicitly
	// unlocked; if that fails, close the connection rather than return it to the pool locked.
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", migrationLockKey); err != nil {
		return fmt.Errorf("failed to acquire migration lock: %w", err)
	}
	defer func() {
		if _, err := conn.Exec(context.Background(), "SELECT pg_advisory_unlock($1)", migrationLockKey); err != nil {
			_ = conn.Conn().Close(context.Background())
		}
	}()

	_, err = conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name TEXT PRIMARY KEY,
			applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	names, err := fs.Glob(migrations, "*.up.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)

	for _, name := range names {
		if err := applyMigration(ctx, conn, migrations, name); err != nil {
			return err
		}
	}
	return nil
}

func applyMigration(ctx context.Context, conn *pgxpool.Conn, migrations fs.FS, name string) error {
	content, err := fs.ReadFile(migrations, name)
	if err != nil {
		return err
	}

	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Record first, so "is it already applied?" and "mark it applied" are one statement.
	tag, err := tx.Exec(ctx,
		"INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", name)
	if err != nil {
		return fmt.Errorf("failed to record migration %s: %w", name, err)
	}
	if tag.RowsAffected() == 0 {
		return nil
	}

	log.Printf("Running migration: %s\n", name)
	if _, err := tx.Exec(ctx, string(content)); err != nil {
		return fmt.Errorf("error in migration %s: %w", name, err)
	}
	return tx.Commit(ctx)
}
