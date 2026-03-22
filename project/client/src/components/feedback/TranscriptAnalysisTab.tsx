import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

export function TranscriptAnalysisTab({ report }: { report: any }) {
  const analysis = report?.transcriptAnalysis;

  if (!analysis || !analysis.overall) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground border rounded-2xl bg-white">
        <h3 className="text-lg font-medium text-slate-900 mb-1">Analiz Bekleniyor</h3>
        <p className="text-sm">Arka planda yapay zeka analizlerinin tamamlanması bekleniyor...</p>
      </div>
    );
  }

  const { overallScore, dimensionScores, overallAnalysis, strengths, improvementAreas, focusTopics } = analysis.overall;
  const { "Bir Sonraki Mülakatta": immediate, "Performans Geliştirme": improvement, "Çalışma Planı": study } = analysis.newRecommendations || {};
  
  // Sadece rapora dahil edilmesi gerekenleri filtrele
  const questions = (analysis.qaEvaluations || []).filter((q: any) => q.visibleInReport !== false);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-[#047857] bg-[#ecfdf5] border-[#a7f3d0]";
    if (score >= 60) return "text-[#b45309] bg-[#fffbeb] border-[#fde68a]";
    return "text-[#b91c1c] bg-[#fef2f2] border-[#fecaca]";
  };

  const radarData = [
    { subject: 'İçerik Kalitesi', score: dimensionScores.contentQuality || 0 },
    { subject: 'İfade & Netlik', score: dimensionScores.communicationClarity || 0 },
    { subject: 'Role Hazırlık', score: dimensionScores.roleReadiness || 0 },
    { subject: 'Teknik Yetkinlik', score: dimensionScores.technicalUnderstanding || 0 },
    { subject: 'Örnekleme', score: dimensionScores.evidenceSupport || 0 },
  ];

  return (
    <div className="space-y-6 bg-[#f4f7fb] text-[#1f2937] p-2 md:p-6 rounded-2xl">
      <div className="mb-2">
        <h1 className="text-3xl font-bold mb-2">Yanıt Analizi</h1>
        <p className="text-[#6b7280] text-[15px] leading-relaxed">
          Teknik mülakat yanıtlarının soru bazlı puanları, detaylı metrikleri ve genel değerlendirmesi.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] items-start">
        <div className="flex flex-col gap-5">
          <div className="bg-white border border-[#e5e7eb] rounded-[18px] p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] flex flex-col md:flex-row items-center justify-between gap-5">
            <div>
              <p className="text-[#6b7280] mb-2.5">Genel Puan</p>
              <p className="text-[64px] leading-none font-extrabold m-0">
                {overallScore}
                <span className="text-2xl font-semibold">/100</span>
              </p>
              <span className="inline-block px-3 py-2 rounded-full text-[13px] font-bold border border-[#fed7aa] bg-[#fff7ed] text-[#c2410c] mt-2.5">
                {overallScore >= 80 ? "Başarılı" : overallScore >= 60 ? "Gelişime Açık" : "Yetersiz"}
              </span>
            </div>

            <div className="grid gap-3 w-full md:w-[42%]">
              <div className="bg-[#f9fafb] border border-[#eef2f7] rounded-[14px] p-3.5">
                <div className="text-[12px] text-[#6b7280] mb-1.5 uppercase tracking-[0.04em]">En Güçlü Alan</div>
                <div className="text-[14px] font-semibold leading-relaxed">{strengths?.[0] || "-"}</div>
              </div>
              <div className="bg-[#f9fafb] border border-[#eef2f7] rounded-[14px] p-3.5">
                <div className="text-[12px] text-[#6b7280] mb-1.5 uppercase tracking-[0.04em]">Öncelikli Gelişim</div>
                <div className="text-[14px] font-semibold leading-relaxed">{improvementAreas?.[0] || "-"}</div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-[18px] p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] flex flex-col justify-center min-h-[260px]">
            <h3 className="text-[16px] font-bold text-center mb-2">Yetkinlik Dağılım Grafiği</h3>
            <div className="w-full h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 600 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <Radar name="Skor" dataKey="score" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.4} />
                  <RechartsTooltip cursor={{strokeDasharray: '3 3'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#e5e7eb] rounded-[18px] p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <h2 className="m-0 mb-4 text-[20px] font-bold">Genel Değerlendirme</h2>
          <p className="text-[#6b7280] leading-[1.7] m-0 text-[15px] whitespace-pre-line">
            {overallAnalysis}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {[
          { label: "İçerik Kalitesi", score: dimensionScores.contentQuality, desc: "Sorulara teknik/içeriksel uyum ve derinlik." },
          { label: "İfade ve Netlik", score: dimensionScores.communicationClarity, desc: "Düşünceleri ifade etme açıklığı ve iletişimin akıcılığı." },
          { label: "Role Hazırlık", score: dimensionScores.roleReadiness, desc: "Genel soru tiplerine karşı verilen cevapların olgunluğu." },
          { label: "Teknik Yetkinlik", score: dimensionScores.technicalUnderstanding, desc: "Teknik doğruluk ve konuya olan teknik hakimiyet." },
        ].map((dim, idx) => (
          <div key={idx} className="bg-white border border-[#e5e7eb] rounded-[18px] p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <h4 className="m-0 mb-2.5 text-[15px] min-h-[38px]">{dim.label}</h4>
            <div className="text-[28px] font-extrabold mb-2.5">{dim.score !== null ? dim.score : "-"}</div>
            <div className="text-[13px] text-[#6b7280] leading-relaxed mb-3 min-h-[40px]">{dim.desc}</div>
            <div className="w-full h-2.5 bg-[#edf2f7] rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${dim.score || 0}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white border border-[#e5e7eb] rounded-[18px] p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <h2 className="m-0 mb-4 text-[20px] font-bold">Güçlü Yönler</h2>
          <ul className="m-0 pl-5 text-[15px]">
            {strengths?.map((item: string, i: number) => (
              <li key={i} className="mb-2.5 leading-[1.55]">{item}</li>
            ))}
          </ul>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-[18px] p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <h2 className="m-0 mb-4 text-[20px] font-bold">Gelişim Alanları</h2>
          <ul className="m-0 pl-5 text-[15px]">
            {improvementAreas?.map((item: string, i: number) => (
              <li key={i} className="mb-2.5 leading-[1.55]">{item}</li>
            ))}
          </ul>
        </div>
      </div>

      {focusTopics && focusTopics.length > 0 && (
        <div className="bg-white border border-[#e5e7eb] rounded-[18px] p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <h2 className="m-0 mb-4 text-[20px] font-bold">Odak Konuları</h2>
          <div className="flex flex-wrap gap-2.5">
            {focusTopics.map((topic: string, i: number) => (
              <span key={i} className="bg-[#eef4ff] text-[#1d4ed8] border border-[#dbeafe] px-3 py-2.5 rounded-full text-[13px] font-semibold">
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-5">
        <div className="bg-white border border-[#e5e7eb] rounded-[18px] p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <h4 className="m-0 mb-3 text-[16px] font-bold">Bir Sonraki Mülakatta</h4>
          <p className="m-0 leading-[1.65] text-[#374151] whitespace-pre-line text-[15px]">
             {immediate ? "- " + immediate.join("\n- ") : "-"}
          </p>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-[18px] p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <h4 className="m-0 mb-3 text-[16px] font-bold">Performans Geliştirme</h4>
          <p className="m-0 leading-[1.65] text-[#374151] whitespace-pre-line text-[15px]">
             {improvement ? "- " + improvement.join("\n- ") : "-"}
          </p>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-[18px] p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <h4 className="m-0 mb-3 text-[16px] font-bold">Çalışma Planı</h4>
          <p className="m-0 leading-[1.65] text-[#374151] whitespace-pre-line text-[15px]">
            {study ? "- " + study.join("\n- ") : "-"}
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-[18px] p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
        <h2 className="m-0 mb-4 text-[20px] font-bold">Soru Bazlı Değerlendirme</h2>
        <div className="grid gap-4">
          {questions.map((q: any) => (
            <div key={q.index} className={`border rounded-[16px] p-[18px] bg-white ${q.isWeak ? 'border-[#fecaca]' : 'border-[#e5e7eb]'}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex gap-2.5 flex-wrap items-center">
                  <span className="font-bold text-[16px]">Soru {q.index}</span>
                  <span className="text-[12px] font-bold bg-[#f3f4f6] text-[#4b5563] rounded-full px-2.5 py-1.5 uppercase">
                    {q.questionType?.replace("_", " ")}
                  </span>
                </div>
                <div className={`min-w-[78px] text-center px-3 py-2.5 rounded-xl font-extrabold text-[18px] border ${getScoreColor(q.score)}`}>
                  {q.score}
                </div>
              </div>
              <p className="m-0 mb-[14px] text-[15px] font-semibold leading-[1.55]">{q.question}</p>
              
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-3.5">
                {[
                  { label: "Uygunluk", val: q.metrics?.relevance },
                  { label: "Netlik", val: q.metrics?.clarity },
                  { label: "Derinlik", val: q.metrics?.depth },
                  { label: "Örnekleme", val: q.metrics?.evidenceExample },
                  { label: "Teknik Doğruluk", val: q.metrics?.technicalAccuracy },
                ].map((m, idx) => (
                  <div key={idx} className="bg-[#f9fafb] border border-[#eef2f7] rounded-xl p-2.5">
                    <div className="text-[12px] text-[#6b7280] mb-1.5">{m.label}</div>
                    {m.val !== null && m.val !== undefined ? (
                      <div className="text-[18px] font-extrabold">{m.val}</div>
                    ) : (
                      <div className="text-[#9ca3af] font-bold text-[14px]">N/A</div>
                    )}
                  </div>
                ))}
              </div>
              
              <p className="m-0 text-[#4b5563] leading-[1.6] text-[14px]">{q.summary}</p>
              {q.isWeak && (
                <div className="mt-3 text-[12px] rounded-[10px] px-2.5 py-2 inline-block text-[#991b1b] bg-[#fef2f2] border border-[#fecaca]">
                  Zayıf performans olarak işaretlendi.
                </div>
              )}
            </div>
          ))}
          {questions.length === 0 && (
             <p className="text-sm text-muted-foreground italic p-4 text-center border rounded-xl">Analiz edilecek soru bulunamadı.</p>
          )}
        </div>
      </div>
    </div>
  );
}
