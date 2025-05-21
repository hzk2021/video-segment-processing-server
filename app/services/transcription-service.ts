import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { config } from "../config/config";

export async function transcribeAudio(audioPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Create a temp directory for transcription output
      const outputDir = path.join(config.paths.tempDir, "transcriptions");
      fs.mkdirSync(outputDir, { recursive: true });

      // Get the base name of the audio file without extension
      const baseName = path.basename(audioPath).split(".")[0];
      const outputPath = path.join(outputDir, `${baseName}.srt`);

      // Run Whisper command
      const whisper = spawn("whisper", [
        audioPath,
        "--model",
        "base", // Use base model for faster processing
        "--language",
        "en", // Specify English language
        "--word_timestamps",
        "True", // Enable word-level timestamps
        "--output_format",
        "srt", // Get SRT format with timestamps
        "--output_dir",
        outputDir,
      ]);

      let output = "";
      let error = "";

      whisper.stdout.on("data", (data) => {
        output += data.toString();
      });

      whisper.stderr.on("data", (data) => {
        error += data.toString();
      });

      whisper.on("close", (code) => {
        try {
          if (code === 0 && fs.existsSync(outputPath)) {
            // Resolve with the transcribed text
            const transcription = fs.readFileSync(outputPath, "utf-8").trim();
            resolve(transcription);

            // Clean up the transcription file
            fs.unlinkSync(outputPath);
          } else {
            reject(
              new Error(
                `Whisper transcription failed with code ${code}: ${error}`
              )
            );
          }
        } catch (err: any) {
          reject(
            new Error(`Failed to read transcription: ${err?.message || err}`)
          );
        }
      });

      whisper.on("error", (err: Error) => {
        reject(new Error(`Failed to start Whisper: ${err.message}`));
      });
    } catch (err: any) {
      reject(
        new Error(`Failed to initialize transcription: ${err?.message || err}`)
      );
    }
  });
}
