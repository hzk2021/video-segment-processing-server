# Temporary Files Directory

This directory is used for storing temporary files during processing. It's organized into the following subdirectories:

- `downloads/` - Files downloaded from Supabase storage (images, audio)
- `processing/` - Intermediate files created during the FFmpeg processing
- `logs/` - Log files for debugging and troubleshooting

These files are typically deleted after successful processing, but may be kept for debugging purposes in case of errors.
