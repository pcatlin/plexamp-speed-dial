dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

build:
	./scripts/docker-build-push.sh