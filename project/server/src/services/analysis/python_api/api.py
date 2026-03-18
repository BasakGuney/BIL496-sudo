from fastapi import FastAPI, File, UploadFile, HTTPException
import uvicorn
import shutil
import os
import time
import json
from typing import List
from pydantic import BaseModel

from analyzer import AudioAnalyzer, calculate_weighted_average_emotions, calculate_weighted_average_clarity, interpret_report_with_llama
from transcript_analyzer import analyze_transcript_with_llama

REPORTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../reports"))

def normalize_session_folder_name(session_id: str):
    safe_session_id = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in str(session_id or "unknown-session"))
    return safe_session_id if safe_session_id.startswith("S-") else f"S-{safe_session_id}"

def get_session_dir(session_id: str):
    if not session_id:
        return "."
    path_to_dir = os.path.join(REPORTS_DIR, normalize_session_folder_name(session_id))
    os.makedirs(path_to_dir, exist_ok=True)
    return path_to_dir

def merge_results_by_filename(existing_items, new_items):
    merged = {}

    for item in existing_items or []:
        filename = item.get("filename")
        if filename:
            merged[filename] = item

    for item in new_items or []:
        filename = item.get("filename")
        if filename:
            merged[filename] = item

    return list(merged.values())

app = FastAPI(title="Speech Emotion API for Interviews")

# Initialize the analyzer model on startup
analyzer = None

@app.on_event("startup")
async def startup_event():
    global analyzer
    print("Initializing heavy models during app startup...")
    # Turkish model for clarity scoring since candidates will speak Turkish
    analyzer = AudioAnalyzer(clarity_model_name="mpoyraz/wav2vec2-xls-r-300m-cv7-turkish")

@app.get("/")
def read_root():
    return {"status": "Active", "message": "Speech Emotion API is running."}

@app.post("/analyze")
async def analyze_audio(file: UploadFile = File(...)):
    """
    Receives a .wav audio file and returns the VAD scores, pacing, 
    and general personality traits (confidence, nervousness).
    """
    if file.content_type not in ["audio/wav", "audio/x-wav"] and not file.filename.endswith(".wav"):
        raise HTTPException(status_code=400, detail="Only .wav files are supported currently.")

    # Save the file temporarily
    temp_file_path = f"temp_{int(time.time())}_{file.filename}"
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Process standard traits and metrics
        results = analyzer.process_audio(temp_file_path)
        
        if results is None:
            raise HTTPException(status_code=400, detail="Audio file too short or unreadable.")

        # Optional: Clean up temp file
        os.remove(temp_file_path)

        return results
    except Exception as e:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=str(e))

class SessionAnalysisRequest(BaseModel):
    file_paths: List[str]
    session_id: str = None
    merge_with_existing: bool = False
    write_text_report: bool = False

@app.post("/analyze-session")
async def analyze_session(request: SessionAnalysisRequest):
    import traceback
    try:
        results = []
        for f in request.file_paths:
            if not os.path.exists(f):
                print(f"API Warning: File not found: {f}")
                continue
                
            res = analyzer.process_audio(f)
            if res:
                res['filename'] = os.path.basename(f)
                results.append(res)
                
        target_dir = get_session_dir(request.session_id)
        existing_json_path = os.path.join(target_dir, "audio_model_out.json")
        existing_items = []

        if request.merge_with_existing and os.path.exists(existing_json_path):
            with open(existing_json_path, "r", encoding="utf-8") as f:
                existing_payload = json.load(f)
            existing_items = existing_payload.get("items", [])

        merged_results = results

        if request.merge_with_existing:
            merged_results = merge_results_by_filename(existing_items, results)

        if not merged_results:
            raise HTTPException(status_code=400, detail="No readable audio files found.")

        overall_emotions = calculate_weighted_average_emotions(merged_results)
        overall_clarity = calculate_weighted_average_clarity(merged_results)
        
        # Generate the report text internally
        report_content = "## 1. Genel Değerlendirme (Süre Ağırlıklı Ortalamalar)\n\n"
        report_content += f"### 🔊 Ses Netliği (Clarity): `%{overall_clarity} / 100`\n"

        label_translations = {
            'neu': 'Özgüven',
            'hap': 'Coşku',
            'ang': 'Sert Ton',
            'sad': 'Gerginlik'
        }

        report_content += "### 🎭 Duygu Profili\n"
        sorted_overall = sorted(overall_emotions.items(), key=lambda x: x[1], reverse=True)
        for label, score in sorted_overall:
            translated_label = label_translations.get(label, label)
            if isinstance(translated_label, str):
                translated_label = translated_label.capitalize()
            report_content += f"- **{translated_label}:** `%{score}`\n"
        
        report_content += "\n---\n\n## 2. Soru Bazlı Detaylı Analiz Çıktıları\n\n"
        for r in merged_results:
            dominant_emotion_key = max(r['emotions'].items(), key=lambda x: x[1])[0]
            dominant_emotion = label_translations.get(dominant_emotion_key, dominant_emotion_key)
            if isinstance(dominant_emotion, str):
                dominant_emotion = dominant_emotion.capitalize()
                
            report_content += f"### {r['filename']}\n"
            report_content += f"- **Süre:** {r['duration']} saniye\n"
            report_content += f"- **Konuşma Hızı:** {r['speech']['wpm']} WPM\n"
            report_content += f"- **Ses Netliği:** %{r['clarity']}\n"
            report_content += f"- **Baskın Duygu:** `{dominant_emotion}`\n"
            report_content += "\n"

        # 1) Save audio_model_out.json
        model_out_data = {
            "overall_emotions": overall_emotions,
            "overall_clarity": overall_clarity,
            "items": merged_results
        }
        with open(os.path.join(target_dir, "audio_model_out.json"), "w", encoding="utf-8") as f:
            json.dump(model_out_data, f, ensure_ascii=False, indent=2)

        llm_analysis = None
        if request.write_text_report:
            try:
                llm_analysis = interpret_report_with_llama(report_content, overall_emotions)
            except Exception as e:
                llm_analysis = f"> ⚠️ **Yapay Zeka Hatası:** Llama değerlendirmesi başarılamadı. {str(e)}"

            # 2) Save audio_analysis_out.txt only for the final synthesized report stage
            with open(os.path.join(target_dir, "audio_analysis_out.txt"), "w", encoding="utf-8") as f:
                f.write(llm_analysis)
        
        return {
            "overall_emotions": overall_emotions,
            "overall_clarity": overall_clarity,
            "items": merged_results,
            "coach_report": llm_analysis
        }
    except Exception as e:
        import traceback
        err = traceback.format_exc()
        print(err)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {err}")

class TranscriptAnalysisRequest(BaseModel):
    qaPairs: List[dict]
    transcriptText: str
    session_id: str = None

@app.post("/analyze-transcript")
async def analyze_transcript(request: TranscriptAnalysisRequest):
    try:
        # Call Ollama logic
        result = analyze_transcript_with_llama(request.qaPairs, request.transcriptText)
        
        # Save transcript_analysis_out.json
        target_dir = get_session_dir(request.session_id)
        with open(os.path.join(target_dir, "transcript_analysis_out.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
            
        return result
    except Exception as e:
        import traceback
        err = traceback.format_exc()
        print(err)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {err}")

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000)
