.PHONY: dev build preview test format lint deploy infra down dev-backend build-backend test-backend

dev:
	pnpm run dev

build:
	pnpm run build

preview:
	pnpm run preview

test:
	pnpm run test

format:
	pnpm run format

lint:
	pnpm run lint

deploy:
	pnpm run deploy

infra:
	docker compose up -d

down:
	docker compose down

dev-backend:
	cd backend && DATABASE_URL=postgres://timer:timer_password@localhost:5432/timer?sslmode=disable air

build-backend:
	cd backend && go build -o bin/timer-api ./cmd/api

test-backend:
	cd backend && go vet ./... && go test ./...
