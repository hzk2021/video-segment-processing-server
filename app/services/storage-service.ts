import fs from 'fs';
import { supabasePublic } from './supabase';
import { config } from '../config/config';

// Upload a file to Supabase storage
export async function uploadFile(filePath: string, storageFileName: string, isRootLevel = false): Promise<string | null> {
  try {
    // Check if supabasePublic is available
    if (!supabasePublic) {
      throw new Error('Supabase client is not initialized');
    }
    
    const fileContent = fs.readFileSync(filePath);
    
    // Determine storage path - if path starts with 'finalized-videos/', it should be at root level
    const storagePath = storageFileName.startsWith('finalized-videos/') 
      ? storageFileName 
      : `videos/${storageFileName}`;
    
    const { data, error } = await supabasePublic.storage
      .from(config.supabase.storageBucket)
      .upload(storagePath, fileContent, {
        contentType: 'video/mp4',
        upsert: true
      });
    
    if (error) {
      throw error;
    }
    
    if (!supabasePublic) {
      throw new Error('Supabase client is not initialized');
    }
    
    // Get public URL
    const { data: publicUrlData } = supabasePublic.storage
      .from(config.supabase.storageBucket)
      .getPublicUrl(storagePath);
    
    return publicUrlData.publicUrl;
  } catch (error) {
    console.error("Error uploading file:", error);
    return null;
  }
}
