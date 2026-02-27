import { SessionMode } from "../../domain/entities/SessionMode.js";

function safe(value, fallback = "") {
  const v = String(value || "").trim();
  return v || fallback;
}

export class SessionConfigFactory {
  create({
    mode = SessionMode.NEUTRAL,
    interviewType = "HR",
    firstName = "Aday",
    lastName = "",
    gender = "Kadın",
    role = "Genel Pozisyon",
    companyOrIndustry = "Genel",
    domainInterest = "Genel",
  } = {}) {
    const title = gender === "Erkek" ? "Bey" : "Hanım";
    const candidateName = `${safe(firstName, "Aday")} ${safe(lastName, "")}`.trim();

    const baseInstructions =
      "Sen gerçek bir mülakatçısın ve sadece TÜRKÇE konuşursun. " +
      "Rule-based akış zorunlu: OPENING -> QUESTION LOOP -> CLOSING sırası dışına çıkma. " +
      "Her aşamada kısa, net ve profesyonel ol.";

    const supportiveModeInstructions =
      "Supportive moddasın: daha neşeli, pozitif ve rahatlatıcı bir ton kullan. " +
      "Aday takılırsa (örn. 'ııı', 'bilmiyorum') kısa ipucu ver veya nazikçe bir sonraki soruya geç.";

    const neutralModeInstructions =
      "Neutral moddasın: resmi, dengeli ve tarafsız ilerle. Gereksiz ipucu verme.";

    const questionStrategy =
      interviewType === "Technical"
        ? "Soru döngüsünde toplam 5-6 teknik soru sor. Sorular adayın hedef rolü, ilgi alanı ve sektör bağlamı ile uyumlu olsun; soruların birbirine çok sıkı bağlı olması zorunlu değil."
        : "Soru döngüsünde STAR yaklaşımına uygun toplam 5-6 soru sor. Her yeni soruyu adayın önceki cevaplarına göre şekillendir ve önceki cevapları unutma.";

    const flowRules = [
      `Aday bilgileri: ${candidateName}, hitap: ${title}, hedef rol: ${safe(role, "Genel Pozisyon")}, şirket/sektör: ${safe(companyOrIndustry, "Genel")}, ilgi alanı: ${safe(domainInterest, "Genel")}, mülakat tipi: ${interviewType}.`,
      "OPENING zorunlu akış:",
      `1) Selamlaş: 'Merhaba ${safe(firstName, "Aday")} ${title}, nasılsınız?' de ve cevap bekle.`,
      "2) Aday yanıtlayınca kısa bir iyi olma cümlesi kur (aday sana nasılsınız demese bile).",
      "3) Mülakat tipini, yaklaşık süresini (12-18 dk), mikrofon-kamera uygunluk kontrolünü tek kısa bilgilendirmeyle belirt.",
      "4) 'Hazırsanız başlayalım' diyerek ilk soruyu sor: 'Kısaca kendinizden bahseder misiniz; eğitim hayatınız ve iş tecrübelerinizden söz eder misiniz?'.",
      "QUESTION LOOP zorunlu kurallar:",
      questionStrategy,
      "Her soru için kısa süre limiti belirt (örn. 60-120 saniye).",
      "Aday süreyi aşarsa kibarca kes: 'Anladım, bu kadar yeterli, isterseniz devam edelim.'",
      "Her aday cevabından sonra sessizce iç değerlendirme yap (relevancy dahil), adaya sesli paylaşma.",
      "CLOSING zorunlu akış:",
      `Tanışma memnuniyeti bildir, ${safe(firstName, "Aday")} ${title} için geri dönüş süresi bilgisi ver, adayın veda cümlesini bekleyip sonlandır.`,
    ].join(" ");

    const modeInstructions =
      mode === SessionMode.SUPPORTIVE ? supportiveModeInstructions : neutralModeInstructions;

    const instructions = `${baseInstructions} ${modeInstructions} ${flowRules}`;

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
