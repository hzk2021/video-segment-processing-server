import path from 'path';
import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import { config, validateConfig } from './config/config';
import { handler as processVideoHandler } from './handlers/process-video-handler';
import { handler as processSegmentHandler } from './handlers/process-segment-handler';
import { cleanupTempFiles } from './services/cleanup-service';
import { supabasePGMQPublic } from './services/supabase';
import { ipFilter } from './middleware/ip-filter';
import { logger, requestLogger } from './utils/logger';

// Configure Express server
const app = express();
app.use(cors());
app.use(express.json());

// Add IP filtering middleware to API routes
// Create API router with IP filtering
const apiRouter = express.Router();
apiRouter.use(ipFilter);

// Apply router to /api path
app.use('/api', apiRouter);

// Move API routes to use the router
apiRouter.get('/queue/status', async (req: Request, res: Response) => {
  try {
    if (!supabasePGMQPublic) {
      throw new Error('Supabase PGMQ client is not available');
    }

    const { data, error } = await supabasePGMQPublic.rpc("peek", {
      queue_name: config.queue.name
    });

    if (error) throw error;

    const queueStatus = {
      isProcessing,
      messagesAvailable: data && data.length > 0,
      workerCount: config.processing.workerCount,
      processingInterval: config.processing.interval
    };

    res.json(queueStatus);
  } catch (error) {
    logger.error('Queue status error', { error });
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

apiRouter.post('/control/start', (req: Request, res: Response) => {
  startPeriodicProcessing();
  res.json({ message: 'Processing started' });
});

apiRouter.post('/control/stop', (req: Request, res: Response) => {
  stopPeriodicProcessing();
  res.json({ message: 'Processing stopped' });
});

apiRouter.get('/process-video', async (req: Request, res: Response) => {
  try {
    const result = await processVideoHandler();
    res.json(result);
  } catch (error) {
    logger.error('Error processing video', { error });
    res.status(500).json({ error: 'Failed to process video' });
  }
});

apiRouter.get('/process-segment', async (req: Request, res: Response) => {
  try {
    const result = await processSegmentHandler();
    res.json(result);
  } catch (error) {
    logger.error('Error processing segment', { error });
    res.status(500).json({ error: 'Failed to process segment' });
  }
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('Request processed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      responseTime: Date.now() - start
    });
  });
  next();
});

// Ensure application is properly configured
validateConfig();

// Initialize processing state
let isProcessing = false;
let processingInterval: NodeJS.Timeout | null = null;

// Function to schedule periodic cleanup
function schedulePeriodicCleanup() {
  const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  setInterval(async () => {
    try {
      await cleanupTempFiles([
        path.join(config.paths.tempDir, config.paths.downloadsDir),
        path.join(config.paths.tempDir, config.paths.processingDir)
      ]);
      logger.info('Completed periodic cleanup');
    } catch (err) {
      logger.error('Error during scheduled cleanup', { error: err });
    }
  }, CLEANUP_INTERVAL);
  logger.info('Scheduled periodic cleanup');
}

// Function to start periodic processing
function startPeriodicProcessing() {
  if (processingInterval) {
    clearInterval(processingInterval);
  }

  isProcessing = true;
  processingInterval = setInterval(async () => {
    for (let i = 0; i < config.processing.workerCount; i++) {
      try {
        await processVideoHandler();
        await processSegmentHandler();
      } catch (error) {
        logger.error(`Worker ${i + 1} error`, { error });
      }
    }
  }, config.processing.interval);

  logger.info('Started periodic processing', {
    workers: config.processing.workerCount,
    interval: config.processing.interval
  });
}

// Function to stop periodic processing
function stopPeriodicProcessing() {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
  }
  isProcessing = false;
  logger.info('Stopped processing');
}

// API Routes are now defined on apiRouter

// Start the server
const PORT = config.server.port;
app.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    workers: config.processing.workerCount,
    interval: config.processing.interval
  });
  
  // Schedule periodic cleanup
  schedulePeriodicCleanup();
  
  // Auto-start processing if configured
  if (config.processing.autoStart) {
    startPeriodicProcessing();
  }
});
