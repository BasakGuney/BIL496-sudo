import json
import requests
import re

def is_intro_question(question: str):
    normalized = (question or "").strip().lower()
    intro_markers = [
        "kendinizden bahsedebilir misiniz",
        "kısaca kendinizden bahsedebilir misiniz",
        "hazırsanız başlayalım mı",
        "merhaba",
        "tanıyabilir miyiz",
    ]
    return any(marker in normalized for marker in intro_markers)

def build_grounded_summary(question: str, answer: str, relevance: int, clarity: int):
    words = [part for part in re.split(r"\s+", answer or "") if part]
    filler_count = len(re.findall(r"\b(ıı+|eee+|şey|yani|işte|hımm|hmm|bilmiyorum)\b", answer or "", flags=re.IGNORECASE))

    if is_intro_question(question):
        if len(words) <= 2:
            return "Mülakata giriş sorusunu kısa ve doğrudan yanıtladın."
        return "Kendini tanıtma sorusuna kısa ve doğrudan bir giriş yaptın."

    if len(words) <= 4:
        return "Cevabın çok kısa kaldı; soruyu daha somut ayrıntılarla açman gerekir."

    if filler_count >= 2:
        return "Cevabın konuya değinse de dolgu kelimeleri akıcılığı ve profesyonel etkiyi zayıflatıyor."

    if relevance < 60:
        return "Cevabın soruya tam odaklanmıyor; daha doğrudan ve somut bir yanıt vermelisin."

    if clarity < 60:
        return "Cevabın genel hatlarıyla ilgili ancak ifade netliğini ve cümle düzenini güçlendirmelisin."

    if relevance >= 80 and clarity >= 80:
        return "Cevabın soruyla uyumlu, anlaşılır ve yeterince odaklı."

    return "Cevabın temel olarak soruyla ilişkili; daha somut örnek ve daha net ifade ile güçlenebilir."

def sanitize_analysis(parsed, qa_pairs):
    safe_pairs = qa_pairs or []
    raw_evaluations = parsed.get("qaEvaluations", []) if isinstance(parsed, dict) else []
    sanitized_evaluations = []

    for index, pair in enumerate(safe_pairs, start=1):
        raw = raw_evaluations[index - 1] if index - 1 < len(raw_evaluations) and isinstance(raw_evaluations[index - 1], dict) else {}
        relevance = max(0, min(100, int(raw.get("relevance", 70) or 70)))
        clarity = max(0, min(100, int(raw.get("clarity", 70) or 70)))

        sanitized_evaluations.append({
            "index": index,
            "question": pair.get("question", ""),
            "answer": pair.get("answer", ""),
            "relevance": relevance,
            "clarity": clarity,
            "summary": build_grounded_summary(pair.get("question", ""), pair.get("answer", ""), relevance, clarity),
        })

    overall_score = parsed.get("overallScore", 60) if isinstance(parsed, dict) else 60
    try:
        overall_score = max(0, min(100, int(overall_score)))
    except Exception:
        overall_score = 60

    recommendations = parsed.get("recommendations", []) if isinstance(parsed, dict) else []
    if not isinstance(recommendations, list) or len(recommendations) == 0:
        recommendations = [{
            "title": "Yanıtlarını somutlaştır",
            "text": "Yanıtlarını sorunun ana eksenine doğrudan bağlayarak daha somut örneklerle desteklemelisin. Kısa kalan cevaplarını bir durum, yaptığın aksiyon ve ortaya çıkan sonuç yapısıyla genişletmen değerlendirme kalitesini artırır. Ayrıca gereksiz dolgu kelimelerini azaltıp daha net cümleler kurman profesyonel etkiyi güçlendirir. Mülakat öncesinde sık gelen sorular için 3-4 cümlelik net yanıt taslakları hazırlaman faydalı olur."
        }]

    return {
        "qaEvaluations": sanitized_evaluations,
        "overallScore": overall_score,
        "content": parsed.get("content", []) if isinstance(parsed, dict) else [],
        "communication": parsed.get("communication", []) if isinstance(parsed, dict) else [],
        "recommendations": recommendations,
    }

def analyze_transcript_with_llama(qa_pairs, transcript_text):
    prompt = f"""Sen üst düzey bir İK Uzmanı ve İletişim Koçusun. Karşındaki kişiyle (adayla) RÜTBEN GEREĞİ DOĞRUDAN SEN DİLİYLE (İKİNCİ TEKİL ŞAHIS) KONUŞACAKSIN. BİRİNİ DEĞERLENDİRİRKEN ONA DOĞRUDAN HİTAP ETMELİSİN ("Yaptın", "Söyledin", "Eksiklerin var"). ÜÇÜNCÜ TEKİL ŞAHIS ("Aday", "Adayın", "Aday yaptı") KULLANMAK KESİNLİKLE YASAKTIR. Adayın girdiği bir mülakatın metin (transcript) kayıtlarını inceleyip, ONA DOĞRUDAN HİTAP EDEN yapılandırılmış bir JSON raporu oluşturman isteniyor.

### 📋 MÜLAKAT VERİSİ
- **Tam Diyalog:**
{transcript_text}

- **Soru & Cevap Çiftleri (Özet):**
{json.dumps(qa_pairs, ensure_ascii=False, indent=2)}

### 🎯 GÖREV VE KURALLAR:
1. Her soru-cevap için "Yalnızca Metin/İçerik Kalitesi" üzerinden (ses veya görüntü olmadan) şu metrikleri hesapla (0-100 arası):
   - **relevance (İlgililik ve DOĞRULUK):** Cevap soruya ne kadar odaklı? Aday sorulan YAZILIM/TEKNİK kavrama DOĞRU ve BİLİMSEL bir cevap veriyor mu? Eğer aday bilmediği bir konuyu sallıyorsa (örneğin Polymorphism'e veritabanı özelliği diyorsa veya tamamen uyduruk, yanlış bilgiler veriyorsa) relevance puanını DİREKT olarak 10-30 aralığına DÜŞÜR. Saçma ve teknik olarak yanlış cevaplara asla yüksek relevance verme.
   - **clarity (Netlik ve Üslup):** Kelime dağarcığı, cümle düzgünlüğü, 'ıı', 'şey', 'falan', 'işte' gibi dolgu kelime kullanımı veya kaba tabirler ne durumda? Cevap profesyonel bir üslupta mı yoksa fazlasıyla laçka/gündelik mi?
   - **GİRİŞ SORULARI İSTİSNASI:** Eğer soru sadece "Hazırsanız başlayalım mı?", "Merhaba" gibi bir MÜLAKATA GİRİŞ/TANIŞMA sorusuysa ve aday sadece "başlayalım", "merhaba" gibi kısa bir yanıt verdiyse, adayı BUNUN İÇİN CEZALANDIRMA. Bu tür giriş soruları için `relevance` ve `clarity` değerlerine direkt **100** ver ve `summary` kısmına sadece *"Mülakata giriş sorusu."* yazıp geç. Genel ortalamayı düşürmemesini sağla.

2. "summary" (Özet) kısmını yazarken ŞU KURALLARA KESİNLİKLE UY:
   - ASLA olmayan bir şeyi uydurma (Halüsinasyon YASAK).
   - Soruda veya cevapta açıkça geçmeyen bir kavramı, teknolojiyi, hatayı veya eksikliği ASLA yazma. Örneğin metinde "polymorphism", "veritabanı", "OOP" geçmiyorsa bunlardan söz etme.
   - Sadece metinden DOĞRUDAN gözlenebilen şeyleri yaz: cevap kısa mı, soruya odaklı mı, dolgu kelime var mı, ifade net mi?
   - "Şey, falan, işte, yani" gibi kelimeler kullanıldıysa bunun iletişim yeteneğini ve profesyonel imajını zedelediğini net bir dille belirt (örneğin: "Cevabında çok fazla dolgu kelimesi ve laubali bir üslup var").
   - Teknik olarak yanlış olduğunu söyleyeceksen, YANLIŞ olduğunu iddia ettiğin şey soru veya cevap metninde açıkça yer almak zorundadır. Metinde geçmeyen bir teknik detay uydurma.
   - Doğrudan ve dürüst ol. Kötü veya yanlış bir cevaba "iyi" deme.

3. "recommendations" (Tavsiyeler) Kısmı:
   - Adayın `overallScore`, `relevance` ve `clarity` puanlarını ve mülakatta HATA YAPTIĞI KONULARI baz alarak tek bir çok kapsamlı tavsiye üret.
   - DİKKAT: Üreteceğin bu tavsiye metni (`text` alanı) KESİNLİKLE VE KESİNLİKLE EN AZ 4, EN FAZLA 5 CÜMLEDEN OLUŞAN TEK BİR PARAGRAF (STRING METİN) OLMALIDIR. Dizi (array) veya madde işareti kullanma! Kendi cümleni kur, talimatları kopyalama!
   - Üslubun SON DERECE PROFESYONEL VE KURUMSAL İK DİLİNDE olmalıdır. Laubali, günlük konuşma dili kalıpları YASAKTIR. KESİNLİKLE adaya doğrudan hitap et (Sen dili kullan).
   - Bu 4-5 cümlelik paragrafın içinde şunları kendi cümlelerinle harmanla:
     * İlgililik (doğru cevap verme) ve Netlik (akıcılık/diksiyon) puanlarına göre genel mülakat durumunu özetle.
     * Mülakatta eksik kaldığın konuları SADECE transcript içinde gerçekten geçen başlıklarla isimlendir. Transcriptte geçmeyen konu adı, teknoloji veya kavram UYDURMA.
     * İletişim yeteneği (Clarity) düşükse, "ııı", "şey", "yani" gibi dolgu kelimelerini AZALTMASI gerektiğini söyle. ASLA "dolgu kelimesi kullanmana ihtiyaç var" gibi saçma tavsiyeler VERME. "İletişimini güçlendirmek için dolgu kelimeleri kullanmayı bırakmalı ve daha net, profesyonel cümleler kurmalısın" tarzı yapıcı bir uyarı yap.
     * Bu eksiklerini kapatması için eyleme geçirici, yapılandırılmış çalışma adımları öner.
   - ÖRNEK TAVSİYE DİLİ: Somut, profesyonel, metne dayalı ve uygulanabilir ol. Transcriptte geçmeyen konu adı uydurma.

4. 🚫 KESİNLİKLE YASAKLI KELİMELER VEYA İFADELER:
   - "Aday", "Adayın", "Adaya", "Görüyoruz", "Gözlemliyoruz", "Analizimiz", "Senin mülakat performansı", "Sahipsin".
   - "Önemle rica ederim", "Rica ederim".
   - ASLA üçüncü tekil şahıs ("Aday cevap verdi", "Adayın çalışması gerek") kullanma. Doğrudan bana (adaya) hitap et: "Cevabın...", "Konuya odaklanmadın", "Üslubun üzerinde çalışmalısın", "Teknik olarak eksiksin".

5. YALNIZCA aşağıdaki JSON formatında geçerli bir yanıt ver. Metin, markdown veya backtick (```) EKLEME. "notes" alanı YASAKTIR. DOĞRUDAN JSON OBJESİ DÖN.

{{
  "qaEvaluations": [
    {{
      "index": 1,
      "question": "Soru metni",
      "answer": "Cevap metni",
      "relevance": 85,
      "clarity": 70,
      "summary": "Cevabın konuya odaklıydı ancak yer yer dolgu kelimeleri kullandın."
    }}
  ],
  "overallScore": 75,
  "content": [
    {{
      "key": "relevance",
      "label": "İlgililik (Metin)",
      "score": 85,
      "detail": "Sorulara verdiğin cevapların konularla uyumu."
    }}
  ],
  "communication": [
    {{
       "key": "clarity",
       "label": "Netlik (Metin)",
       "score": 70,
       "detail": "Sözcük dağarcığı ve dolgu kelime kullanımın."
    }}
  ],
  "recommendations": [
    {{
      "title": "[Buraya Puan Analizine Göre Dinamik Bir Başlık Üret]",
      "text": "[Buraya Puan Analizine Göre Dinamik Bir Tavsiye Metni Üret]"
    }}
  ]
}}
"""

    url = "http://localhost:11434/api/generate"
    payload = {
        "model": "llama3.1",
        "prompt": prompt,
        "format": "json",
        "stream": False,
        "options": {
            "temperature": 0.1
        }
    }

    try:
        response = requests.post(url, json=payload, timeout=600)
        response.raise_for_status()
        result = response.json()
        response_text = result.get("response", "{}")
        
        # Parse JSON to ensure valid return
        parsed = json.loads(response_text)
        return sanitize_analysis(parsed, qa_pairs)
    except Exception as e:
        print(f"Transcript Analysis Error: {e}")
        # Return fallback heuristic format matching the layout if Ollama fails
        return {
            "qaEvaluations": [],
            "overallScore": 50,
            "content": [{"key": "relevance", "label": "İlgililik", "score": 50, "detail": "LLM bağlantı hatası nedeniyle detaylı analiz yapılamadı."}],
            "communication": [],
            "recommendations": [{"title": "Bağlantı Hatası", "text": f"Yapay Zeka Hatası: {str(e)}"}]
        }
