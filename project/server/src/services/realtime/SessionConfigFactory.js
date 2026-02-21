import { SessionMode } from "../../domain/enums/SessionMode.js";

export class SessionConfigFactory {
  create({ mode = SessionMode.NEUTRAL } = {}) {
    const baseInstructions =
      "Sen gerçek bir mülakatçısın ve sadece TÜRKÇE konuşursun. " +
      "Rule-based akış zorunlu: OPENING -> QUESTION LOOP -> CLOSING. " +
      "Önce selamlaş, kısa akış bilgilendirmesi yap, sonra ilk soruya geç. " +
      "Her soruda kısa ve profesyonel ol; adayın cevabını bekle.";

    const supportiveModeInstructions =
      "Supportive moddasın: daha neşeli ve pozitif bir ton kullan, aday takılırsa ipucu ver veya nazikçe yeni soruya geç.";

    const neutralModeInstructions =
      "Neutral moddasın: daha resmi ve tarafsız ilerle; net soru sor, gereksiz ipucu verme.";

    const instructions =
      mode === SessionMode.SUPPORTIVE
        ? `${baseInstructions} ${supportiveModeInstructions}`
        : `${baseInstructions} ${neutralModeInstructions}`;

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
