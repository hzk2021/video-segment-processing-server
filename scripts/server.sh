#!/bin/zsh

SCRIPT_DIR=$(dirname "$0")
cd "$SCRIPT_DIR" || exit 1

function start_server {
  echo "Starting video processing server..."
  npm run create-dirs
  npm run dev
}

function install_deps {
  echo "Installing dependencies..."
  npm install
}

function check_ffmpeg {
  echo "Checking FFmpeg installation..."
  npm run check-ffmpeg
}

function setup_env {
  if [ ! -f "./.env" ]; then
    echo "⚠️ .env file not found. Please create one with the required configuration"
    exit 1
  else
    echo ".env file exists, proceeding with setup..."
  fi
  
  # Create required directories
  npm run create-dirs
}

function show_help {
  echo "Video Processing Server Control Script"
  echo ""
  echo "Usage:"
  echo "  $0 start      - Start the processing server"
  echo "  $0 setup      - Set up environment and create directories"
  echo "  $0 check      - Check FFmpeg installation"
  echo "  $0 install    - Install dependencies"
  echo "  $0 help       - Show this help message"
}

case "$1" in
  start)
    start_server
    ;;
  install)
    install_deps
    ;;
  setup)
    setup_env
    ;;
  check)
    check_ffmpeg
    ;;
  help|--help|-h)
    show_help
    ;;
  *)
    show_help
    ;;
esac
