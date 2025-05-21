// Common types for the local processing server functions

// Response format for handlers
export interface HandlerResponse {
  statusCode: number;
  body: string;
}

// Segment data structure
export interface Segment {
  id: string;
  storyId: string;
  imageURL?: string;
  audioURL?: string;
  videoURL?: string;
  orderIndex: number;
  text?: string;
}

// Error types for better error handling
export enum ErrorType {
  TEMPORARY = 'temporary', // Retry-able error (e.g., network issues)
  PERMANENT = 'permanent'  // Non-retry-able error (e.g., invalid data)
}
