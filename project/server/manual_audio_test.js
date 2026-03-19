import fs from "fs/promises";
import path from "path";
import { PythonAnalysisClient } from "./src/services/analysis/PythonAnalysisClient.js";

const client = new PythonAnalysisClient();

async function test() {
  const reportsDir = path.resolve(process.cwd(), "reports");
  const sessionId = "S-1773859433140";
  const transcriptText = await fs.readFile(path.join(reportsDir, sessionId, "transcript.txt"), "utf-8");
  const candidateAnswerDir = path.join(reportsDir, sessionId, "candidate-answers");
  const files = await fs.readdir(candidateAnswerDir).catch(() => []);
  const reportData = {
    candidateAnswerAudioFiles: files.map((file) => ({ relativePath: path.join("candidate-answers", file) })),
    transcriptText,
    report: null,
  };

  console.log("Triggering PythonAnalysisClient manually...");
  
  await client.analyzeSessionAndTranscript({
    sessionId: sessionId,
    baseDir: reportsDir,
    candidateAnswerAudioFiles: reportData.candidateAnswerAudioFiles,
    transcriptText: reportData.transcriptText,
    report: reportData.report
  });

  console.log("Finished executing. Check your Python API logs and the reports folder.");
}

test().catch(console.error);
