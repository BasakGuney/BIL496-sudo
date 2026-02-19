import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.text({ type: ["application/sdp", "text/plain"] }));

function makeSessionConfig({ mode = "Neutral" } = {}) {
  // ✅ Türkçe ve direkt interviewer gibi başla
  const base =
    "Sen gerçek bir mülakatçısın. Her zaman TÜRKÇE konuş. Kısa, net ve profesyonel ol. " +
    "Önce selam ver, sonra 1 cümlede oturumu başlat ve hemen ilk soruyu sor. " +
    "Kullanıcının cevabını bekle; gereksiz uzun açıklama yapma.";

  const supportive =
    "Supportive moddasın: nazikçe yönlendir, kısa ipuçları ver, kullanıcı takılırsa yeniden çerçevele. " +
    "Ama yine de mülakatçı gibi soruları sırayla sor ve akışı yönet.";

  const neutral =
    "Neutral moddasın: daha tarafsız ve resmi ol, ipucu verme; sadece net sorular sor ve takip soruları sor.";

  const instructions = mode === "Supportive" ? `${base} ${supportive}` : `${base} ${neutral}`;

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
  const mode = (req.query.mode || "Neutral").toString();
  const offerSdp = req.body;

  try {
    const fd = new FormData();
    fd.set("sdp", offerSdp);
    fd.set("session", makeSessionConfig({ mode }));

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
