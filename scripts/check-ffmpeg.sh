#!/bin/zsh

echo "Checking FFmpeg installation..."

# Check if FFmpeg is installed
if command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg_version=$(ffmpeg -version | head -n 1)
  echo "✅ FFmpeg is installed: $ffmpeg_version"
else
  echo "❌ FFmpeg is not installed."
  
  # Detect OS and suggest installation method
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "To install FFmpeg on macOS, run:"
    echo "  brew install ffmpeg"
    echo "If you don't have Homebrew installed, visit: https://brew.sh/"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "To install FFmpeg on Ubuntu/Debian, run:"
    echo "  sudo apt update && sudo apt install ffmpeg"
    echo "To install FFmpeg on CentOS/RHEL, run:"
    echo "  sudo yum install ffmpeg"
  elif [[ "$OSTYPE" == "msys"* ]] || [[ "$OSTYPE" == "win32" ]]; then
    echo "To install FFmpeg on Windows:"
    echo "  1. Download from https://ffmpeg.org/download.html"
    echo "  2. Extract the files and add the bin folder to your PATH"
  else
    echo "Please install FFmpeg for your operating system"
    echo "Visit: https://ffmpeg.org/download.html"
  fi
  
  echo ""
  echo "Note: The server will still work without FFmpeg installed on your system,"
  echo "as it includes FFmpeg binaries via npm packages."
  exit 1
fi

# Check if FFprobe is installed
if command -v ffprobe >/dev/null 2>&1; then
  ffprobe_version=$(ffprobe -version | head -n 1)
  echo "✅ FFprobe is installed: $ffprobe_version"
else
  echo "❓ FFprobe is not installed. It should be included with FFmpeg."
  echo "The server will use the npm package version."
fi

echo ""
echo "✨ Your system is ready to use the processing server."
