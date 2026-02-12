PROJECT_NAME=ethos
COMPOSE=docker compose

build:
	$(COMPOSE) -f docker-compose.yml build

	$(COMPOSE) -f docker-compose.yml up -d --build

down:
	$(COMPOSE) -f docker-compose.yml down

logs:
	$(COMPOSE) -f docker-compose.yml logs -f

db-migrate:
	$(COMPOSE) -f docker-compose.yml exec api alembic upgrade head



create-user:
	$(COMPOSE) -f docker-compose.yml exec api python /app/scripts/create_user.py --username $(username)

up-dev:
	$(COMPOSE) -f docker-compose.dev.yml up -d --build

down-dev:
	$(COMPOSE) -f docker-compose.dev.yml down

