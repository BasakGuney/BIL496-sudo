import "dotenv/config";

export function getEnv() {
  return {
    port: Number(process.env.PORT || 3001),
    openAiApiKey: process.env.OPENAI_API_KEY || "",
  };
}
