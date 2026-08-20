#!/bin/sh
set -eu

# Previous Slab images ran as root, so existing volumes may need a one-time
# ownership migration before the application can run as the unprivileged user.
if [ "$(id -u)" -eq 0 ]; then
  chown node:node /data
  chmod 700 /data
  find /data -maxdepth 1 -type f -name 'slab.db*' -exec chown node:node {} \;
  find /data -maxdepth 1 -type f -name 'slab.db*' -exec chmod 600 {} \;
  umask 077
  exec su-exec node "$@"
fi

umask 077
exec "$@"
