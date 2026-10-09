package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/username/timer/backend/internal/auth"
	"github.com/username/timer/backend/internal/db"
	"github.com/username/timer/backend/internal/sync"
	"github.com/username/timer/backend/migrations"
)

const (
	// Request body limits. Credentials are tiny; a push is at most 500 events (see
	// sync.maxPushBatch), and the client sends 200 at a time, so 4 MiB leaves room for long
	// timer descriptions without letting one request buffer unbounded memory.
	maxAuthBodyBytes = 64 << 10
	maxPushBodyBytes = 4 << 20

	// How long a shutdown waits for in-flight requests before giving up on them. Well under
	// systemd's default 90s stop timeout.
	shutdownTimeout = 15 * time.Second
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

// run is main's body, returning instead of exiting so its defers (closing the pool) always run.
func run() error {
	// Cancelled on SIGINT/SIGTERM (systemd's stop signal) to start a graceful shutdown.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://timer:timer_password@localhost:5432/timer?sslmode=disable"
	}
	pool, err := connect(ctx, dbURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	// Fatal: serving requests against a schema that's missing a migration would fail in
	// confusing ways later, far from the actual cause.
	if err := db.RunMigrations(ctx, pool, migrations.FS); err != nil {
		return fmt.Errorf("migrations failed: %w", err)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	ln, err := net.Listen("tcp", ":"+port)
	if err != nil {
		return err
	}
	log.Printf("Server starting on port %s...\n", port)
	return serve(ctx, newServer(newRouter(pool)), ln)
}

// connect retries until the database accepts connections (e.g. while it's still starting up
// alongside the server), closing each failed attempt's pool instead of leaking it.
func connect(ctx context.Context, dbURL string) (*pgxpool.Pool, error) {
	const attempts = 10
	var err error
	for i := range attempts {
		var pool *pgxpool.Pool
		pool, err = pgxpool.New(ctx, dbURL)
		if err == nil {
			if err = pool.Ping(ctx); err == nil {
				return pool, nil
			}
			pool.Close()
		}
		log.Printf("Waiting for database... (%d/%d)\n", i+1, attempts)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	return nil, fmt.Errorf("unable to connect to database after retries: %w", err)
}

func newRouter(pool *pgxpool.Pool) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	allowedOrigins := []string{"http://localhost:5173"}
	if extra := os.Getenv("CORS_ORIGIN"); extra != "" {
		allowedOrigins = append(allowedOrigins, extra)
	}
	// Bearer-token auth only (no cookies), so credentialed CORS isn't needed -
	// this can safely allow a plain, non-credentialed cross-origin request.
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: allowedOrigins,
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type"},
		MaxAge:         300,
	}))

	r.Use(auth.SessionMiddleware(pool))

	authHandler := auth.NewHandler(pool)
	syncHandler := sync.NewHandler(pool)
	authBody := middleware.RequestSize(maxAuthBodyBytes)

	r.Route("/api", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("ok"))
		})

		r.With(authBody).Post("/auth/signup", authHandler.Signup)
		r.With(authBody).Post("/auth/login", authHandler.Login)

		r.Group(func(r chi.Router) {
			r.Use(auth.RequireAuth)
			r.With(authBody).Post("/auth/logout", authHandler.Logout)
			r.Get("/auth/me", authHandler.Me)
			r.With(middleware.RequestSize(maxPushBodyBytes)).Post("/sync/push", syncHandler.Push)
			r.Get("/sync/pull", syncHandler.Pull)
		})
	})
	return r
}

// newServer sets timeouts so slow or stalled clients can't hold connections (and goroutines)
// open indefinitely - http.ListenAndServe's default server has none.
func newServer(handler http.Handler) *http.Server {
	return &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
}

// serve runs srv on ln until ctx is cancelled, then shuts down gracefully: it stops accepting new
// connections and waits up to shutdownTimeout for in-flight requests (e.g. a push mid-transaction)
// to finish, rather than cutting them off.
func serve(ctx context.Context, srv *http.Server, ln net.Listener) error {
	errCh := make(chan error, 1)
	go func() { errCh <- srv.Serve(ln) }()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	log.Println("Shutting down...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	if err := <-errCh; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
