import fs from "fs/promises";
import path from "path";
import { PythonAnalysisClient } from "./src/services/analysis/PythonAnalysisClient.js";

const client = new PythonAnalysisClient();

async function test() {
  const reportsDir = path.resolve(process.cwd(), "reports");
  const sessionId = "S-1773567046663";
  const jsonPath = path.join(reportsDir, sessionId, "report.json");

  console.log(`Reading ${jsonPath}...`);
  const content = await fs.readFile(jsonPath, "utf-8");
  const reportData = JSON.parse(content);

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
