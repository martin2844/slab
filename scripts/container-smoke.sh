#!/bin/sh
set -eu

image=${SLAB_SMOKE_IMAGE:-slab:smoke}
api_port=${SLAB_API_SMOKE_PORT:-39670}
mcp_port=${SLAB_MCP_SMOKE_PORT:-39669}
suffix=${GITHUB_RUN_ID:-local}-$$
api_container=slab-api-smoke-$suffix
mcp_container=slab-mcp-smoke-$suffix
volume=slab-work-smoke-data-$suffix
temporary_directory=$(mktemp -d)
secret_file=$temporary_directory/work-api-key
api_key=testing-only-work-api-key-0123456789abcdef

cleanup() {
  docker rm --force "$api_container" "$mcp_container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
  rm -rf "$temporary_directory"
}
trap cleanup EXIT HUP INT TERM

printf '%s\n' "$api_key" > "$secret_file"
chmod 444 "$secret_file"
docker volume create "$volume" >/dev/null

common_args="--volume $volume:/data --mount type=bind,src=$secret_file,dst=/run/secrets/work-api-key,readonly"

# The release stack runs this as a one-shot dependency before either server.
# shellcheck disable=SC2086
docker run --rm $common_args "$image" node dist/db/migrate.js >/dev/null

# shellcheck disable=SC2086
docker run --detach \
  --name "$api_container" \
  --publish "127.0.0.1:${api_port}:6970" \
  $common_args \
  --env TRACKER_API_KEY_FILE=/run/secrets/work-api-key \
  --env SKIP_MIGRATIONS=true \
  "$image" >/dev/null

# shellcheck disable=SC2086
docker run --detach \
  --name "$mcp_container" \
  --publish "127.0.0.1:${mcp_port}:6969" \
  $common_args \
  --env TRACKER_API_KEY_FILE=/run/secrets/work-api-key \
  --env SKIP_MIGRATIONS=true \
  "$image" node dist/mcp/server.js >/dev/null

curl --retry 30 --retry-delay 1 --retry-all-errors -fsS \
  "http://127.0.0.1:${api_port}/ready" >/dev/null
curl --retry 30 --retry-delay 1 --retry-all-errors -fsS \
  "http://127.0.0.1:${mcp_port}/ready" >/dev/null

curl -fsS \
  -H "X-API-Key: $api_key" \
  -H 'Content-Type: application/json' \
  --data '{"key":"SMOKE","name":"Shared database smoke"}' \
  "http://127.0.0.1:${api_port}/api/projects" >/dev/null
node scripts/mcp-smoke.mjs "http://127.0.0.1:${mcp_port}" "$api_key" SMOKE

test "$(docker exec "$api_container" sh -c "awk '/^Uid:/{print \$2}' /proc/1/status")" = "1000"
test "$(docker exec "$mcp_container" sh -c "awk '/^Uid:/{print \$2}' /proc/1/status")" = "1000"
test "$(docker exec "$api_container" stat -c '%a' /data)" = "700"
test "$(docker exec "$api_container" stat -c '%a' /data/slab.db)" = "600"
if docker exec "$api_container" sh -c 'command -v npm >/dev/null 2>&1'; then
  echo "The production image must not include package-manager CLIs." >&2
  exit 1
fi
if docker exec "$api_container" sh -c 'command -v yarn >/dev/null 2>&1 || command -v corepack >/dev/null 2>&1'; then
  echo "The production image must not include package-manager CLIs." >&2
  exit 1
fi
if docker inspect "$api_container" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -F "$api_key" >/dev/null; then
  echo "The API key must not be stored in container environment metadata." >&2
  exit 1
fi

docker restart "$api_container" "$mcp_container" >/dev/null
curl --retry 30 --retry-delay 1 --retry-all-errors -fsS \
  "http://127.0.0.1:${api_port}/ready" >/dev/null
curl --retry 30 --retry-delay 1 --retry-all-errors -fsS \
  "http://127.0.0.1:${mcp_port}/ready" >/dev/null
node scripts/mcp-smoke.mjs "http://127.0.0.1:${mcp_port}" "$api_key" SMOKE

echo "Slab Work container smoke passed."
