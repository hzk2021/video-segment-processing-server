import fs from 'fs';
import path from 'path';
import { supabasePublic } from './supabase';
import { config } from '../config/config';
import { downloadFile, getAudioDuration, createVideo } from './ffmpeg-service';
import { uploadFile } from './storage-service';

// Validate URL format
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

// Process a segment to create a video
export async function processSegment(segmentId: string): Promise<string | null> {
  try {
    console.log(`Starting to process segment ${segmentId}`);
    
    // Check if supabasePublic is available
    if (!supabasePublic) {
      throw new Error('Supabase client is not initialized');
    }
    
    // 1. Get segment data from database
    const { data: segment, error: segmentError } = await supabasePublic
      .from("Segment")
      .select("imageURL, audioURL, storyId")
      .eq("id", segmentId)
      .single();
    
    if (segmentError || !segment) {
      throw new Error(`Failed to fetch segment ${segmentId}: ${segmentError?.message || "Segment not found"}`);
    }
    
    // Validate URL fields
    if (!segment.imageURL || !segment.audioURL) {
      throw new Error(`Segment ${segmentId} is missing image or audio URL`);
    }
    
    if (!isValidUrl(segment.imageURL) || !isValidUrl(segment.audioURL)) {
      throw new Error(`Segment ${segmentId} has invalid image or audio URL format: 
        imageURL: ${segment.imageURL}, 
        audioURL: ${segment.audioURL}`);
    }
    
    console.log(`Processing segment ${segmentId} with image ${segment.imageURL} and audio ${segment.audioURL}`);
    
    // 2. Create temp directory for processing
    const segmentTempDir = path.join(config.paths.tempDir, config.paths.processingDir, segmentId);
    fs.mkdirSync(segmentTempDir, { recursive: true });
    
    try {
      // 3. Define file paths
      const imagePath = path.join(segmentTempDir, 'image.jpg');
      const audioPath = path.join(segmentTempDir, 'audio.mp3');
      const videoPath = path.join(segmentTempDir, 'output.mp4');
      
      // 4. Download files
      // Create downloads directory if it doesn't exist
      const downloadsDir = path.join(config.paths.tempDir, 'downloads');
      fs.mkdirSync(downloadsDir, { recursive: true });
      
      const imageDownloaded = await downloadFile(segment.imageURL, imagePath);
      const audioDownloaded = await downloadFile(segment.audioURL, audioPath);
      
      if (!imageDownloaded || !audioDownloaded) {
        throw new Error('Failed to download image or audio files');
      }
      
      // 5. Get audio duration
      const duration = await getAudioDuration(audioPath);
      
      // 6. Create video
      await createVideo(imagePath, audioPath, videoPath, duration);
      
      // 7. Upload video to Supabase storage
      const videoFileName = `${segment.storyId}/${segmentId}.mp4`;
      console.log(`Uploading video as ${videoFileName}`);
      const videoUrl = await uploadFile(videoPath, videoFileName);
      
      if (!videoUrl) {
        throw new Error("Failed to upload video to storage");
      }
      
      console.log(`Created video URL: ${videoUrl}`);
      
      return videoUrl;
    } finally {
      // 8. Clean up temp files
      try {
        fs.rmSync(segmentTempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn("Failed to clean up temp files:", cleanupError);
      }
    }
  } catch (error) {
    console.error("Error processing segment:", error);
    return null;
  }
}
