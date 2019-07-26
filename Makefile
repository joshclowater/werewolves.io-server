start:
	docker-compose build --no-cache
	docker-compose up -d

restart:
	docker-compose build client
	docker-compose up --no-deps -d client
	docker-compose logs -f client

down:
	docker-compose down

# test:
# 	docker-compose build client
# 	docker-compose build test
# 	docker-compose run --no-deps -d client
# 	docker-compose run --no-deps test
