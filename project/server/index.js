import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.text({ type: ["application/sdp", "text/plain"] }));

const normalizeText = (value, fallback) => {
  const v = (value || "").toString().trim();
  return v.length > 0 ? v : fallback;
};

const getDurationByDifficulty = (difficulty) => {
  if (difficulty === "Intermediate") return "25-30 dakika";
  return "18-22 dakika";
};

const buildFlowRules = ({ interviewType, mode, role, companyOrIndustry, domainInterest, difficulty }) => {
  const duration = getDurationByDifficulty(difficulty);
  const supportiveStyle =
    mode === "Supportive"
      ? [
          "Supportive mod: Tonun daha neşeli, pozitif ve rahatlatıcı olsun.",
          "Aday 'bilmiyorum', 'ııı', 'aaa' gibi zorlanma sinyali verirse kısa ipucu ver, soruyu yeniden çerçevele veya ilgili alt soruya yumuşak geçiş yap.",
        ].join("\n")
      : [
          "Neutral mod: Tarafsız, resmi ve profesyonel kal.",
          "İpucu verme; net soru sor ve gerekirse sadece açıklayıcı takip sorusu sor.",
        ].join("\n");

  const questionRules =
    interviewType === "HR"
      ? [
          "Soru turu toplam 5-6 soru içersin.",
          "İlk soru sabit: 'Hazırsanız başlayalım. Kısaca kendinizden bahseder misiniz; eğitim hayatınız ve iş tecrübelerinizden söz eder misiniz?'",
          "Devamında HR/behavioral sorular sor ve STAR mantığına uygun yönlendir (Situation, Task, Action, Result).",
          "Her yeni soruyu adayın önceki cevaplarına göre kişiselleştir; aynı soruyu tekrar etme.",
        ].join("\n")
      : [
          "Soru turu toplam 5-6 soru içersin.",
          "İlk soru sabit: 'Hazırsanız başlayalım. Kısaca kendinizden bahseder misiniz; eğitim hayatınız ve iş tecrübelerinizden söz eder misiniz?'",
          `Sonraki teknik soruları şu bağlama göre seç: pozisyon='${role}', ilgi alanı='${domainInterest}', şirket/sektör='${companyOrIndustry}', seviye='${difficulty}'.`,
          "Adayın geçmiş proje/çalışmalarını bu ilgi alanı ve pozisyonla ilişkilendirerek sor.",
          "Her yeni soruyu adayın önceki cevaplarına göre kişiselleştir; aynı soruyu tekrar etme.",
        ].join("\n");

  return [
    "Sen gerçek bir mülakatçısın ve her zaman TÜRKÇE konuşursun.",
    "Aşağıdaki akışa KURAL TABANLI (rule-based) şekilde harfiyen uy; direkt soru listesi dökme.",
    "Kısa, net ve mülakatçı üslubunda konuş.",
    supportiveStyle,
    "",
    "[OPENING - zorunlu sıra]",
    "1) Adayı selamla ve '... Hanım/Bey nasılsınız?' benzeri bir ifade kullan.",
    "2) Adayın cevabını bekle.",
    "3) Aday 'siz nasılsınız?' derse 'Ben de iyiyim, teşekkür ederim.' de. Sormadıysa bu cümleyi kısa şekilde yine söyleyebilirsin.",
    `4) Mülakat akışını açıkla: bunun ${interviewType} mülakatı olduğunu, yaklaşık ${duration} süreceğini, kamera/mikrofon uygunluğunu kontrol etmesini söyle.`,
    "",
    "[QUESTION LOOP - zorunlu]",
    questionRules,
    "Her sorudan sonra mutlaka adayın cevabını bekle.",
    "Cevaplardan olgu/başlıkları hafızada tut ve sonraki sorularda referans ver.",
    "",
    "[CLOSING - zorunlu]",
    "Sorular bitince kısa kapanış yap: 'Tanıştığımıza memnun oldum ... değerlendirmeler yapılıp şu süre içinde geri dönüş sağlanacak.'",
    "Kapanıştan sonra adaya son söz hakkı ver ve 'iyi günler/görüşmek üzere' demesini bekle.",
    "Aday veda ettikten sonra mülakatı nazikçe sonlandır.",
  ].join("\n");
};

function makeSessionConfig({
  mode = "Neutral",
  interviewType = "HR",
  role = "Genel Pozisyon",
  companyOrIndustry = "Genel Sektör",
  domainInterest = "Genel Alan",
  difficulty = "Junior",
} = {}) {
  const instructions = buildFlowRules({
    mode,
    interviewType,
    role,
    companyOrIndustry,
    domainInterest,
    difficulty,
  });

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

app.post("/session", async (req, res) => {
  const mode = normalizeText(req.query.mode, "Neutral");
  const interviewType = normalizeText(req.query.interviewType, "HR");
  const role = normalizeText(req.query.role, "Genel Pozisyon");
  const companyOrIndustry = normalizeText(req.query.companyOrIndustry, "Genel Sektör");
  const domainInterest = normalizeText(req.query.domainInterest, "Genel Alan");
  const difficulty = normalizeText(req.query.difficulty, "Junior");
  const offerSdp = req.body;

  try {
    const fd = new FormData();
    fd.set("sdp", offerSdp);
    fd.set(
      "session",
      makeSessionConfig({
        mode,
        interviewType,
        role,
        companyOrIndustry,
        domainInterest,
        difficulty,
      })
    );

    const r = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: fd,
    });

    if (!r.ok) {
      const txt = await r.text();
      console.error("[/session] OpenAI error:", txt);
      return res.status(500).type("text/plain").send(txt);
    }

    const answerSdp = await r.text();
    res.type("application/sdp").send(answerSdp);
  } catch (e) {
    console.error("[/session] Failed:", e);
    res.status(500).json({ error: "Failed to create realtime session" });
  }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`Realtime server listening on http://localhost:${port}`));
