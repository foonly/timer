package db

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/username/timer/backend/migrations"
)

// Integration tests against a real Postgres - set TEST_DATABASE_URL to a disposable database (see
// internal/sync/handler_test.go). Each test runs in its own fresh schema, so they don't interfere
// with each other or with other packages' tests running in parallel. (The migration advisory lock
// is database-wide, so concurrent runs in different schemas just wait for each other.)
func setupPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()

	schema := "migrate_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE") })

	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func appliedMigrations(t *testing.T, pool *pgxpool.Pool) []string {
	t.Helper()
	rows, err := pool.Query(context.Background(), "SELECT name FROM schema_migrations ORDER BY name")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		names = append(names, name)
	}
	return names
}

func tableExists(t *testing.T, pool *pgxpool.Pool, table string) bool {
	t.Helper()
	var exists bool
	if err := pool.QueryRow(context.Background(),
		"SELECT to_regclass($1) IS NOT NULL", table).Scan(&exists); err != nil {
		t.Fatal(err)
	}
	return exists
}

func sqlFile(sql string) *fstest.MapFile { return &fstest.MapFile{Data: []byte(sql)} }

func TestAppliesInOrderAndOnlyOnce(t *testing.T) {
	pool := setupPool(t)
	ctx := context.Background()
	fsys := fstest.MapFS{
		// Out of map order on purpose; 002 depends on 001's table.
		"002_b.up.sql":   sqlFile("ALTER TABLE a ADD COLUMN extra TEXT"),
		"001_a.up.sql":   sqlFile("CREATE TABLE a (id INT)"),
		"001_a.down.sql": sqlFile("DROP TABLE a"),
		"README.md":      sqlFile("not a migration"),
	}

	if err := RunMigrations(ctx, pool, fsys); err != nil {
		t.Fatal(err)
	}
	// Neither migration is idempotent, so a second run only succeeds if both are skipped.
	if err := RunMigrations(ctx, pool, fsys); err != nil {
		t.Fatalf("second run: %v", err)
	}
	if got := appliedMigrations(t, pool); fmt.Sprint(got) != "[001_a.up.sql 002_b.up.sql]" {
		t.Fatalf("applied = %v", got)
	}
}

func TestFailedMigrationIsRolledBackAndNotRecorded(t *testing.T) {
	pool := setupPool(t)
	ctx := context.Background()
	fsys := fstest.MapFS{
		"001_ok.up.sql": sqlFile("CREATE TABLE ok (id INT)"),
		// The first statement succeeds, then the second fails on an "already exists" error - the
		// exact case the old runner recorded as applied despite the rollback.
		"002_bad.up.sql": sqlFile("CREATE TABLE partial (id INT); CREATE TABLE ok (id INT);"),
	}

	err := RunMigrations(ctx, pool, fsys)
	if err == nil || !strings.Contains(err.Error(), "002_bad.up.sql") {
		t.Fatalf("err = %v, want an error naming 002_bad.up.sql", err)
	}
	if got := appliedMigrations(t, pool); fmt.Sprint(got) != "[001_ok.up.sql]" {
		t.Fatalf("applied = %v, want only 001", got)
	}
	if tableExists(t, pool, "partial") {
		t.Fatal("failed migration's first statement was not rolled back")
	}

	// Once fixed, the next start applies it.
	fsys["002_bad.up.sql"] = sqlFile("CREATE TABLE partial (id INT);")
	if err := RunMigrations(ctx, pool, fsys); err != nil {
		t.Fatal(err)
	}
	if !tableExists(t, pool, "partial") {
		t.Fatal("fixed migration was not applied")
	}
}

func TestConcurrentRunsApplyOnce(t *testing.T) {
	pool := setupPool(t)
	ctx := context.Background()
	// pg_sleep widens the window so both runners really overlap. Without the migration lock, the
	// racing CREATE TABLE IF NOT EXISTS schema_migrations alone fails with a duplicate key error.
	fsys := fstest.MapFS{"001_a.up.sql": sqlFile("SELECT pg_sleep(0.3); CREATE TABLE a (id INT);")}

	errs := make(chan error, 2)
	for range 2 {
		go func() { errs <- RunMigrations(ctx, pool, fsys) }()
	}
	for range 2 {
		if err := <-errs; err != nil {
			t.Fatal(err)
		}
	}
	if got := appliedMigrations(t, pool); fmt.Sprint(got) != "[001_a.up.sql]" {
		t.Fatalf("applied = %v", got)
	}
}

func TestEmbeddedMigrationsApply(t *testing.T) {
	pool := setupPool(t)
	if err := RunMigrations(context.Background(), pool, migrations.FS); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"users", "sessions", "events"} {
		if !tableExists(t, pool, table) {
			t.Fatalf("table %s missing", table)
		}
	}
}
