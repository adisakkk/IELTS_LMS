COMPOSE ?= docker compose
CARGO ?= cargo
NODE ?= node
SHELL := /bin/bash

.PHONY: db-up db-bootstrap db-down migrate api worker fmt clippy test load-test load-test-restart backup-rehearsal ops-check

db-up:
	$(COMPOSE) -f docker-compose.yml up -d postgres pgbouncer minio
	bash ./scripts/dev-db-bootstrap.sh

db-bootstrap:
	bash ./scripts/dev-db-bootstrap.sh

db-down:
	$(COMPOSE) -f docker-compose.yml down --remove-orphans

migrate:
	bash ./scripts/dev-db-bootstrap.sh

api:
	$(CARGO) run -p ielts-backend-api

worker:
	$(CARGO) run -p ielts-backend-worker

fmt:
	$(CARGO) fmt --all

clippy:
	$(CARGO) clippy --workspace --all-targets -- -D warnings

test:
	$(CARGO) test --workspace

load-test:
	$(NODE) ./scripts/load-test.js

load-test-restart:
	LOAD_TEST_SCENARIO=restart-during-live-traffic $(NODE) ./scripts/load-test.js

backup-rehearsal:
	bash ./scripts/backup-rehearsal.sh

ops-check:
	$(CARGO) fmt --all --check
	$(CARGO) clippy --workspace --all-targets -- -D warnings
	$(CARGO) test --workspace
	$(NODE) ./scripts/load-test.js
	bash ./scripts/backup-rehearsal.sh
