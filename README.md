# Video Processing Server

A Node.js (Express.js) server that processes videos and segments asynchronously using Supabase's PGMQ for message queuing and FFmpeg for video processing.

<sub> (P.S, I tried Serverless too but the limitations were not worth it.) </sub>

## Features

- IP whitelisting for secure API access
- Structured logging with Winston
- Multiple worker support for parallel processing
- Automatic cleanup of temporary files
- Asynchronous video processing using Supabase PGMQ
- Real-time subtitle generation using Whisper
- Error tracking and logging
- Secure file storage using Supabase Storage
- Downloads image and audio files from source URLs
- Combines media into videos using FFmpeg
- Uploads processed videos back to storage
- Updates segment and video records with results

## Prerequisites

- Node.js 18 or higher
- FFmpeg must be installed on your local machine for development
- OpenAI Whisper must be installed for subtitle generation
- Supabase project with PGMQ extension enabled

### Installing Whisper

To install Whisper, you'll need Python 3.7 or later. Install it using pip:

```bash
pip install -U openai-whisper
```

For macOS users, you might need to install additional dependencies:

```bash
brew install ffmpeg
pip install setuptools-rust
```

### Checking FFmpeg Installation

1. Verify FFmpeg installation:

```bash
npm run check-ffmpeg
```

If FFmpeg is not installed, follow the installation instructions provided by the script.

## Local Development

### Install Dependencies

```bash
npm install
```

## Database Schema

### Story

```sql
CREATE TABLE Story (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  script TEXT NOT NULL,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  createdById TEXT NOT NULL REFERENCES User(id),
  updatedById TEXT NOT NULL REFERENCES User(id)
);
```

### Video

```sql
CREATE TABLE Video (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  storyId UUID NOT NULL REFERENCES Story(id),
  status TEXT NOT NULL DEFAULT 'pending',
  url TEXT,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Segment

```sql
CREATE TABLE Segment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  storyId UUID NOT NULL REFERENCES Story(id),
  orderIndex INTEGER NOT NULL,
  text TEXT,
  imageURL TEXT,
  audioURL TEXT,
  videoURL TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## Queue Format

### segments-to-process-queue

```json
{
  "segmentId": "uuid-of-segment"
}
```

### videos-to-process-queue

```json
{
  "videoId": "uuid-of-video"
}
```

## Environment Variables

```env
# Supabase Configuration
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
STORAGE_BUCKET=story-gen

# Queue Configuration
QUEUE_NAME=segments-to-process-queue

# Server Configuration
PORT=3001
HOST=localhost
ALLOWED_IPS=127.0.0.1,::1  # Comma-separated list of allowed IPs

# Processing Configuration
WORKER_COUNT=6
PROCESSING_INTERVAL=60000
AUTO_START=true
```

## API Endpoints

All endpoints require IP whitelisting.

### Status and Control

- `GET /api/queue/status` - Get current queue and processing status
- `POST /api/control/start` - Start processing queue
- `POST /api/control/stop` - Stop processing queue

### Manual Processing

- `GET /api/process-video` - Process a single video
- `GET /api/process-segment` - Process a single segment

## Directory Structure

```
processing-server/
├── app/
│   ├── config/
│   │   └── config.ts         # Configuration management
│   ├── handlers/
│   │   ├── process-segment-handler.ts
│   │   └── process-video-handler.ts
│   ├── middleware/
│   │   └── ip-filter.ts      # IP whitelist middleware
│   ├── services/
│   │   ├── cleanup-service.ts
│   │   ├── ffmpeg-service.ts
│   │   ├── segment-processor.ts
│   │   ├── storage-service.ts
│   │   ├── supabase.ts
│   │   └── video-processor.ts
│   ├── utils/
│   │   └── logger.ts         # Winston logger configuration
│   ├── server.ts             # Main server file
│   └── types.ts              # TypeScript type definitions
├── scripts/
│   ├── check-ffmpeg.sh       # FFmpeg installation checker
│   ├── cleanup-temp.sh       # Temporary file cleanup
│   ├── deploy.sh            # Deployment script
│   └── server.sh            # Server management script
└── temp/
    ├── downloads/           # Downloaded resources
    ├── logs/               # Application logs
    └── processing/         # Files being processed
```

### Cleanup Script

A cleanup script is provided to remove old temporary files that may not have been automatically cleaned up:

```bash
# Clean up temp files older than 24 hours
./cleanup-temp.sh
```

You can schedule this script to run periodically with cron:

```bash
# Add to crontab (runs daily at 2 AM)
0 2 * * * /path/to/processing-server/cleanup-temp.sh >> /path/to/processing-server/temp/logs/cleanup.log 2>&1
```

### Run the Server

To start the processing server locally:

```bash
# Using the convenience script
./server.sh start

# OR using npm
npm run dev
```

The server will start on http://localhost:3001 by default.

### Using cURL

You can use curl to interact with the server endpoints:

```bash
# Start periodic processing
curl -X POST http://localhost:3001/api/control/start

# Stop periodic processing
curl -X POST http://localhost:3001/api/control/stop

# Process a single segment
curl http://localhost:3001/api/process-segment
```

### Running as a Background Process

To run the server as a background process:

```bash
# Using nohup
nohup npm run local-server > processing-server.log 2>&1 &

# Or using screen (if installed)
screen -S processing-server
npm run local-server
# Press Ctrl+A, then D to detach
# To reattach: screen -r processing-server

# Or using tmux (if installed)
tmux new -s processing-server
npm run local-server
# Press Ctrl+B, then D to detach
# To reattach: tmux attach -t processing-server
```

### Integration with Main Application

This processing server operates as an independent service that communicates with your main application via the Supabase queue. To integrate:

1. Your main application enqueues video or segment processing requests by adding messages to the appropriate Supabase queue (e.g., `videos-to-process-queue` or `segments-to-process-queue`).
2. The processing server monitors these queues, processes the corresponding videos or segments, and performs the necessary media operations.
3. Once processing is complete, the server updates the relevant database records (such as the `videoURL` field for segments) with the results.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create and configure `.env` file using the environment variables detailed in the "Environment Variables" section above.

3. Build the project:

```bash
npm run build
```

## Local Testing

Run the function locally:

```bash
npm run dev
```

## How It Works

1. The function polls a Supabase PGMQ queue for new segments to process
2. For each segment, it:
   - Retrieves the segment data (image URL, audio URL, story ID)
   - Downloads the image and audio files
   - Uses Whisper to analyze the audio and generate word-level timestamps for subtitles
   - Uses FFmpeg to combine the image and audio into a video with:
     - Ken Burns zoom effect on the image
     - Bottom-aligned subtitles that appear in sync with the speech
     - High-quality video encoding settings
   - Uploads the video to Supabase storage
   - Updates the segment record with the video URL
   - Acknowledges the message in the queue

## Logging

Logs are stored in:

- `temp/logs/error.log` - Error logs only
- `temp/logs/combined.log` - All logs
- Console output with colored levels

Log format:

```
YYYY-MM-DD HH:mm:ss [LEVEL] Message {metadata}
```

## Error Handling

All processing errors are treated as permanent failures and:

1. Message is archived from the queue
2. Error details are logged to standard error
3. Error details are returned in the API response

## Subtitle Generation

The processing server automatically generates subtitles for videos using OpenAI's Whisper. Here's how it works:

1. Audio is extracted from the video segment
2. Whisper processes the audio to generate word-level timestamps
3. Subtitles are generated in SRT format
4. FFmpeg embeds the subtitles at the bottom of the video with proper styling

### Subtitle Configuration

The default subtitle configuration includes:

- Bottom alignment with 60px margin from bottom
- White text with black outline for readability
- Font size of 24px
- Shadow effect for better visibility

You can modify these settings in the `ffmpeg-service.ts` file if needed.

## Setup and Running

1. Install dependencies:

```bash
npm install
```

2. Create .env file:

```bash
cp .env.example .env
```

3. Start the server:

```bash
npm run dev
```

For production (not configured yet.):

```bash
npm run build
npm start
```
