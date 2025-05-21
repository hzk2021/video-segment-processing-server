#!/bin/zsh

SCRIPT_DIR=$(dirname "$0")
cd "$SCRIPT_DIR/.." || exit 1

echo "🚀 Deploying Video Processing Server to Production"
echo "=================================================="

# Step 1: Install dependencies
echo "Installing dependencies..."
npm install --production

# Step 2: Build the TypeScript code
echo "Building TypeScript code..."
npm run build

# Step 3: Set up environment
if [ ! -f "./.env" ]; then
  echo "⚠️ .env file not found. Please create one with the required configuration"
  exit 1
fi

# Step 4: Create required directories
echo "Creating required directories..."
npm run create-dirs

# Step 5: Check FFmpeg installation
echo "Checking FFmpeg installation..."
npm run check-ffmpeg

# Step 6: Set permissions
echo "Setting execution permissions..."
chmod +x scripts/server.sh
chmod +x scripts/check-ffmpeg.sh
chmod +x scripts/cleanup-temp.sh

# Step 7: Start the server with pm2 (install if not available)
if ! command -v pm2 &> /dev/null; then
  echo "Installing PM2 process manager..."
  npm install -g pm2
fi

echo "Starting server with PM2..."
AUTO_START=true WORKER_COUNT=6 pm2 start app/server.js --name "video-processor" --time

echo "✅ Deployment completed! Server is running as a background service."
echo "Use 'pm2 logs video-processor' to view logs"
echo "Use 'pm2 stop video-processor' to stop the server"
echo "Use 'pm2 restart video-processor' to restart the server"
