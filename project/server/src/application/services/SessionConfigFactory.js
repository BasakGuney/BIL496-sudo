import { SessionMode } from "../../domain/entities/SessionMode.js";

export class SessionConfigFactory {
  create({ mode = SessionMode.NEUTRAL } = {}) {
    const baseInstructions =
      "Sen gerçek bir mülakatçısın. Her zaman TÜRKÇE konuş. Kısa, net ve profesyonel ol. " +
      "Önce selam ver, sonra 1 cümlede oturumu başlat ve hemen ilk soruyu sor. " +
      "Kullanıcının cevabını bekle; gereksiz uzun açıklama yapma.";

    const supportiveModeInstructions =
      "Supportive moddasın: nazikçe yönlendir, kısa ipuçları ver, kullanıcı takılırsa yeniden çerçevele. " +
      "Ama yine de mülakatçı gibi soruları sırayla sor ve akışı yönet.";

    const neutralModeInstructions =
      "Neutral moddasın: daha tarafsız ve resmi ol, ipucu verme; sadece net sorular sor ve takip soruları sor.";

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
