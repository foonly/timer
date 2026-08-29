package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/username/timer/backend/internal/auth"
	"github.com/username/timer/backend/internal/db"
	"github.com/username/timer/backend/internal/sync"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://timer:timer_password@localhost:5432/timer?sslmode=disable"
	}

	var pool *pgxpool.Pool
	var err error

	for i := range 10 {
		pool, err = pgxpool.New(context.Background(), dbURL)
		if err == nil {
			err = pool.Ping(context.Background())
			if err == nil {
				break
			}
		}
		log.Printf("Waiting for database... (%d/10)\n", i+1)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("Unable to connect to database after retries: %v\n", err)
	}
	defer pool.Close()

	if err := db.RunMigrations(pool); err != nil {
		log.Printf("Migration warning: %v\n", err)
	}

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

	r.Route("/api", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("ok"))
		})

		r.Post("/auth/signup", authHandler.Signup)
		r.Post("/auth/login", authHandler.Login)

		r.Group(func(r chi.Router) {
			r.Use(auth.RequireAuth)
			r.Post("/auth/logout", authHandler.Logout)
			r.Get("/auth/me", authHandler.Me)
			r.Post("/sync/push", syncHandler.Push)
			r.Get("/sync/pull", syncHandler.Pull)
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("Server starting on port %s...\n", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
