import json
import requests
import os

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    try:
        with open("../../../../../.env", "r") as f:
            for line in f:
                if line.startswith("OPENAI_API_KEY="):
                    OPENAI_API_KEY = line.split("=", 1)[1].strip()
    except Exception:
        pass

def _merge_consecutive_candidate_lines(transcript_text: str) -> str:
    """
    Arka arkaya gelen [Candidate] satırlarını birleştir.
    Örn: 
      [Candidate] Olayı hatırlamıyorum...
      [Candidate] Ne diyeceğimi bilemiyorum.
    →  [Candidate] Olayı hatırlamıyorum... Ne diyeceğimi bilemiyorum.
    """
    lines = transcript_text.strip().splitlines()
    merged = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("[Candidate]") and merged and merged[-1].startswith("[Candidate]"):
            # Önceki satırla birleştir
            merged[-1] = merged[-1].rstrip() + " " + stripped[len("[Candidate]"):].strip()
        else:
            merged.append(stripped)
    return "\n".join(merged)


def _extract_question(text: str) -> str:
    """
    Interviewer cümlesinden sadece soruyu çıkarır.
    Geçiş ifadeleri (teşekkür, onay, yönlendirme) varsa bunları atar,
    soru işareti içeren cümle(ler)i döndürür.

    Örn:
      "Teşekkür ederim. Şimdi bir sonraki soruya geçelim: X misiniz? Y midir?"
      → "X misiniz? Y midir?"

    Cümle soru işareti içermiyorsa (salt yönlendirme/meta) orijinal metin döner.
    """
    import re
    if not text or "?" not in text:
        return text

    # Nokta/ünlem/soru işaretinden sonra boşluk varsa cümle sınırı say
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    question_sentences = [s for s in sentences if "?" in s]

    if question_sentences:
        return " ".join(question_sentences)
    return text



def parse_transcript_to_structured_blocks_gpt(transcript_text: str) -> list:
    # Önce ard arda gelen [Candidate] satırlarını birleştir
    transcript_text = _merge_consecutive_candidate_lines(transcript_text)

    prompt = f"""Sen uzman bir mülakat analizcisisin. SADECE geçerli JSON dizisi (Array) döndür.

Görevin:
Aşağıdaki ham mülakat dökümünü (transcript) incele ve anlamlı soru-cevap bloklarına ayır.

━━━ META / SETUP KURALI (ÇOK ÖNEMLİ) ━━━
Aşağıdaki ifadeler GERÇEK soru DEĞİLDİR → hepsi "setup_or_meta" tipi olmalıdır:
• Selamlama / hoş geldin: "Merhaba", "Hoş geldiniz", "İyi günler"
• Hazırlık teyidi: "Hazırsanız başlayalım mı?", "Başlayabilir miyiz?", "Başlayalım mı?"
• Süre / kural açıklaması: "Mülakatımız 30 dk sürecek", "Kısaca kuralları açıklayayım"
• Akış yönlendirmesi: "Bir sonraki soruya geçelim", "Devam edelim"
• Kapanış / teşekkür: "Teşekkür ederim", "Görüşmek üzere", "İyi günler", "Başka sorunuz var mı?"
• Adayın bu tür ifadelere verdiği kısa meta cevaplar da setup_or_meta bloğunun "answer" kısmına yazılır
  (örn: "Başlayalım lütfen.", "Hazırım.", "Teşekkürler.", "Hayır, sorum yok.")

Eğer bir mülakatçı cümlesinde hem hazırlık ifadesi hem de gerçek soru BİRLİKTE yer alıyorsa → bunları BÖL, İKİ AYRI nesne olarak ekle.

━━━ GERÇEK SORU KURALI ━━━
Gerçek sorular kişisel tanıtım, motivasyon, davranışsal, teknik veya deneyim sorusudur.
Sadece "merhaba" geçtiği için gerçek soruyu meta zannetme.

ÇOK ÖNEMLİ: Aday tek kelimeyle veya çok kısa cevap vermişse bu yine geçerli bir cevaptır ve o soru için ayrı bir "question" bloğu oluşturulmalıdır. Örnek:
  [Interviewer] Şu anda üzerinde çalıştığınız bir proje var mı?
  [Candidate]   Bilemiyorum.
  → {{"type": "question", "question": "Şu anda üzerinde çalıştığınız bir proje var mı?", "answer": "Bilemiyorum."}}

Aday aynı soruya arka arkaya birden fazla cümleyle cevap vermiş olabilir. Bu cümlelerin hepsini tek bir "answer" değeri olarak birleştir; hiçbirini atlama.

Eğer bir soru sorulmuş ancak cevap yoksa "answer" alanını KESİNLİKLE BOŞ BİRAK (""). "...", "[Cevap Yok]" gibi uydurma metinler YAZMA.

Döküm:
{transcript_text}

ÇIKTI FORMATI (SADECE JSON DIZISI):
[
  {{
    "type": "setup_or_meta",
    "question": "Merhaba, hoş geldiniz. Bu mülakat 30 dk sürecek. Hazırsanız başlayalım mı?",
    "answer": "Merhaba, başlayalım."
  }},
  {{
    "type": "question",
    "question": "Kısaca kendinizden bahsedebilir misiniz?",
    "answer": "Tabii, adım..."
  }},
  {{
    "type": "setup_or_meta",
    "question": "Teşekkür ederim. Görüşmek üzere.",
    "answer": "Teşekkürler, iyi günler."
  }}
]
"""
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "You output JSON array only."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.0
    }
    try:
        response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=25)
        response.raise_for_status()
        result = response.json()
        response_text = result["choices"][0]["message"]["content"]
        if response_text.startswith("```json"):
            response_text = response_text.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(response_text)
        return parsed
    except Exception as e:
        print(f"GPT Parser Error: {e}")
        # Hata durumunda boş dizi dön, fallback dışarıda yapılacak
        return []

def analyze_single_qa_gpt(question: str, answer: str, interview_type: str = "Technical", is_meta: bool = False) -> dict:
    if is_meta:
       return {
            "questionType": "meta",
            "applicableMetrics": [],
            "metrics": {
                "relevance": None,
                "clarity": None,
                "depth": None,
                "evidenceExample": None,
                "technicalAccuracy": None
            },
            "summary": "Mülakat akışı, selamlama veya kapanış (değerlendirme dışı).",
            "focusArea": None,
            "visibleInReport": False,
            "excludedFromOverall": True
       }

    prompt = f"""Sen uzman bir mülakat değerlendiricisisin. SADECE geçerli JSON nesnesi döndür.

Görevin:
Verilen gerçek bir soru-cevap çiftini (selamlama/meta değil) değerlendir ve yapılandırılmış çıktı üret.

Interview Type: {interview_type}

SADECE şu soru tiplerinden birini kullan:
- self_presentation
- motivation
- behavioral
- experience
- technical_knowledge
- technical_experience
- problem_solving

Metrik kuralları:
- relevance: cevap soruya ne kadar uygun (aktif - zorunlu)
- clarity: cevap ne kadar net, anlaşılır ve düzenli (aktif - zorunlu)
- depth: cevap ne kadar yeterli ve açıklayıcı (aktif - zorunlu)
- evidenceExample: yalnızca davranışsal/deneyim (behavioral/experience) sorularda somut örnek beklendiğinde kullan.
- technicalAccuracy: yalnızca teknik bilgi veya teknik deneyim sorularında kullan.

Önemli Kurallar:
- Uygun olmayan metrikler KESİNLİKLE null olmalı (0 değil).
- applicableMetrics içinde yalnızca null olmayan, gerçekten uygulanan metriklerin string isimleri (örn: "relevance", "clarity") bulunmalı.
- Technical ise teknik yanlışları / tahminleri sert değerlendir.
- HR ise iletişim ve örneklendirmeyi ön planda tut.
- summary en fazla 2 cümle olsun.
- "Bilemiyorum", "Hatırlamıyorum", "Emin değilim" gibi kısa veya belirsizlik ifade eden cevaplar bile gerçek bir soruya verilmiş cevaplardır. Bunları asla meta/setup olarak işaretleme. Bu tür cevaplarda visibleInReport: true, excludedFromOverall: false olsun; relevance, clarity ve depth düşük puanlanabilir.
- Kapanış nezaketleri / Saf selamlamalar sana gelmemeli ama gelirse meta olarak işaretle (visibleInReport: false, excludedFromOverall: true). Aksi halde visibleInReport: true ve excludedFromOverall: false olsun.

Soru:
{question}

Cevap:
{answer}

SADECE JSON FORMATI:
{{
  "questionType": "technical_knowledge",
  "applicableMetrics": ["relevance", "clarity", "depth", "technicalAccuracy"],
  "metrics": {{
    "relevance": 82,
    "clarity": 76,
    "depth": 61,
    "evidenceExample": 85,
    "technicalAccuracy": 58
  }},
  "summary": "Cevap genel olarak konuya uygundu, ancak teknik doğruluk zayıftı.",
  "focusArea": "Teknik Kavramlar",
  "visibleInReport": true,
  "excludedFromOverall": false
}}
"""
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "You output JSON only."},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.0
    }

    try:
        response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=20)
        response.raise_for_status()
        result = response.json()
        response_text = result["choices"][0]["message"]["content"]
        parsed = json.loads(response_text)
        
        # Güvenlik: Eksik alan varsa doldur
        if "visibleInReport" not in parsed:
            parsed["visibleInReport"] = True
        if "excludedFromOverall" not in parsed:
            parsed["excludedFromOverall"] = False
            
        return parsed
    except Exception as e:
        print(f"GPT Single QA Error: {e}")
        return {
            "questionType": "technical_knowledge",
            "applicableMetrics": ["relevance", "clarity", "depth"],
            "metrics": {
                "relevance": 50,
                "clarity": 50,
                "depth": 50,
                "evidenceExample": None,
                "technicalAccuracy": None
            },
            "summary": f"GPT Hatası: {str(e)}",
            "focusArea": None,
            "visibleInReport": True,
            "excludedFromOverall": False
        }

def compute_question_score(metrics: dict, q_type: str) -> int:
    def safe_int(val):
        try: return int(val) if val is not None else None
        except: return None
        
    rel = safe_int(metrics.get("relevance"))
    clar = safe_int(metrics.get("clarity"))
    dep = safe_int(metrics.get("depth"))
    ev = safe_int(metrics.get("evidenceExample"))
    tech = safe_int(metrics.get("technicalAccuracy"))

    rel = rel if (rel is not None) else 0
    clar = clar if (clar is not None) else 0
    dep = dep if (dep is not None) else 0
    ev = ev if (ev is not None) else 0
    tech = tech if (tech is not None) else 0

    if q_type in ["self_presentation", "motivation"]:
        return int(rel*0.40 + clar*0.30 + dep*0.30)
    elif q_type in ["behavioral", "experience"]:
        # If evidence is collected but is 0, it severely drops score. If absent entirely it shouldn't apply, but weight logic here is rigid for now.
        return int(rel*0.30 + clar*0.20 + dep*0.25 + ev*0.25)
    elif q_type == "technical_knowledge":
        return int(rel*0.25 + clar*0.20 + dep*0.25 + tech*0.30)
    elif q_type in ["technical_experience", "problem_solving"]:
        return int(rel*0.20 + clar*0.15 + dep*0.20 + ev*0.25 + tech*0.20)
    else:
        return int(rel*0.40 + clar*0.30 + dep*0.30)

def generate_overall_analysis_gpt(payload: dict) -> dict:
    prompt = f"""Sen üst düzey bir mülakat değerlendiricisi ve kariyer koçusun. SADECE geçerli JSON nesnesi döndür.

Elinde bir mülakata ait yapılandırılmış veriler var (QA Evaluations, Score vs).
Bu verileri bütünsel olarak analiz ederek genel değerlendirme üret.

Çok önemli kurallar:
1. Tek tek soruları tekrar anlatma, mülakat genelindeki pattern'ları bul.
2. overallAnalysis DETAYLI, ANALİTİK ve KAPSAMLI olsun. Adayın genel mülakat performansını, bilgi seviyesini, öne çıkan güçlü yetkinliklerini ve zayıf kaldığı spesifik teknik/iletişimsel konuları derinlemesine (en az 3 paragraf uzunluğunda, yeni satırlarla \n\n) analiz et. Mülakatın gidişatını ve role uygunluk potansiyelini detaylandır.
3. strengths: Tekrarlayan GÜÇLÜ davranış veya bilgi örüntülerini anlatsın (örneğin "Temel frontend konularında akıcı anlatım").
4. improvementAreas: Tekrarlayan ZAYIF PERFORMANS veya DAVRANIŞ örüntülerini anlatsın (örneğin "Teknik bilgi boşluklarını tahminle doldurma", "Kavramsal doğruluk sorunu", "Yanıtları kısa kesme". Konu adı olmasın!).
5. focusTopics: Adayın çalışması gereken SOMUT VE KISA konu başlıkları olsun (örneğin "JWT Yapısı", "CSS Flexbox", "ACID Prensipleri"). Bu bir dizi string olmalı.
6. recommendations kategorileri şu mantıkla üretilsin:
   - "Bir Sonraki Mülakatta" (hemen uygulanabilecek taktikler: örn "Bilmiyorsan net ifade et")
   - "Performans Geliştirme" (orta vadeli cevap/mülakat tekniği gelişimi: örn "Tanım + Neden + Örnek yapısını kullan")
   - "Çalışma Planı" (doğrudan çalışılması gereken teorik/teknik/iletişim alanları: örn "JWT ve Grid mimarisini tekrar et")

Veri:
{json.dumps(payload, ensure_ascii=False, indent=2)}

SADECE JSON FORMATI:
{{
  "overallAnalysis": "[Eğer mülakat yarım, çok kısa ya da cevap içermiyorsa durumu dürüstçe anlatan ve halüsinasyon YARATMAYAN bir analiz yaz. Normal ve uzun bir mülakat ise, mülakat genelindeki akışı, bilgi düzeyini ve beceri potansiyelini özetleyen detaylı bir metin hazırla.]",
  "strengths": [
    "[Güçlü Yön 1 - Varsa]",
    "[Güçlü Yön 2 - Varsa]"
  ],
  "improvementAreas": [
    "[Gelişim Alanı 1 - Varsa]",
    "[Gelişim Alanı 2 - Varsa]"
  ],
  "focusTopics": [
    "[Odak Konusu 1 - SADECE mülakatta BAŞARISIZ olduğu ya da GEÇEN ve GÖSTERİLMESİ GEREKEN teknik tanımlar, uydurma veri kullanma! Varsa yaz, yoksa boş array bırak]"
  ],
  "recommendations": {{
    "Bir Sonraki Mülakatta": [
      "[İletişim/Tutuma dair tavsiye - Varsa]"
    ],
    "Performans Geliştirme": [
      "[Mülakat tekniğine dair taktiksel tavsiye - Varsa]"
    ],
    "Çalışma Planı": [
      "[Teknik çalışma alanları tavsiyesi - Varsa]"
    ]
  }}
}}
"""
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    req_payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "You output JSON only."},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3
    }

    try:
        response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=req_payload, timeout=25)
        response.raise_for_status()
        result = response.json()
        response_text = result["choices"][0]["message"]["content"]
        return json.loads(response_text)
    except Exception as e:
        print(f"GPT Recommendation error: {e}")
        return {
            "overallAnalysis": f"Analiz oluşturulurken hata oluştu: {str(e)}",
            "strengths": [],
            "improvementAreas": [],
            "focusTopics": [],
            "recommendations": {
                "Bir Sonraki Mülakatta": ["Mülakat analizine göre sorulara daha odaklı, somut örneklerle yanıt vermelisiniz."],
                "Performans Geliştirme": ["Deneyimlerinizi detaylandırırken durumu açıklama pratiği yapmalısınız."],
                "Çalışma Planı": ["Eksik kaldığınızı hissettiğiniz kavramsal teorilere ağırlık verebilirsiniz."]
            }
        }

def parse_transcript_python(transcript_text: str) -> list:
    """
    GPT'ye güvenmeden [Interviewer]/[Candidate] satırlarını Python ile parse eder.
    Her cevap – ister tek kelime, ister kısa, ister uzun olsun – ayrı bir blok olarak üretilir.
    """
    merged = _merge_consecutive_candidate_lines(transcript_text)
    lines = [l.strip() for l in merged.splitlines() if l.strip()]

    blocks = []
    pending_question = None

    for line in lines:
        if line.startswith("[Interviewer]"):
            text = line[len("[Interviewer]"):].strip()
            if pending_question and text:
                # Önceki cevapsız soruyu boş yanıtla kapat
                blocks.append({"type": "question", "question": pending_question, "answer": ""})
            # Geçiş ifadelerini at, sadece soru cümlelerini al
            pending_question = _extract_question(text)

        elif line.startswith("[Candidate]"):
            text = line[len("[Candidate]"):].strip()
            if pending_question is not None:
                blocks.append({"type": "question", "question": pending_question, "answer": text})
                pending_question = None
            # Soru gelmeden cevap geldiyse (ilk selamlama vb.) atla

    # Dosya soru ortasında bittiyse son soruyu boş yanıtla kapat
    if pending_question:
        blocks.append({"type": "question", "question": pending_question, "answer": ""})

    return blocks




def analyze_transcript_with_gpt(qa_pairs, transcript_text, interview_type: str = "Technical"):
    sanitized_evaluations = []

    cq_list, cc_list, es_list, tu_list = [], [], [], []
    rr_scores, rr_weights = [], []

    # 1. Blokları Python parser ile deterministik oluştur (hiçbir cevabı düşürmez).
    #    Ardından GPT parser'ı çalıştır: yalnızca GPT'nin "setup_or_meta" etiketlediği
    #    bloklara o etiketi uygula. GPT'nin listesinde OLMAYAN bloklar (yani GPT düşürdüyse)
    #    Python listesinden "question" tipiyle korunur.
    if transcript_text:
        py_blocks = parse_transcript_python(transcript_text)
        try:
            gpt_blocks = parse_transcript_to_structured_blocks_gpt(transcript_text)
            # GPT'nin "setup_or_meta" etiketlediği soruları bir listeye al
            gpt_meta_questions = [
                b.get("question", "").strip().lower()
                for b in gpt_blocks
                if b.get("type") == "setup_or_meta"
            ]
            # Python bloklarında tipi GPT'den al:
            # Substring eşleşme kullan (tam eşleşme yerine) çünkü GPT soruyu kısaltabilir
            for b in py_blocks:
                q_lower = b.get("question", "").strip().lower()
                for gpt_q in gpt_meta_questions:
                    if gpt_q and (gpt_q in q_lower or q_lower in gpt_q):
                        b["type"] = "setup_or_meta"
                        break
            blocks = py_blocks
        except Exception:
            blocks = py_blocks
    else:
        blocks = qa_pairs  # transcript_text yoksa TranscriptEvaluator'dan gelen çiftler

    real_index = 1
    for item in blocks:
        q = item.get("question", "")
        a = item.get("answer", "")
        block_type = item.get("type", "question") # parse'dan gelebilir
        
        # Cevap verilmemiş soruları tamamen yoksay (değerlendirmeye alma)
        if not a or not a.strip():
            continue
            
        # Meta logiği
        is_meta_block = (block_type == "setup_or_meta")
        
        eval_data = analyze_single_qa_gpt(q, a, interview_type, is_meta=is_meta_block)
        
        q_type = eval_data.get("questionType", "meta")
        metrics = eval_data.get("metrics", {})
        applicable = eval_data.get("applicableMetrics", [])
        visible = eval_data.get("visibleInReport", True)
        excluded = eval_data.get("excludedFromOverall", False)
        
        if q_type == "meta" or q_type == "setup_or_meta" or not visible:
            excluded = True
            visible = False
            
        score = compute_question_score(metrics, q_type) if not excluded else 0
        
        def safe_int(val):
            try: return int(val) if val is not None else None
            except: return None
            
        rel = safe_int(metrics.get("relevance"))
        clar = safe_int(metrics.get("clarity"))
        dep = safe_int(metrics.get("depth"))
        tech = safe_int(metrics.get("technicalAccuracy"))
        ev = safe_int(metrics.get("evidenceExample"))
        
        # Orijinal bozuk JSON response'lardaki array/string'leri de güncelleyelim ki UI düzgün çalışsın
        metrics["relevance"] = rel
        metrics["clarity"] = clar
        metrics["depth"] = dep
        metrics["technicalAccuracy"] = tech
        metrics["evidenceExample"] = ev
        
        if not excluded:
            n_rel = rel if rel is not None else 0
            n_clar = clar if clar is not None else 0
            n_dep = dep if dep is not None else 0
            n_tech = tech if tech is not None else 0
            n_ev = ev if ev is not None else 0
            
            if "technicalAccuracy" in applicable and tech is not None:
                cq_list.append(n_rel*0.30 + n_dep*0.35 + n_tech*0.35)
                tu_list.append(n_tech*0.60 + n_dep*0.40)
            else:
                cq_list.append(n_rel*0.45 + n_dep*0.55)
                
            cc_list.append(n_clar*0.70 + n_rel*0.30)
            
            if "evidenceExample" in applicable and ev is not None:
                es_list.append(n_ev*0.65 + n_dep*0.35)
                
            weight = 1.0
            if q_type in ["behavioral", "experience", "technical_knowledge", "self_presentation", "motivation"]:
                weight = 1.2
            elif q_type in ["technical_experience", "problem_solving"]:
                weight = 1.4
            
            if weight > 0:
                rr_scores.append(score * weight)
                rr_weights.append(weight)

        is_weak = False
        if not excluded and visible: # Meta & Closing are never weak
            if score < 55 or (dep is not None and dep < 50):
                is_weak = True
            if "evidenceExample" in applicable and ev is not None and ev < 45:
                is_weak = True
            if "technicalAccuracy" in applicable and tech is not None and tech < 50:
                is_weak = True
            if len(a.split()) < 5:
                is_weak = True
            if any(w in a.lower() for w in ["bilmiyorum", "emin değilim", "hatırlamıyorum", "sanırım"]):
                is_weak = True
            
        sanitized_evaluations.append({
            "index": real_index if visible else 0, # Görünmezler index almaz vizüel sadelik için, UI index kullanıyor
            "questionType": q_type,
            "excludedFromOverall": excluded,
            "visibleInReport": visible,
            "question": q,
            "answer": a,
            "metrics": metrics, # null olanlar 0'a çevrilmeden orijinal kalıyor!
            "applicableMetrics": applicable,
            "score": score,
            "summary": eval_data.get("summary", ""),
            "isWeak": is_weak
        })
        if visible:
            real_index += 1
            
    def safe_avg(lst):
        return int(sum(lst)/len(lst)) if lst else None
        
    cq = safe_avg(cq_list)
    cc = safe_avg(cc_list)
    es = safe_avg(es_list)
    tu = safe_avg(tu_list)
    rr = int(sum(rr_scores)/sum(rr_weights)) if sum(rr_weights) > 0 else None

    # Overall Score Calculation
    overall_score = 0
    if interview_type == "HR":
        weights = {"cq": 0.30, "cc": 0.25, "es": 0.20, "rr": 0.25}
        if es is None:
            weights = {"cq": 0.35, "cc": 0.35, "es": 0.0, "rr": 0.30}
        
        val_cq = cq or 0
        val_cc = cc or 0
        val_rr = rr or 0
        val_es = es or 0
        overall_score = val_cq*weights["cq"] + val_cc*weights["cc"] + val_es*weights["es"] + val_rr*weights["rr"]
    else:
        weights = {"cq": 0.25, "cc": 0.20, "es": 0.15, "tu": 0.25, "rr": 0.15}
        if es is None and tu is None:
            weights = {"cq": 0.45, "cc": 0.30, "es": 0.0, "tu": 0.0, "rr": 0.25}
        elif es is None:
            weights = {"cq": 0.30, "cc": 0.20, "es": 0.0, "tu": 0.30, "rr": 0.20}
        elif tu is None:
            weights = {"cq": 0.35, "cc": 0.25, "es": 0.20, "tu": 0.0, "rr": 0.20}
            
        val_cq = cq or 0
        val_cc = cc or 0
        val_es = es or 0
        val_tu = tu or 0
        val_rr = rr or 0
        overall_score = val_cq*weights["cq"] + val_cc*weights["cc"] + val_es*weights["es"] + val_tu*weights["tu"] + val_rr*weights["rr"]

    overall_score = int(overall_score)

    dim_scores = {
      "contentQuality": cq,
      "communicationClarity": cc,
      "evidenceSupport": es,
      "technicalUnderstanding": tu,
      "roleReadiness": rr
    }

    analysis_payload = {
        "interviewType": interview_type,
        "overallScore": overall_score,
        "dimensionScores": dim_scores,
        "qaEvaluations": [qa for qa in sanitized_evaluations if not qa["excludedFromOverall"]]
    }
    
    global_analysis = generate_overall_analysis_gpt(analysis_payload)

    # UI Legacy mapping
    legacy_recs = []
    for k, v in global_analysis.get("recommendations", {}).items():
       text_val = "- " + "\n- ".join(v) if v else ""
       legacy_recs.append({"title": k, "text": text_val})

    return {
      "qaEvaluations": sanitized_evaluations,
      "overall": {
        "overallScore": overall_score,
        "dimensionScores": dim_scores,
        "overallAnalysis": global_analysis.get("overallAnalysis", ""),
        "strengths": global_analysis.get("strengths", []),
        "improvementAreas": global_analysis.get("improvementAreas", []),
        "focusTopics": global_analysis.get("focusTopics", [])
      },
      "newRecommendations": global_analysis.get("recommendations", {}),
      
      # Legacy Mapping
      "overallScore": overall_score,
      "content": [
          {"key": "contentQuality", "label": "İçerik Kalitesi", "score": cq, "detail": "Sorulara teknik/içeriksel uyum ve derinlik."},
          {"key": "technicalUnderstanding", "label": "Teknik Anlayış", "score": tu, "detail": "Teknik doğruluk ve konuya olan teknik hakimiyet."},
          {"key": "evidenceSupport", "label": "Örnekleme", "score": es, "detail": "Cevapları gerçek hayat örnekleriyle destekleme."}
      ],
      "communication": [
          {"key": "communicationClarity", "label": "İletişim Netliği", "score": cc, "detail": "Düşünceleri ifade etme açıklığı ve iletişimin akıcılığı."},
          {"key": "roleReadiness", "label": "Role Hazırlık", "score": rr, "detail": "Genel soru tiplerine karşı verilen cevapların olgunluğu."}
      ],
      "recommendations": legacy_recs
    }
