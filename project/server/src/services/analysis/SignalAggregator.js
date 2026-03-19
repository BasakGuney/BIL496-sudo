export class SignalAggregator {
  toReport(session, audio, vision, visionAnalysis = null) {
    const metricsForScore = [audio.pacingScore, vision.focusScore, vision.headMovementScore].filter(
      (value) => Number.isFinite(value)
    );
    const overallScore = Math.round(
      metricsForScore.reduce((sum, value) => sum + value, 0) / Math.max(metricsForScore.length, 1)
    );

    const behavioral = [
      {
        key: 'focus',
        label: 'Odak',
        score: vision.focusScore,
        detail: vision.status === 'ready'
          ? 'Yüz görünürlüğü ve kadraj merkezi üzerinden hesaplandı.'
          : 'Görüntü analizi yetersiz olduğu için skor sınırlı güvenle üretildi.',
      },
      {
        key: 'framing',
        label: 'Kadraj',
        score: vision.framingScore,
        detail: 'Yüzün görüntü merkezine yakınlığına göre hesaplandı.',
      },
      {
        key: 'headMovement',
        label: 'Baş hareketi',
        score: vision.headMovementScore,
        detail: 'Yüz kutusunun frame içindeki konum değişimlerinden türetildi.',
      },
      {
        key: 'facePresence',
        label: 'Yüz görünürlüğü',
        score: vision.facePresenceScore,
        detail: 'Örneklenen framelerde yüz tespit edilme oranını gösterir.',
      },
    ];

    const visionNotes = Array.isArray(vision?.notes) ? vision.notes : [];
    const summary = visionAnalysis?.summary || {};
    const supportiveOverlayNote = vision.supportiveOverlayUsed
      ? 'Supportive mod sırasında ekranda yüz çerçevesi gösterildi.'
      : null;

    return {
      id: `R-${session.id}`,
      sessionId: session.id,
      overallScore,
      content: [
        { key: 'relevance', label: 'İlgililik', score: 75, detail: 'Soru-cevap odak uyumu değerlendirildi.' },
      ],
      communication: [
        { key: 'pacing', label: 'Tempo', score: audio.pacingScore, detail: 'Konuşma akışı değerlendirildi.' },
      ],
      behavioral,
      recommendations: [
        { title: 'Kısa ve net ilerleyin', text: 'Her cevabı sonuç odaklı bir örnekle bitirin.' },
        {
          title: 'Kadrajı sabitleyin',
          text: summary.facePresenceRatio >= 0.7
            ? 'Yüz görünürlüğün genel olarak iyi. Aynı hizayı korumaya devam et.'
            : 'Kamerayı göz hizasında tutup yüzünü kadrajın ortasına alman görsel analiz kalitesini artırır.',
        },
      ],
      notes: [
        'Davranışsal metrikler koçluk amaçlıdır.',
        ...visionNotes,
        ...(supportiveOverlayNote ? [supportiveOverlayNote] : []),
      ],
    };
  }
}
