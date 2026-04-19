from fastapi import FastAPI, File, UploadFile, HTTPException
import uvicorn
import shutil
import os
import time
import json
from typing import List, Optional
from pydantic import BaseModel

from audio_analyzer import (
    AudioAnalyzer,
    compute_overall,
    interpret_report_with_gpt,
    _build_audio_provisional_report,
    _build_audio_fallback_report,
    _compute_audio_overall_score,
    _compute_emotion_suitability_score,
    _compute_fluency_score,
    _compute_speech_rate_score,
)
from vision_analyzer import interpret_vision_report_with_gpt
from transcript_analyzer import analyze_transcript_with_gpt
from answer_state_resolver import infer_answer_state

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
            existing_report_path = os.path.join(target_dir, "audio_report.json")
            existing_completed = False
            if os.path.exists(existing_report_path):
                try:
                    with open(existing_report_path, "r", encoding="utf-8") as f:
                        existing_report = json.load(f)
                    existing_completed = bool(existing_report.get("completed"))
                except Exception:
                    existing_completed = False

            raw_emotions = overall_data.get("emotions", {})
            emotion_map = {
                "neu": "Nötr ve dengeli ton",
                "hap": "Olumlu / canlı ifade",
                "ang": "Gergin / sert ton",
                "sad": "Düşük enerjili / içe kapanık ton",
            }
            emotion_dist = [
                {"label": emotion_map.get(key, key), "score": value}
                for key, value in sorted(raw_emotions.items(), key=lambda item: item[1], reverse=True)
            ]
            dominant_emotion = emotion_dist[0] if emotion_dist else {"label": "Bilinmiyor", "score": 0}
            secondary_emotion = emotion_dist[1] if len(emotion_dist) > 1 else None

            clarity_val = overall_data.get("clarity", 0)
            speech_data = overall_data.get("speech", {})
            avg_wpm = speech_data.get("avg_wpm", 0)
            avg_pause_ratio = speech_data.get("avg_pause_ratio", 0)
            total_speech_sec = speech_data.get("total_speech_time", 0)
            total_dur_sec = speech_data.get("total_duration", 0)

            def _fmt_duration(sec: float) -> str:
                sec = int(round(sec))
                m, s = divmod(sec, 60)
                return f"{m} dk {s} sn" if m else f"{s} sn"

            clarity_band = "Yüksek" if clarity_val >= 75 else "Orta" if clarity_val >= 50 else "Düşük"
            wpm_band = "İdeal aralıkta" if 110 <= avg_wpm <= 150 else "Hızlı" if avg_wpm > 150 else "Yavaş" if avg_wpm > 0 else "Ölçülemedi"
            pause_band = "Az (akıcı)" if avg_pause_ratio <= 15 else "Orta" if avg_pause_ratio <= 25 else "Fazla (sık durak)" if avg_pause_ratio <= 40 else "Çok Fazla"

            emotion_suitability = _compute_emotion_suitability_score(raw_emotions)
            positive_share = round(float(raw_emotions.get("neu", 0) or 0) + float(raw_emotions.get("hap", 0) or 0), 1)
            negative_share = round(float(raw_emotions.get("ang", 0) or 0) + float(raw_emotions.get("sad", 0) or 0), 1)

            python_scores = [
                {"label": "Ses Netliği", "score": int(round(clarity_val))},
                {"label": "Duygu Uygunluğu", "score": emotion_suitability},
                {"label": "Konuşma Hızı", "score": _compute_speech_rate_score(avg_wpm)},
                {"label": "Akıcılık", "score": _compute_fluency_score(avg_pause_ratio)},
            ]
            overall_score = _compute_audio_overall_score(python_scores)
            gpt_context = {
                "clarity": {"value": round(clarity_val, 1), "band": clarity_band},
                "avgWPM": {"value": avg_wpm, "band": wpm_band},
                "pauseRatio": {"value": f"%{round(avg_pause_ratio, 1)}", "band": pause_band},
                "totalSpeechTime": _fmt_duration(total_speech_sec),
                "totalDuration": _fmt_duration(total_dur_sec),
                "dominantEmotion": dominant_emotion,
                "secondaryEmotion": secondary_emotion,
                "emotionDistribution": emotion_dist,
                "emotionSuitability": {
                    "score": emotion_suitability,
                    "positiveShare": positive_share,
                    "negativeShare": negative_share,
                },
            }

            provisional_report = _build_audio_provisional_report(
                gpt_context,
                overall_score,
                dominant_emotion,
                secondary_emotion,
                python_scores,
                emotion_dist,
            )
            provisional_report["completed"] = bool(existing_completed)

            # Incremental writes should update the visible audio panel immediately
            # without waiting for an OpenAI round-trip.
            with open(existing_report_path, "w", encoding="utf-8") as f:
                json.dump(provisional_report, f, ensure_ascii=False, indent=2)

            if request.finalize_report:
                try:
                    llm_report = interpret_report_with_gpt(overall_data)
                except Exception as e:
                    llm_report = _build_audio_fallback_report(
                        gpt_context,
                        overall_score,
                        dominant_emotion,
                        secondary_emotion,
                        python_scores,
                        emotion_dist,
                        str(e),
                    )

                llm_report["completed"] = True
                with open(existing_report_path, "w", encoding="utf-8") as f:
                    json.dump(llm_report, f, ensure_ascii=False, indent=2)
            else:
                llm_report = provisional_report
        
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

class AnswerStateRequest(BaseModel):
    question: str
    answer: str
    session_id: str = None
    interviewType: str = "Technical"
    mode: str = "Neutral"

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

@app.post("/resolve-answer-state")
async def resolve_answer_state(request: AnswerStateRequest):
    try:
        return infer_answer_state(
            request.question,
            request.answer,
            request.interviewType,
            request.mode,
        )
    except Exception as e:
        import traceback
        err = traceback.format_exc()
        print(err)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {err}")

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000)
