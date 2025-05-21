import fs from 'fs';
import path from 'path';
import { config } from '../config/config';
import { supabasePublic } from './supabase';

/**
 * Cleanup function to remove temporary files after processing
 * @param directories Array of temporary directory paths to clean up
 */
export async function cleanupTempFiles(directories: string[]): Promise<void> {
  try {
    console.log('Starting cleanup of temporary files...');
    
    // Clean up temporary directories
    for (const directory of directories) {
      if (fs.existsSync(directory)) {
        console.log(`Removing directory: ${directory}`);
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
    
    console.log('Files cleanup completed');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

/**
 * Cleanup all files related to a specific video
 * @param videoId The ID of the video to clean up files for
 */
export async function cleanupVideoFiles(videoId: string): Promise<void> {
  try {
    console.log(`Cleaning up all files for video ${videoId}...`);
    
    // Directories to clean up
    const dirsToCleanup: string[] = [];
    
    // Add video temp directory
    const videoTempDir = path.join(config.paths.tempDir, config.paths.processingDir, videoId);
    if (fs.existsSync(videoTempDir)) {
      dirsToCleanup.push(videoTempDir);
    }
    
    // Get story ID for this video to clean up segment files
    if (supabasePublic) {
      const { data: video } = await supabasePublic
        .from('Video')
        .select('storyId')
        .eq('id', videoId)
        .single();
      
      if (video?.storyId) {
        // Get segments for this story
        const { data: segments } = await supabasePublic
          .from('Segment')
          .select('id')
          .eq('storyId', video.storyId);
        
        if (segments && segments.length > 0) {
          // Add segment temp directories
          for (const segment of segments) {
            const segmentTempDir = path.join(config.paths.tempDir, config.paths.processingDir, segment.id);
            if (fs.existsSync(segmentTempDir)) {
              dirsToCleanup.push(segmentTempDir);
            }
          }
          
          // Also check and clean any downloads directory containing these segments
          const downloadsDir = path.join(config.paths.tempDir, 'downloads');
          if (fs.existsSync(downloadsDir)) {
            dirsToCleanup.push(downloadsDir);
          }
        }
      }
    }
    
    // Clean up all directories
    await cleanupTempFiles(dirsToCleanup);
    
    console.log(`Cleaned up all files for video ${videoId}`);
  } catch (error) {
    console.error(`Error cleaning up files for video ${videoId}:`, error);
  }
}

/**
 * Schedule periodic cleanup of the temp directory
 * Runs every hour by default
 */
export function schedulePeriodicCleanup(intervalMs = 3600000): NodeJS.Timeout {
  console.log(`Scheduling periodic cleanup of temp directory: ${config.paths.tempDir}`);
  
  // Run cleanup immediately
  cleanupOrphanedTempDirectories();
  
  // Then schedule periodic cleanup
  return setInterval(() => {
    cleanupOrphanedTempDirectories();
  }, intervalMs);
}

/**
 * Cleans up orphaned temp directories that might be left from crashed processes
 * Directories older than 24 hours will be removed
 */
export async function cleanupOrphanedTempDirectories(): Promise<void> {
  try {
    const tempDir = config.paths.tempDir;
    
    if (!fs.existsSync(tempDir)) {
      console.log(`Temp directory doesn't exist: ${tempDir}`);
      return;
    }
    
    console.log(`Checking for orphaned temp directories in: ${tempDir}`);
    
    const now = Date.now();
    const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
    
    // Check the processing directory
    const processingDir = path.join(tempDir, config.paths.processingDir);
    if (fs.existsSync(processingDir)) {
      const items = fs.readdirSync(processingDir);
      
      for (const item of items) {
        const itemPath = path.join(processingDir, item);
        const stats = fs.statSync(itemPath);
        
        // Check if the directory is older than MAX_AGE_MS
        if (stats.isDirectory() && now - stats.mtimeMs > MAX_AGE_MS) {
          console.log(`Removing orphaned processing directory: ${itemPath}`);
          fs.rmSync(itemPath, { recursive: true, force: true });
        }
      }
    }
    
    // Check the downloads directory too
    const downloadsDir = path.join(tempDir, 'downloads');
    if (fs.existsSync(downloadsDir)) {
      const items = fs.readdirSync(downloadsDir);
      
      for (const item of items) {
        const itemPath = path.join(downloadsDir, item);
        const stats = fs.statSync(itemPath);
        
        // Check if the file/directory is older than MAX_AGE_MS
        if (now - stats.mtimeMs > MAX_AGE_MS) {
          console.log(`Removing orphaned download: ${itemPath}`);
          fs.rmSync(itemPath, { recursive: true, force: true });
        }
      }
      
      // If downloads directory is empty, remove it too
      const remainingItems = fs.readdirSync(downloadsDir);
      if (remainingItems.length === 0) {
        console.log(`Removing empty downloads directory: ${downloadsDir}`);
        fs.rmSync(downloadsDir, { recursive: true, force: true });
      }
    }
    
    console.log('Orphaned temp directories cleanup completed');
  } catch (error) {
    console.error('Error during orphaned temp cleanup:', error);
  }
}
