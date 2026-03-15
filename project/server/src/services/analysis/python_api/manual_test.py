import requests
import json
import time
import os

API_BASE = "http://localhost:8001"

def test_session_analysis():
    print("🚀 Test 1: Audio Analysis (/analyze-session)")
    # Using existing audio files in the test_audio_analysis/dataset directory
    base_dir = r"C:\Users\basak\OneDrive\Desktop\BIL496-sudo\project\test_audio_analysis\dataset"
    
    # We'll just grab two files for a quick manual test
    files = [
        os.path.join(base_dir, "answer1-Ses01F_impro04_F019.wav"),
        os.path.join(base_dir, "answer2-Ses03F_script02_1_M004.wav")
    ]
    
    # Verify files exist
    valid_files = [f for f in files if os.path.exists(f)]
    if not valid_files:
        print("❌ Hata: Test edilecek ses dosyası bulunamadı. Lütfen test dosyalarının yolunu doğrulayın.")
        return

    print(f"Gönderilecek ses dosyaları: {valid_files}")
    
    try:
        start = time.time()
        res = requests.post(f"{API_BASE}/analyze-session", json={
            "file_paths": valid_files,
            "session_id": "S-TEST-MANUAL"
        })
        res.raise_for_status()
        data = res.json()
        
        print("\n✅ Ses Analizi Başarılı!")
        print(f"Süre: {round(time.time() - start, 2)} saniye")
        print("Duygu (Overall):", data.get("overall_emotions"))
        print("Netlik (Clarity):", data.get("overall_clarity"))
        print("Llama Koç Raporu Önizlemesi:\n", data.get("coach_report")[:200], "...\n")
        print("-> `audio_model_out.json` ve `audio_analysis_out.txt` dosyaları `reports/S-TEST-MANUAL` klasöründe oluşmuş olmalı.\n")
    except Exception as e:
        print(f"❌ Ses Analizi Başarısız: {e}")

def test_transcript_analysis():
    print("🚀 Test 2: Transcript Analysis (/analyze-transcript)")
    
def test_transcript_analysis():
    print("🚀 Test 2: Transcript Analysis (/analyze-transcript)")
    
    # Read custom mock transcript from the file
    file_path = "test_transcript.txt"
    if not os.path.exists(file_path):
        print("❌ Hata: test_transcript.txt bulunamadı!")
        return

    with open(file_path, "r", encoding="utf-8") as f:
        transcript_text = f.read().strip()

    # Parse QA Pairs from the raw text blocks
    lines = [line.strip() for line in transcript_text.split('\n') if line.strip()]
    qa_pairs = []
    
    current_q = None
    q_index = 1
    
    for i in range(len(lines)):
        if lines[i].startswith("[Interviewer]"):
            current_q = lines[i].replace("[Interviewer]", "").strip()
        elif lines[i].startswith("[Candidate]") and current_q:
            ans = lines[i].replace("[Candidate]", "").strip()
            qa_pairs.append({
                "index": q_index,
                "question": current_q,
                "answer": ans,
                "questionTs": q_index * 10000,
                "answerTs": q_index * 10000 + 5000
            })
            q_index += 1
            current_q = None

    try:
        start = time.time()
        res = requests.post(
            f"{API_BASE}/analyze-transcript", 
            json={
                "qaPairs": qa_pairs,
                "transcriptText": transcript_text,
                "session_id": "S-TEST-MANUAL"
            }
        )
        res.raise_for_status()
        data = res.json()
        
        print("\n✅ Transcript Analizi Başarılı!")
        print(f"Süre: {round(time.time() - start, 2)} saniye")
        print("Overall Score:", data.get("overallScore"))
        print(f"Değerlendirilen Cevap Sayısı: {len(data.get('qaEvaluations', []))}")
        if data.get("recommendations"):
            print("Örnek Tavsiye:", data["recommendations"][0].get("title"))
        print("\n-> `transcript_analysis_out.json` dosyası `reports/S-TEST-MANUAL` klasöründe oluşmuş olmalı.\n")
    except Exception as e:
        print(f"❌ Transcript Analizi Başarısız: {e}")

if __name__ == "__main__":
    print("Testing against API at http://localhost:8001...")
    
    # Run both tests
    test_session_analysis()
    test_transcript_analysis()
