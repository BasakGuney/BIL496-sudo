import json
import requests

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
   - "Şey, falan, işte, yani" gibi kelimeler kullanıldıysa bunun iletişim yeteneğini ve profesyonel imajını zedelediğini net bir dille belirt (örneğin: "Cevabında çok fazla dolgu kelimesi ve laubali bir üslup var").
   - Aday teknik olarak tamamen YANLIŞ bir cevap verdiyse bunu summary'de KESİNLİKLE yüzüne vur: "Polymorphism'in veritabanıyla alakası yoktur, konsepti tamamen yanlış biliyorsun" gibi doğrudan ve net düzeltmeler yap.
   - Doğrudan ve dürüst ol. Kötü veya yanlış bir cevaba "iyi" deme.

3. "recommendations" (Tavsiyeler) Kısmı:
   - Adayın `overallScore`, `relevance` ve `clarity` puanlarını ve mülakatta HATA YAPTIĞI KONULARI baz alarak tek bir çok kapsamlı tavsiye üret.
   - DİKKAT: Üreteceğin bu tavsiye metni (`text` alanı) KESİNLİKLE VE KESİNLİKLE EN AZ 4, EN FAZLA 5 CÜMLEDEN OLUŞAN TEK BİR PARAGRAF (STRING METİN) OLMALIDIR. Dizi (array) veya madde işareti kullanma! Kendi cümleni kur, talimatları kopyalama!
   - Üslubun SON DERECE PROFESYONEL VE KURUMSAL İK DİLİNDE olmalıdır. Laubali, günlük konuşma dili kalıpları YASAKTIR. KESİNLİKLE adaya doğrudan hitap et (Sen dili kullan).
   - Bu 4-5 cümlelik paragrafın içinde şunları kendi cümlelerinle harmanla:
     * İlgililik (doğru cevap verme) ve Netlik (akıcılık/diksiyon) puanlarına göre genel mülakat durumunu özetle.
     * Mülakatta bilemediği, uydurduğu teknik konuları İSMEN söyleyerek ("Polymorphism ve OOP konularında ciddi eksiklerin olduğunu gözlemledim") neyi çalışması gerektiğini yüzüne vur.
     * İletişim yeteneği (Clarity) düşükse, "ııı", "şey", "yani" gibi dolgu kelimelerini AZALTMASI gerektiğini söyle. ASLA "dolgu kelimesi kullanmana ihtiyaç var" gibi saçma tavsiyeler VERME. "İletişimini güçlendirmek için dolgu kelimeleri kullanmayı bırakmalı ve daha net, profesyonel cümleler kurmalısın" tarzı yapıcı bir uyarı yap.
     * Bu eksiklerini kapatması için eyleme geçirici, yapılandırılmış çalışma adımları öner.
   - ÖRNEK TAVSİYE ŞABLONU (BUNA BENZER BİR DİL KULLAN):
     "İlgililik ve netlik açısından mülakat performansında gelişime açık yönler bulunuyor. Özellikle Polymorphism ve veritabanı yönetimi gibi kritik kavramlarda ciddi bilgi eksikliklerin olduğunu gözlemledim. Bu teknik temel eksikliğini gidermek adına nesne yönelimli programlama (OOP) prensiplerini baştan çalışmalısın. Teorik çalışmalarını pratik kodlama egzersizleriyle desteklemeni tavsiye ederim."

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
        "stream": False
    }

    try:
        response = requests.post(url, json=payload, timeout=600)
        response.raise_for_status()
        result = response.json()
        response_text = result.get("response", "{}")
        
        # Parse JSON to ensure valid return
        parsed = json.loads(response_text)
        return parsed
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
