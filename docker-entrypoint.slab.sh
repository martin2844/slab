#!/bin/sh
set -eu

# Previous Slab images ran as root, so existing volumes may need a one-time
# ownership migration before the application can run as the unprivileged user.
if [ "$(id -u)" -eq 0 ]; then
  chown -R node:node /data
  exec su-exec node "$@"
fi

exec "$@"
