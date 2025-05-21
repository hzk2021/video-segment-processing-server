import { validateConfig, config } from '../config/config';
import { processVideo } from "../services/video-processor";
import { supabasePGMQPublic, supabasePublic } from "../services/supabase";
import { HandlerResponse } from '../types';

// Validate the configuration before starting
validateConfig();

// The main handler function that processes the next video in the queue
export async function handler(event?: any): Promise<HandlerResponse> {
  const queue_name = config.queue.name;
  
  try {
    console.log(`Starting video processing from queue: ${queue_name}`);
    console.log(`Supabase URL: ${config.supabase.url.substring(0, 10)}...`); // Only log part of the URL for security
    console.log(`Queue config: ${JSON.stringify(config.queue)}`);
    
    // Check if the Supabase clients are available
    if (!supabasePGMQPublic) {
      console.error("Supabase PGMQ client is not available");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Supabase PGMQ client configuration error" })
      };
    }

    if (!supabasePublic) {
      console.error("Supabase Public client is not available");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Supabase Public client configuration error" })
      };
    }
    
    // Use the 'pgmq.pop' RPC function to get a message from the queue
    const { data, error } = await supabasePGMQPublic.rpc("pop", {
      queue_name
    });
    
    console.log(`Queue response: ${JSON.stringify({ data, error }, null, 2)}`);
    
    if (error) {
      console.error("Error popping from queue:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      };
    }
    
    if (!data || data.length === 0) {
      console.log("No messages in the queue");
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No messages in the queue" })
      };
    }
    
    const q = data[0];
    const message_id = q.msg_id;
    
    // Validate the message format
    if (!q.message || typeof q.message !== 'object' || !q.message.videoId) {
      console.error("Invalid message format:", q.message);
      
      // Archive invalid messages to prevent them from being processed again
      if (supabasePGMQPublic) {
        await supabasePGMQPublic.rpc("archive", {
          queue_name,
          msg_id: message_id
        });
      }
      
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: "Invalid message format", 
          message: "Message archived due to invalid format" 
        })
      };
    }
    
    const videoId = q.message.videoId;
    
    try {
      console.log(`Processing video ${videoId}`);
      
      // Process the video to create a video from all segments
      const videoURL = await processVideo(videoId);
      
      if (!videoURL) {
        throw new Error("Failed to process video");
      }
      
      // Acknowledge the message by archiving it
      if (!supabasePGMQPublic) {
        throw new Error("Supabase PGMQ client not available for archiving message");
      }
      
      await supabasePGMQPublic.rpc("archive", {
        queue_name,
        msg_id: message_id
      });
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: `Successfully processed video ${videoId}`,
          videoURL
        })
      };
    } catch (processingError) {
      console.error("Error processing message:", processingError);
      
      // Log the error and archive the message
      const errorMessage = (processingError as Error).message;
      console.error(`Error processing video ${videoId}:`, errorMessage);
      
      if (!supabasePGMQPublic) {
        throw new Error("Supabase PGMQ client not available for archiving message");
      }
      
      await supabasePGMQPublic.rpc("archive", {
        queue_name,
        msg_id: message_id
      });
      
      return {
        statusCode: 422,
        body: JSON.stringify({
          message: `Failed to process video ${videoId}. Message archived.`,
          error: errorMessage
        })
      };
    }
  } catch (error) {
    console.error("Unhandled error in handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: (error as Error).message })
    };
  }
}
