#!/bin/bash
# Deploy SculptGL VR PoC to Remote Host via Rsync
# Usage: ./deploy.sh [USER] [HOST] [DEST_PATH]
# Example: ./deploy.sh myuser lobot.dreamhost.com ~/mysite.com/vr-poc

USER=${1:-tokeruadmin}
HOST=${2:-tokeru.com}
DEST=${3:-'~/apps/sculptgl-vr/'}

if [ -z "$USER" ] || [ -z "$HOST" ] || [ -z "$DEST" ]; then
  echo "Usage: $0 [USER] [HOST] [DEST_PATH]"
  exit 1
fi

echo "🚧 Preparing distribution package..."
rm -rf dist_stage
mkdir -p dist_stage

# 1. Copy Core Files
cp xr_poc.html dist_stage/index.html
cp -r src dist_stage/
cp -r lib dist_stage/

# 2. Relocate Resources (CRITICAL STEP)
# The app expects 'resources/' at root, derived from 'app/resources/'
# We copy contents of app/resources to dist_stage/resources/
echo "🚚 Relocating resources..."
mkdir -p dist_stage/resources
cp -r app/resources/* dist_stage/resources/

echo "✅ Package ready in dist_stage/"

# 3. Deploy
echo "🚀 Deploying to ${HOST}:${DEST}..."
# Ensure remote directory exists
ssh ${USER}@${HOST} "mkdir -p ${DEST}"

# Use sshpass if strictly necessary, but prefer key auth or manual password entry
rsync -avz -e ssh dist_stage/ ${USER}@${HOST}:${DEST}/

echo "✨ Deployment Complete!"
echo "👉 Check your URL!"
