#!/bin/bash
# filepath: /Users/hezhenkai/Desktop/Personal Projects/story-generator/processing-server/cleanup-temp.sh

# This script cleans up old temporary files that may not have been properly deleted
# It's recommended to run this script periodically (e.g., via cron)

# Get the directory of the script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP_DIR="${SCRIPT_DIR}/temp"
MAX_AGE_HOURS=24

echo "Cleaning up temporary files older than ${MAX_AGE_HOURS} hours in ${TEMP_DIR}"

# Find files older than MAX_AGE_HOURS and delete them
if [[ -d "${TEMP_DIR}" ]]; then
  # Count files before deletion
  file_count=$(find "${TEMP_DIR}" -type f -not -path "*/\.*" -not -name "README.md" | wc -l)
  echo "Found ${file_count} files in temp directory"
  
  # Remove old files (skip README files and .gitkeep)
  find "${TEMP_DIR}" -type f -mtime +${MAX_AGE_HOURS}h -not -name "README.md" -not -name ".gitkeep" -exec rm -f {} \;
  
  # Remove empty directories
  find "${TEMP_DIR}" -type d -empty -not -path "${TEMP_DIR}" -exec rmdir {} \; 2>/dev/null
  
  # Count remaining files
  remaining_count=$(find "${TEMP_DIR}" -type f -not -path "*/\.*" -not -name "README.md" | wc -l)
  echo "Cleanup complete. ${remaining_count} files remaining."
else
  echo "Temp directory ${TEMP_DIR} does not exist."
fi

echo "Creating required subdirectories"
mkdir -p "${TEMP_DIR}/downloads"
mkdir -p "${TEMP_DIR}/processing"
mkdir -p "${TEMP_DIR}/logs"

echo "Done"
