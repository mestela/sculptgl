#!/bin/bash
# Usage: ./deploy.sh [USER] [HOST] [DEST_PATH]
USER=${1:-tokeruadmin}
HOST=${2:-tokeru.com}
DEST=${3:-'~/tokeru.com/sculptgl-vr/'}

echo "🚧 Preparing distribution package..."
rm -rf dist_stage && mkdir -p dist_stage
cp xr_poc.html dist_stage/index.html
cp -r src lib dist_stage/
mkdir -p dist_stage/resources
cp -r app/resources/* dist_stage/resources/

echo "🚀 Deploying to ${HOST}:${DEST}..."

# Reuse SSH connection to avoid multiple key prompts
SSH_OPTS="-o ControlMaster=auto -o ControlPath=/tmp/ssh_mux_%h_%p_%r -o ControlPersist=24h -o PasswordAuthentication=no"

# 1. Ensure remote directory exists
ssh ${SSH_OPTS} ${USER}@${HOST} "mkdir -p ${DEST}"

# 2. Rsync files
rsync -avz -e "ssh ${SSH_OPTS}" dist_stage/ ${USER}@${HOST}:${DEST}/

echo "✨ Deployment Complete!"
