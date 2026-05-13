dev:
	docker compose -f docker-compose.yml -f docker-compose.build.yml up --build

build:
	./scripts/docker-build-push.sh