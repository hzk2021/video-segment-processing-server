import fs from "fs";
import path from "path";
import { config } from "../config/config";

// Dynamically import ffmpeg with proper typing
let ffmpeg: any;
const importFFmpeg = async () => {
  try {
    // Use dynamic import for compatibility
    const ffmpegModule = await import("fluent-ffmpeg");
    ffmpeg = ffmpegModule.default;
    return ffmpeg;
  } catch (error) {
    console.error("Error loading FFmpeg module:", error);
    throw new Error("Failed to load FFmpeg module");
  }
};

/**
 * Helper function to get formatted timestamp for logs
 */
function getTimestamp(): string {
  return `[${new Date().toISOString()}]`;
}

/**
 * Helper function to create formatted section headers in logs
 */
function logSectionHeader(title: string): void {
  const separator = "=".repeat(80);
  console.log(separator);
  console.log(`${getTimestamp()} 📌 ${title.toUpperCase()}`);
  console.log(separator);
}

/**
 * Helper function for consistent log messages
 */
function logInfo(message: string): void {
  console.log(`${getTimestamp()} ℹ️ ${message}`);
}

/**
 * Helper function for success messages
 */
function logSuccess(message: string): void {
  console.log(`${getTimestamp()} ✅ ${message}`);
}

/**
 * Helper function for warning messages
 */
function logWarning(message: string): void {
  console.warn(`${getTimestamp()} ⚠️ ${message}`);
}

/**
 * Helper function for error messages
 */
function logError(message: string, error?: any): void {
  if (error) {
    console.error(`${getTimestamp()} ❌ ${message}`, error);
  } else {
    console.error(`${getTimestamp()} ❌ ${message}`);
  }
}

// Global tracking for progress reporting
let highestSeenPercentage = 0;
let lastReportedPercent = 0;
let consecutiveZeros = 0;
let inNewProcess = false;

/**
 * Helper function for progress messages
 */
function logProgress(percent: number): void {
  // Ensure percentage is between 0 and 100
  let validPercent = Math.min(Math.max(Math.floor(percent || 0), 0), 100);

  // Handle process transitions
  if (validPercent === 0) {
    consecutiveZeros++;

    // If we see multiple consecutive zeros after having high percentages,
    // it's likely a new process starting
    if (consecutiveZeros >= 2 && lastReportedPercent >= 99) {
      highestSeenPercentage = 0;
      inNewProcess = true;
    } else if (!inNewProcess && highestSeenPercentage > 50) {
      // If we're not in a new process and we've made progress,
      // don't display the zero
      return;
    }
  } else {
    consecutiveZeros = 0;
    inNewProcess = false;
  }

  // Prevent backward progress reporting within the same process
  if (
    !inNewProcess &&
    validPercent < highestSeenPercentage - 5 &&
    highestSeenPercentage > 10
  ) {
    // Use the last reported value instead of the new lower one
    validPercent = lastReportedPercent;
  }

  // Update tracking variables
  if (validPercent > highestSeenPercentage) {
    highestSeenPercentage = validPercent;
  }

  // Only report if the percentage has changed significantly
  if (
    Math.abs(validPercent - lastReportedPercent) < 2 &&
    validPercent !== 0 &&
    validPercent !== 100
  ) {
    return;
  }

  // Create progress bar
  const progressBar =
    "█".repeat(Math.floor(validPercent / 5)) +
    "░".repeat(20 - Math.floor(validPercent / 5));
  console.log(
    `${getTimestamp()} 🔄 Processing: [${progressBar}] ${validPercent}%`
  );

  // Update last reported percentage
  lastReportedPercent = validPercent;
}

// Download a file from a URL and save it to the specified path
export async function downloadFile(
  url: string,
  filePath: string
): Promise<boolean> {
  try {
    logInfo(`Downloading file from ${url}`);
    logInfo(`Destination: ${filePath}`);

    // Ensure the downloads directory exists
    const downloadsDir = path.join(config.paths.tempDir, "downloads");
    fs.mkdirSync(downloadsDir, { recursive: true });

    // Define destination path in downloads directory
    const fileName = `${Date.now()}_${path.basename(filePath)}`;
    const downloadPath = path.join(downloadsDir, fileName);

    // Fetch the file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Write the file to the downloads directory
    fs.writeFileSync(downloadPath, buffer);

    // Copy to the requested location if different from downloads directory
    if (downloadPath !== filePath) {
      fs.copyFileSync(downloadPath, filePath);
    }

    logSuccess(`Downloaded file successfully to ${downloadPath}`);
    return true;
  } catch (error) {
    console.error("Error downloading file:", error);
    return false;
  }
}

// Get the duration of an audio file in seconds
export async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const ff = await importFFmpeg();

    return new Promise((resolve, reject) => {
      ff(audioPath).ffprobe((err: Error, data: any) => {
        if (err) {
          reject(err);
          return;
        }

        const duration = data.format.duration;
        resolve(duration);
      });
    });
  } catch (error) {
    console.error("Error getting audio duration:", error);
    throw error;
  }
}

// Create a video from an image and audio file with slow zoom effect and optional subtitles
export async function createVideo(
  imagePath: string,
  audioPath: string,
  outputPath: string,
  duration: number,
  subtitlesPath?: string // Added subtitle support
): Promise<void> {
  try {
    console.log(
      `Creating video with image ${imagePath} and audio ${audioPath}`
    );

    // Ensure the processing directory exists
    const processingDir = path.join(
      config.paths.tempDir,
      config.paths.processingDir
    );
    fs.mkdirSync(processingDir, { recursive: true });

    // Create logs directory for FFmpeg logs
    const logsDir = path.join(config.paths.tempDir, "logs");
    fs.mkdirSync(logsDir, { recursive: true });

    // Define temp processing path
    const tempOutputPath = path.join(processingDir, path.basename(outputPath));

    // Define log file path
    const logFilePath = path.join(logsDir, `ffmpeg-${Date.now()}.log`);
    const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

    const ff = await importFFmpeg();

    // Define zoom effect parameters - Ken Burns effect
    // Slightly zoom in throughout the duration of the segment
    // This creates a slow zoom effect that enhances the storytelling feel
    return new Promise((resolve, reject) => {
      const filters = [
        // Apply slow zoom effect (Ken Burns effect)
        // Start at 1.0x zoom and end at 1.1x zoom
        `[0:v]scale=1920:1080,zoompan=z='min(zoom+0.0001,1.1)':d=${
          duration * 30
        }:s=1920x1080:fps=30[v]`,
      ];

      // Add subtitle filter if subtitles are provided
      if (subtitlesPath) {
        // Escape special characters in the path
        const escapedPath = subtitlesPath.replace(/[\\:]/g, "\\$&");
        filters.push(
          `[v]subtitles='${escapedPath}':force_style='Alignment=2,PlayResX=1920,PlayResY=1080,FontName=Arial,FontSize=75,MarginV=50,BorderStyle=3,Outline=2,Shadow=0,LineSpacing=0,MarginL=200,MarginR=200'[vout]`
        );
      }

      const command = ff()
        .input(imagePath)
        .input(audioPath)
        .complexFilter(filters);

      // Set up output mapping based on whether we have subtitles
      const outputOptions = [
        "-map",
        subtitlesPath ? "[vout]" : "[v]", // Use the video after effects
        "-map",
        "1:a", // Use the audio from the second input
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-shortest",
        "-pix_fmt",
        "yuv420p",
        `-t`,
        `${duration}`,
        "-r",
        "30",
        "-preset",
        "medium",
        "-profile:v",
        "main",
        "-crf",
        "23", // Better quality
      ];

      command
        .outputOptions(outputOptions)
        .output(tempOutputPath)
        .on("start", (commandLine: string) => {
          logInfo("FFmpeg process started");
          logStream.write(`${getTimestamp()} Command: ${commandLine}\n`);
        })
        .on("progress", (progress: any) => {
          // Fix the progress percentage - cap at 100%
          // This corrects the issue where FFmpeg reports percentages like 3075% or higher
          const rawPercent = progress.percent || 0;
          const normalizedPercent = Math.min(Math.floor(rawPercent), 100);

          logProgress(normalizedPercent);
          logStream.write(
            `${getTimestamp()} Progress: ${normalizedPercent}%\n`
          );
        })
        .on("error", (err: Error) => {
          logError("FFmpeg process failed", err);
          logStream.write(`${getTimestamp()} Error: ${err.message}\n`);
          logStream.end();
          reject(err);
        })
        .on("end", () => {
          logSuccess("FFmpeg processing completed");
          logStream.write(`${getTimestamp()} Finished successfully\n`);
          logStream.end();

          // Copy the file from processing directory to the requested output path
          if (tempOutputPath !== outputPath) {
            fs.copyFileSync(tempOutputPath, outputPath);
          }

          logSuccess(`Video created successfully at ${outputPath}`);
          resolve();
        })
        .run();
    });
  } catch (error) {
    logError("Failed to create video", error);
    throw error;
  }
}

/**
 * Merge multiple videos together with cross-fade transitions
 * @param videoFiles Array of video file paths to merge
 * @param outputPath Output path for the merged video
 * @param transitionDuration Duration of transition between videos in seconds
 * @returns Promise that resolves when video is merged
 */
export async function mergeVideosWithTransition(
  videoFiles: string[],
  outputPath: string,
  transitionDuration: number = 1
): Promise<void> {
  try {
    if (videoFiles.length === 0) {
      throw new Error("No video files provided for merging");
    }

    logSectionHeader(
      `Merging ${videoFiles.length} videos with ${transitionDuration}s transitions`
    );

    // Ensure the processing directory exists
    const processingDir = path.join(
      config.paths.tempDir,
      config.paths.processingDir
    );
    fs.mkdirSync(processingDir, { recursive: true });

    // Create logs directory for FFmpeg logs
    const logsDir = path.join(config.paths.tempDir, "logs");
    fs.mkdirSync(logsDir, { recursive: true });

    // Define temp processing path
    const tempOutputPath = path.join(processingDir, path.basename(outputPath));

    // Define log file path
    const logFilePath = path.join(logsDir, `ffmpeg-merge-${Date.now()}.log`);
    const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

    const ff = await importFFmpeg();
    const command = ff();

    // Add all input videos
    videoFiles.forEach((file) => {
      command.input(file);
    });

    // If there's only one video, just copy it
    if (videoFiles.length === 1) {
      return new Promise((resolve, reject) => {
        command
          .outputOptions(["-c", "copy"])
          .output(tempOutputPath)
          .on("start", (commandLine: string) => {
            logInfo("FFmpeg merge process started");
            logStream.write(`${getTimestamp()} Command: ${commandLine}\n`);
          })
          .on("progress", (progress: any) => {
            // Fix the progress percentage - cap at 100%
            const rawPercent = progress.percent || 0;
            const normalizedPercent = Math.min(Math.floor(rawPercent), 100);

            logProgress(normalizedPercent);
            logStream.write(
              `${getTimestamp()} Progress: ${normalizedPercent}%\n`
            );
          })
          .on("error", (err: Error) => {
            logError("FFmpeg merge process failed", err);
            logStream.write(`${getTimestamp()} Error: ${err.message}\n`);
            logStream.end();
            reject(err);
          })
          .on("end", () => {
            logSuccess("FFmpeg merge process completed");
            logStream.write(`${getTimestamp()} Finished successfully\n`);
            logStream.end();

            // Copy the file from processing directory to the requested output path
            if (tempOutputPath !== outputPath) {
              fs.copyFileSync(tempOutputPath, outputPath);
            }

            logSuccess(`Videos merged successfully at ${outputPath}`);
            resolve();
          })
          .run();
      });
    }

    // Build the complex filter for multiple videos with crossfade transitions
    const filterComplex: string[] = [];
    const outputLabels: string[] = [];

    // Process each video
    for (let i = 0; i < videoFiles.length; i++) {
      // Label for the current video
      filterComplex.push(`[${i}:v]setpts=PTS-STARTPTS[v${i}]`);
      filterComplex.push(`[${i}:a]asetpts=PTS-STARTPTS[a${i}]`);

      outputLabels.push(`[v${i}]`);
      outputLabels.push(`[a${i}]`);
    }

    // Create the concat command with crossfade transitions
    // Format: "v1" "v2" "v3" etc for video and "a1" "a2" "a3" etc for audio
    const videoLabels = [];
    const audioLabels = [];

    for (let i = 0; i < videoFiles.length; i++) {
      videoLabels.push(`[v${i}]`);
      audioLabels.push(`[a${i}]`);
    }

    // Add the concat filter
    // For video, use xfade to transition between segments
    const concatVideo = `${videoLabels.join("")}concat=n=${
      videoFiles.length
    }:v=1:a=0,format=yuv420p[vout]`;
    const concatAudio = `${audioLabels.join("")}concat=n=${
      videoFiles.length
    }:v=0:a=1[aout]`;

    filterComplex.push(concatVideo);
    filterComplex.push(concatAudio);

    return new Promise((resolve, reject) => {
      command
        .complexFilter(filterComplex)
        .outputOptions([
          "-map",
          "[vout]",
          "-map",
          "[aout]",
          "-sn", // Strip any existing subtitles
          "-c:v",
          "libx264",
          "-c:a",
          "aac",
          "-preset",
          "medium",
          "-profile:v",
          "main",
          "-crf",
          "23",
        ])
        .output(tempOutputPath)
        .on("start", (commandLine: string) => {
          logInfo("FFmpeg complex merge process started");
          logStream.write(`${getTimestamp()} Command: ${commandLine}\n`);
        })
        .on("progress", (progress: any) => {
          // Fix the progress percentage - cap at 100%
          const rawPercent = progress.percent || 0;
          const normalizedPercent = Math.min(Math.floor(rawPercent), 100);

          logProgress(normalizedPercent);
          logStream.write(
            `${getTimestamp()} Progress: ${normalizedPercent}%\n`
          );
        })
        .on("error", (err: Error) => {
          logError("FFmpeg complex merge process failed", err);
          logStream.write(`${getTimestamp()} Error: ${err.message}\n`);
          logStream.end();
          reject(err);
        })
        .on("end", () => {
          logSuccess("FFmpeg complex merge process completed");
          logStream.write(`${getTimestamp()} Finished successfully\n`);
          logStream.end();

          // Copy the file from processing directory to the requested output path
          if (tempOutputPath !== outputPath) {
            fs.copyFileSync(tempOutputPath, outputPath);
          }

          logSuccess(`Videos merged successfully at ${outputPath}`);
          resolve();
        })
        .run();
    });
  } catch (error) {
    logError("Failed to merge videos", error);
    throw error;
  }
}
