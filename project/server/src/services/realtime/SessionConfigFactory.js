import { SessionMode } from "../../domain/enums/SessionMode.js";
import { PromptTemplates } from "../ai/PromptTemplates.js";

export class SessionConfigFactory {
  constructor({ promptTemplates = new PromptTemplates() } = {}) {
    this.promptTemplates = promptTemplates;
  }

  create({ mode = SessionMode.NEUTRAL } = {}) {
    const instructions = this.promptTemplates.sessionInstructions({ mode });

    return JSON.stringify({
      type: "realtime",
      model: "gpt-realtime-mini",
      instructions,
      audio: {
        input: {
          turn_detection: {
            type: "server_vad",
            create_response: true,
            prefix_padding_ms: 300,
            silence_duration_ms: 700,
          },
        },
        output: { voice: "marin" },
      },
    });
  }
}
