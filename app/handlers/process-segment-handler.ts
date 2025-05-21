import { validateConfig, config } from '../config/config';
import { processSegment } from "../services/segment-processor"
import { supabasePGMQPublic, supabasePublic } from "../services/supabase";
import { HandlerResponse } from '../types';
import { logger } from '../utils/logger';

// Validate the configuration before starting
validateConfig();

// The main handler function that processes the next segment in the queue
export async function handler(event?: any): Promise<HandlerResponse> {
  const queue_name = config.queue.name;
  
  try {
    logger.info('Starting segment processing', {
      queue: queue_name,
      supabaseUrl: config.supabase.url.substring(0, 10) + '...'
    });
    
    // Check if the Supabase clients are available
    if (!supabasePGMQPublic || !supabasePublic) {
      throw new Error("Supabase clients not available");
    }
    
    // Use the 'pgmq.pop' RPC function to get a message from the queue
    const { data, error } = await supabasePGMQPublic.rpc("pop", {
      queue_name
    });
    
    if (error) {
      throw error;
    }
    
    if (!data || data.length === 0) {
      logger.info("No messages in queue");
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No messages in queue" })
      };
    }
    
    const q = data[0];
    const message_id = q.msg_id;
    
    // Validate the message format
    if (!q.message || typeof q.message !== 'object' || !q.message.segmentId) {
      logger.error("Invalid message format", { message: q.message });
      
      // Archive invalid messages
      await supabasePGMQPublic.rpc("archive", {
        queue_name,
        msg_id: message_id
      });
      
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: "Invalid message format", 
          message: "Message archived due to invalid format" 
        })
      };
    }
    
    const segmentId = q.message.segmentId;
    
    try {
      logger.info('Processing segment', { segmentId });
      
      // Process the segment to create a video
      const videoURL = await processSegment(segmentId);
      
      if (!videoURL) {
        throw new Error("Failed to process segment and create video");
      }
      
      // Update the videoURL field of the corresponding segment
      const { data: updatedSegment, error: updateError } = await supabasePublic
        .from("Segment")
        .update({ videoURL })
        .eq("id", segmentId)
        .select();
      
      if (updateError || !updatedSegment || updatedSegment.length === 0) {
        throw new Error(`Update failed: ${updateError?.message || 'Unknown update error'}`);
      }
      
      // Acknowledge the message by archiving it
      await supabasePGMQPublic.rpc("archive", {
        queue_name,
        msg_id: message_id
      });
      
      logger.info('Successfully processed segment', { segmentId, videoURL });
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: `Successfully processed segment ${segmentId}`,
          videoURL
        })
      };
    } catch (processingError) {
      logger.error('Processing error', {
        segmentId,
        error: processingError
      });
      
      // Log the error and archive the message - no ProcessingErrors logging needed
      await supabasePGMQPublic.rpc("archive", {
        queue_name,
        msg_id: message_id
      });
      
      return {
        statusCode: 422,
        body: JSON.stringify({
          message: `Failed to process segment ${segmentId}. Message archived.`,
          error: (processingError as Error).message
        })
      };
    }
  } catch (overallError) {
    logger.error('Overall handler error', { error: overallError });
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Overall function failure",
        message: (overallError as Error).message
      })
    };
  }
}
