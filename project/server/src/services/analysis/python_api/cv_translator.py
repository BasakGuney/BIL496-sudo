import json
import os
import sys
from pathlib import Path


def print_json(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))


def split_chunks(text, max_chars=1800):
    clean = " ".join(str(text or "").split())
    if not clean:
        return []

    chunks = []
    current = ""
    for sentence in clean.replace("!", ".").replace("?", ".").split("."):
        sentence = sentence.strip()
        if not sentence:
          continue
        piece = f"{sentence}."
        if len(current) + len(piece) + 1 <= max_chars:
            current = f"{current} {piece}".strip()
        else:
            if current:
                chunks.append(current)
            current = piece
    if current:
        chunks.append(current)
    return chunks


def translate_text(text):
    try:
        from transformers import pipeline
    except Exception as exc:
        return {
            "ok": False,
            "translatedText": "",
            "error": f"transformers import failed: {exc}",
        }

    cache_dir = Path(__file__).resolve().parent / ".model-cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    model_name = os.getenv("CV_TRANSLATION_MODEL", "Helsinki-NLP/opus-mt-en-tr")

    try:
        translator = pipeline(
            "translation",
            model=model_name,
            tokenizer=model_name,
            device=-1,
            model_kwargs={"cache_dir": str(cache_dir)},
        )
    except Exception as exc:
        return {
            "ok": False,
            "translatedText": "",
            "error": f"translator init failed: {exc}",
        }

    translated_chunks = []
    try:
        for chunk in split_chunks(text):
            result = translator(chunk, max_length=1024)
            translated = result[0]["translation_text"] if result else ""
            if translated:
                translated_chunks.append(translated.strip())
        return {
            "ok": True,
            "translatedText": "\n".join(filter(None, translated_chunks)).strip(),
            "model": model_name,
        }
    except Exception as exc:
        return {
            "ok": False,
            "translatedText": "",
            "error": f"translation failed: {exc}",
        }


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except Exception:
        print_json({"ok": False, "translatedText": "", "error": "invalid input json"})
        return

    text = str(payload.get("text") or "")
    if not text.strip():
        print_json({"ok": True, "translatedText": "", "model": None})
        return

    print_json(translate_text(text))


if __name__ == "__main__":
    main()
