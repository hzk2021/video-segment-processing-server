import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import os from "os";

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Define environment variable keys
const ENV_KEYS = {
  SUPABASE: {
    URL: "SUPABASE_URL",
    ANON_KEY: "SUPABASE_ANON_KEY",
    STORAGE_BUCKET: "STORAGE_BUCKET",
  },
  QUEUE: {
    NAME: "QUEUE_NAME",
  },
  SERVER: {
    PORT: "PORT",
    HOST: "HOST",
    ALLOWED_IPS: "ALLOWED_IPS", // Add this for IP whitelist
  },
  PROCESSING: {
    WORKER_COUNT: "WORKER_COUNT",
    INTERVAL: "PROCESSING_INTERVAL",
    AUTO_START: "AUTO_START",
  },
} as const;

// Get environment variable with type checking
function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}

// Parse boolean environment variable
function parseBoolean(
  value: string | undefined,
  defaultValue: boolean
): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true";
}

// Parse integer environment variable
function parseInt(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  if (isNaN(parsed)) return defaultValue;
  return parsed;
}

// Configuration object
export const config = {
  supabase: {
    url: getEnvVar(ENV_KEYS.SUPABASE.URL),
    anonKey: getEnvVar(ENV_KEYS.SUPABASE.ANON_KEY),
    storageBucket: getEnvVar(ENV_KEYS.SUPABASE.STORAGE_BUCKET),
  },
  queue: {
    name: getEnvVar(ENV_KEYS.QUEUE.NAME),
  },
  server: {
    port: parseInt(getEnvVar(ENV_KEYS.SERVER.PORT), 3001),
    host: getEnvVar(ENV_KEYS.SERVER.HOST, "localhost"),
    allowedIPs: getEnvVar(ENV_KEYS.SERVER.ALLOWED_IPS, "127.0.0.1,::1").split(
      ","
    ), // Add this for IP whitelist
  },
  processing: {
    workerCount: parseInt(getEnvVar(ENV_KEYS.PROCESSING.WORKER_COUNT), 6),
    interval: parseInt(getEnvVar(ENV_KEYS.PROCESSING.INTERVAL), 60000),
    autoStart: parseBoolean(getEnvVar(ENV_KEYS.PROCESSING.AUTO_START), true),
  },
  paths: {
    tempDir: path.join(os.homedir(), "story-generator-temp"),
    processingDir: "processing", // Subdirectory inside tempDir for processing
    downloadsDir: "downloads", // Subdirectory for downloads
    logsDir: "logs", // Subdirectory for logs
  },
};

// Export environment keys for use in other modules
export { ENV_KEYS };

// Validate and ensure required directories exist
export function validateConfig(): void {
  // All environment variables are validated during config creation through getEnvVar

  // Ensure temp directory exists
  try {
    const baseDir = path.dirname(config.paths.tempDir);
    if (!fs.existsSync(baseDir)) {
      throw new Error(`Base temporary directory ${baseDir} does not exist`);
    }

    // Create our app's temp directory if it doesn't exist
    if (!fs.existsSync(config.paths.tempDir)) {
      fs.mkdirSync(config.paths.tempDir, { recursive: true });
    }
  } catch (err) {
    const error = err as Error;
    console.warn(
      `Warning: Could not access or create temp directory: ${error.message}`
    );
    console.warn(`Using current directory for temporary files instead.`);
    config.paths.tempDir = path.join(process.cwd(), "temp");
    fs.mkdirSync(config.paths.tempDir, { recursive: true });
  }

  console.log("Configuration validated successfully");
}
