import fs from "fs";
import path from "path";
import { supabasePublic } from "./supabase";
import { config } from "../config/config";
import { processSegment } from "./segment-processor";
import { cleanupTempFiles, cleanupVideoFiles } from "./cleanup-service";
import { downloadFile, mergeVideosWithTransition } from "./ffmpeg-service";
import { uploadFile } from "./storage-service";

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

/**
 * Update video status in database
 * @param videoId The ID of the video to update
 * @param status The status to set (pending, processing, completed, failed)
 * @param videoURL Optional video URL to update
 */
async function updateVideoStatus(
  videoId: string,
  status: "pending" | "completed" | "failed",
  videoURL?: string
): Promise<void> {
  try {
    if (!supabasePublic) {
      throw new Error("Supabase client is not initialized");
    }

    const updateData: { status: string; videoURL?: string } = { status };

    if (videoURL) {
      updateData.videoURL = videoURL;
    }

    const { error } = await supabasePublic
      .from("Video")
      .update(updateData)
      .eq("id", videoId);

    if (error) {
      logError(`Failed to update video ${videoId} status to ${status}`, error);
    } else {
      logInfo(
        `Updated video ${videoId} status to ${status}${
          videoURL ? " with URL" : ""
        }`
      );
    }
  } catch (error) {
    logError(`Error updating video ${videoId} status`, error);
  }
}

/**
 * Process a video by processing all segments within the story
 * @param videoId The ID of the video to process
 * @returns The URL of the processed video or null if processing failed
 */
export async function processVideo(videoId: string): Promise<string | null> {
  try {
    logSectionHeader(`PROCESSING VIDEO ${videoId}`);

    // Check if supabasePublic is available
    if (!supabasePublic) {
      throw new Error("Supabase client is not initialized");
    }

    // 1. Get video data from database
    logInfo(`Fetching video data for ${videoId}`);
    const { data: video, error: videoError } = await supabasePublic
      .from("Video")
      .select("storyId, status")
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      logError(
        `Failed to fetch video ${videoId}: ${
          videoError?.message || "Video not found"
        }`
      );
      // Ensure status is updated to failed if we can't even fetch the video
      await updateVideoStatus(videoId, "failed");
      // Early return so worker can move on to the next item
      return null;
    }

    if (!video.storyId) {
      logError(`Video ${videoId} is not associated with a story`);
      await updateVideoStatus(videoId, "failed");
      // Early return so worker can move on to the next item
      return null;
    }

    // 2. Update video status to processing
    logInfo(`Updating video ${videoId} status to pending`);
    await updateVideoStatus(videoId, "pending");

    // 3. Get all segments for this story
    logInfo(`Fetching segments for story ${video.storyId}`);
    const { data: segments, error: segmentsError } = await supabasePublic
      .from("Segment")
      .select("id, sortedIndex")
      .eq("storyId", video.storyId)
      .order("sortedIndex", { ascending: true });

    if (segmentsError || !segments || segments.length === 0) {
      logError(
        `Failed to fetch segments for story ${video.storyId}: ${
          segmentsError?.message || "No segments found"
        }`
      );
      await updateVideoStatus(videoId, "failed");
      // Early return so worker can move on to the next item
      return null;
    }

    logInfo(
      `Found ${segments.length} segments for video ${videoId} (story ${video.storyId})`
    );
    // Keeping status as pending while processing

    // 4. Process each segment
    const processedSegments = [];
    const tempDirectories = [];

    // Create a dedicated temp directory for this video
    const videoTempDir = path.join(
      config.paths.tempDir,
      config.paths.processingDir,
      videoId
    );
    fs.mkdirSync(videoTempDir, { recursive: true });
    tempDirectories.push(videoTempDir);

    // Track any failures during segment processing
    let hasFailedSegments = false;

    try {
      for (const segment of segments) {
        try {
          logSectionHeader(
            `PROCESSING SEGMENT ${segment.id} (index: ${segment.sortedIndex})`
          );
          // Create a dedicated temp directory for each segment inside the temp/processing dir
          const segmentTempDir = path.join(
            config.paths.tempDir,
            config.paths.processingDir,
            segment.id
          );
          fs.mkdirSync(segmentTempDir, { recursive: true });
          tempDirectories.push(segmentTempDir);

          const videoURL = await processSegment(segment.id);

          if (videoURL) {
            // Update the segment's videoURL in the database
            logInfo(
              `Updating segment ${segment.id} with videoURL and completed status`
            );
            const { error: segmentUpdateError } = await supabasePublic
              .from("Segment")
              .update({ videoURL, status: "completed" })
              .eq("id", segment.id);

            if (segmentUpdateError) {
              logError(
                `Failed to update segment ${segment.id} videoURL`,
                segmentUpdateError
              );
              hasFailedSegments = true;
            } else {
              logSuccess(`Updated segment ${segment.id} with videoURL`);
            }

            processedSegments.push({
              id: segment.id,
              videoURL,
              sortedIndex: segment.sortedIndex,
            });
          } else {
            logError(`Failed to process segment ${segment.id}`);
            hasFailedSegments = true;

            // Update segment status to failed
            logInfo(`Updating segment ${segment.id} status to failed`);
            await supabasePublic
              .from("Segment")
              .update({ status: "failed" })
              .eq("id", segment.id);
          }
        } catch (segmentError) {
          logError(`Error processing segment ${segment.id}`, segmentError);
          hasFailedSegments = true;

          // Update segment status to failed
          try {
            await supabasePublic
              .from("Segment")
              .update({ status: "failed" })
              .eq("id", segment.id);
          } catch (updateError) {
            logError(
              `Failed to update segment ${segment.id} status to failed`,
              updateError
            );
          }
        }
      }

      // If any segments failed during processing, mark the entire video as failed
      if (hasFailedSegments) {
        logWarning(
          `Some segments failed during processing for video ${videoId}`
        );
        await updateVideoStatus(videoId, "failed");
        // Early return so worker can move on to the next item
        return null;
      }
    } finally {
      // For immediate cleanup of the directories used in this processing run
      await cleanupTempFiles(tempDirectories);
    }

    // 5. Update video status based on processing results
    if (processedSegments.length === 0) {
      logError(`Failed to process any segments for video ${videoId}`);
      await updateVideoStatus(videoId, "failed");
      // Early return so worker can move on to the next item
      return null;
    }

    // 6. Merge all segment videos into a single video file with transitions
    logSectionHeader(
      `MERGING ${processedSegments.length} SEGMENT VIDEOS FOR VIDEO ${videoId}`
    );

    try {
      // Sort segments by their sortedIndex to ensure correct order
      logInfo("Sorting segments by index to ensure correct order");
      processedSegments.sort((a, b) => a.sortedIndex - b.sortedIndex);

      // Download all segment videos to local files
      const localVideoFiles: string[] = [];
      const storyId = video.storyId;
      logInfo(`Preparing to download segment videos for story ${storyId}`);

      // Create a temporary directory for the final video
      logInfo("Creating directory for final merged video");
      const finalVideoDir = path.join(
        config.paths.tempDir,
        config.paths.processingDir,
        `${videoId}`
      );
      fs.mkdirSync(finalVideoDir, { recursive: true });
      tempDirectories.push(finalVideoDir);

      // Prepare the path for the final merged video
      const finalVideoPath = path.join(finalVideoDir, `${videoId}.mp4`);

      // We'll store the finalized video directly in Supabase storage, not locally

      // First, download all segment videos
      for (const segment of processedSegments) {
        if (!segment.videoURL) {
          logWarning(`Segment ${segment.id} has no videoURL, skipping`);
          continue;
        }

        logInfo(`Downloading video for segment ${segment.id}`);
        const segmentVideoPath = path.join(
          finalVideoDir,
          `segment_${segment.id}.mp4`
        );
        const downloaded = await downloadFile(
          segment.videoURL,
          segmentVideoPath
        );

        if (downloaded) {
          logSuccess(`Downloaded video for segment ${segment.id}`);
          localVideoFiles.push(segmentVideoPath);
        } else {
          logError(`Failed to download video for segment ${segment.id}`);
        }
      }

      if (localVideoFiles.length === 0) {
        logError("Failed to download any segment videos");
        await updateVideoStatus(videoId, "failed");
        // Early return so worker can move on to the next item
        return null;
      }

      logSuccess(
        `Successfully downloaded ${localVideoFiles.length} segment videos`
      );

      // Call the new merge function with transition effect
      logInfo("Merging video segments with transition effects");
      const transitionDuration = 0.5; // 0.5 second transition between segments
      await mergeVideosWithTransition(
        localVideoFiles,
        finalVideoPath,
        transitionDuration
      );

      // Upload to the finalized-videos folder in Supabase storage
      const finalizedStorageFileName = `finalized-videos/${videoId}.mp4`;
      logInfo(
        `Uploading finalized video to storage as ${finalizedStorageFileName}`
      );
      const videoURL = await uploadFile(
        finalVideoPath,
        finalizedStorageFileName
      );

      if (!videoURL) {
        logError("Failed to upload final merged video to storage");
        await updateVideoStatus(videoId, "failed");
        // Early return so worker can move on to the next item
        return null;
      }

      logSuccess(`Successfully uploaded video with URL: ${videoURL}`);

      // Update the video record with the URL
      logInfo(`Updating video ${videoId} with URL and completed status`);
      await updateVideoStatus(videoId, "completed", videoURL);

      logSuccess(`Successfully processed and merged video ${videoId}`);

      // Schedule cleanup of temp directories (this will be done asynchronously)
      logInfo(`Scheduling cleanup of temporary files for video ${videoId}`);
      cleanupVideoFiles(videoId).catch((error) => {
        logError(`Error cleaning up files for video ${videoId}`, error);
      });

      return videoURL;
    } catch (mergeError) {
      logError(`Error merging videos for ${videoId}`, mergeError);

      // Fallback: If merging fails, use the first segment's video URL
      logWarning(`Merging failed. Falling back to first segment's video URL`);
      const videoURL = processedSegments[0].videoURL;

      try {
        // Create a fallback directory for the video
        const fallbackDir = path.join(
          config.paths.tempDir,
          config.paths.processingDir,
          `${videoId}_fallback`
        );
        fs.mkdirSync(fallbackDir, { recursive: true });
        tempDirectories.push(fallbackDir);

        // Download the fallback video only to temp directory
        const fallbackVideoPath = path.join(
          fallbackDir,
          `segment_fallback.mp4`
        );

        // Download the fallback video
        logInfo(`Downloading fallback video from ${videoURL}`);
        const downloaded = await downloadFile(videoURL, fallbackVideoPath);

        if (downloaded) {
          // Upload the fallback segment to finalized-videos folder at root level in Supabase storage
          const finalizedStorageFileName = `finalized-videos/${videoId}_fallback.mp4`;
          logInfo(
            `Uploading fallback video to dedicated storage folder as ${finalizedStorageFileName}`
          );
          await uploadFile(fallbackVideoPath, finalizedStorageFileName);
          logSuccess(`Successfully uploaded fallback video to storage`);
        } else {
          logWarning(
            `Could not download fallback video, but will still update database with URL`
          );
        }

        // Even though we have a fallback, we mark the video as failed since the merging process failed
        await updateVideoStatus(videoId, "failed", videoURL);

        logWarning(
          `Fallback: Updated video ${videoId} with first segment URL but marked as failed`
        );

        // Schedule cleanup of temp directories (this will be done asynchronously)
        logInfo(`Scheduling cleanup of temporary files for video ${videoId}`);
        cleanupVideoFiles(videoId).catch((error) => {
          logError(`Error cleaning up files for video ${videoId}`, error);
        });

        // Simply return null to indicate failure, allowing worker to move on
        return null;
      } catch (fallbackError) {
        logError(`Failed to update video with fallback URL`, fallbackError);
        await updateVideoStatus(videoId, "failed");
        throw fallbackError;
      }
    }
  } catch (error) {
    logError("Error processing video", error);

    // Clean up any temporary files that may have been created
    logInfo(`Attempting to clean up temporary files after error`);
    await cleanupVideoFiles(videoId).catch((cleanupError) => {
      logError(`Error cleaning up files for video ${videoId}`, cleanupError);
    });

    // Update video status to failed if there was an error
    try {
      await updateVideoStatus(videoId, "failed");
    } catch (updateError) {
      logError(
        `Failed to update video ${videoId} status to failed`,
        updateError
      );
    }

    return null;
  }
}
