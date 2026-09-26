#!/bin/sh
# انتشار وب‌اپ روی ahmagh.pages.dev
set -e
cd "$(dirname "$0")"
rsync -a --delete --exclude '_worker.js' public/ pages-dist/
# _worker.js را نگه می‌داریم (rsync با exclude بالا)
export CLOUDFLARE_ACCOUNT_ID=4d67f0848c83ace5ffa115b98bb1b2ee
exec ./node_modules/.bin/wrangler pages deploy pages-dist --project-name ahmagh --branch main --commit-dirty=true
