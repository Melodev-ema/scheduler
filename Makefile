.DEFAULT_GOAL := help
.PHONY: help down dev test lint check build prod stop logs

help: ## Liste les cibles
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-8s\033[0m %s\n", $$1, $$2}'

down: ## Arrête tous les conteneurs (les données restent dans le volume)
	docker compose --profile app down

dev: ## `next dev` sur la machine, avec le Mongo natif (27017)
	npm run dev

test: ## Tests du domaine (vitest)
	npm test

lint: ## ESLint
	npm run lint

check: ## Lint, tests et build ; échoue si une page n'est plus dynamique (CSP)
	npm run lint
	npm test
	@log=$$(mktemp); npm run build > $$log 2>&1; status=$$?; cat $$log; \
	if [ $$status -ne 0 ]; then rm -f $$log; exit $$status; fi; \
	static=$$(grep -E '○ /' $$log | grep -v '/icon.svg'); rm -f $$log; \
	if [ -n "$$static" ]; then echo "Pages devenues statiques, sans nonce pour la CSP :"; echo "$$static"; exit 1; fi

build: ## Construit l'image de production
	docker compose --profile app build

prod: ## Lance Mongo et l'app conteneurisée sur http://localhost:3000
	docker compose --profile app up -d --build --wait

stop: ## Arrête l'app conteneurisée, laisse Mongo tourner
	docker compose --profile app stop app

logs: ## Suit les logs de l'app conteneurisée
	docker compose --profile app logs -f app
