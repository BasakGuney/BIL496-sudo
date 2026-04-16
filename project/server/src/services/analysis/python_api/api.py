from fastapi import FastAPI, File, UploadFile, HTTPException
import uvicorn
import shutil
import os
import time
import json
from typing import List, Optional
from pydantic import BaseModel

from audio_analyzer import AudioAnalyzer, compute_overall, interpret_report_with_gpt
from vision_analyzer import interpret_vision_report_with_gpt
from transcript_analyzer import analyze_transcript_with_gpt

REPORTS_DIR = os.getenv("REPORTS_DIR") or os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../reports"))

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

class AudioAnalysisRequest(BaseModel):
    file_paths: List[str]
    session_id: str = None
    merge_with_existing: bool = False
    write_text_report: bool = False
    finalize_report: bool = False

@app.post("/analyze-audio")
async def analyze_audio_session(request: AudioAnalysisRequest):
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
        existing_json_path = os.path.join(target_dir, "audio_segments.json")
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

        overall_data = compute_overall(merged_results)
        
        # 1) Save audio_segments.json with the new clean schema
        model_out_data = {
            "items": merged_results,
            "overall": overall_data
        }
        with open(os.path.join(target_dir, "audio_segments.json"), "w", encoding="utf-8") as f:
            json.dump(model_out_data, f, ensure_ascii=False, indent=2)

        # 2) Save audio_report.json
        llm_report = None
        if request.write_text_report:
            try:
                llm_report = interpret_report_with_gpt(overall_data)
            except Exception as e:
                llm_report = {
                    "overallAnalysis": f"Ses LLM analiz hatası: {str(e)}",
                    "clarityBadge": "Analiz Edilemedi",
                    "dominantEmotion": "Bilinmiyor",
                    "secondaryEmotion": None,
                    "scores": [],
                    "tonDistribution": [],
                    "speechSummary": [],
                    "recommendations": {"nextInterview": "", "performanceDevelopment": ""}
                }

            existing_report_path = os.path.join(target_dir, "audio_report.json")
            existing_completed = False
            if os.path.exists(existing_report_path):
                try:
                    with open(existing_report_path, "r", encoding="utf-8") as f:
                        existing_report = json.load(f)
                    existing_completed = bool(existing_report.get("completed"))
                except Exception:
                    existing_completed = False

            # Once the final report is written, never downgrade it back to an
            # intermediate "pending" state on later incremental writes.
            llm_report["completed"] = bool(request.finalize_report or existing_completed)

            with open(existing_report_path, "w", encoding="utf-8") as f:
                json.dump(llm_report, f, ensure_ascii=False, indent=2)
        
        return {
            "items": merged_results,
            "overall": overall_data,
            "llm_report": llm_report
        }
    except Exception as e:
        import traceback
        err = traceback.format_exc()
        print(err)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {err}")


class VisionAnalysisRequest(BaseModel):
    visionAnalysis: dict
    session_id: str = None

@app.post("/analyze-vision")
async def analyze_vision(request: VisionAnalysisRequest):
    try:
        target_dir = get_session_dir(request.session_id)
        result = interpret_vision_report_with_gpt(request.visionAnalysis)
        payload = {
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "source": "gpt-4o-mini",
            "visionAnalysisPath": "vision_frames.json",
            "report": result,
        }

        with open(os.path.join(target_dir, "vision_report.json"), "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        return payload
    except Exception as e:
        import traceback
        err = traceback.format_exc()
        print(err)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {err}")

class TranscriptAnalysisRequest(BaseModel):
    qaPairs: List[dict]
    transcriptText: str
    session_id: str = None
    interviewType: str = "Technical"

@app.post("/analyze-transcript")
async def analyze_transcript(request: TranscriptAnalysisRequest):
    try:
        # Call GPT logic
        result = analyze_transcript_with_gpt(request.qaPairs, request.transcriptText, request.interviewType)
        
        # Save transcript_report.json
        target_dir = get_session_dir(request.session_id)
        with open(os.path.join(target_dir, "transcript_report.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
            
        return result
    except Exception as e:
        import traceback
        err = traceback.format_exc()
        print(err)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {err}")

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000)
