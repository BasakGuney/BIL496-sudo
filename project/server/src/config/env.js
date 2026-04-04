import "dotenv/config";

export function getEnv() {
  return {
    port: Number(process.env.PORT || 3001),
    openAiApiKey: process.env.OPENAI_API_KEY,
    reportsDir: process.env.REPORTS_DIR,
    pythonApiBaseUrl: process.env.PYTHON_API_BASE_URL,
  };
}
