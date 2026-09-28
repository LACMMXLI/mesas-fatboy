#!/bin/sh
set -eu
mkdir -p /app/data
node ./node_modules/prisma/build/index.js migrate deploy
node prisma/seed.mjs
exec node server.js
