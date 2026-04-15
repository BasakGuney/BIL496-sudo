# Qdrant Question Type Prototype

This folder is an isolated playground for testing GPT-free question type detection.

It does not affect the production transcript pipeline.

## Goal

Test whether Turkish interview questions can be classified into these labels without GPT:

- `self_presentation`
- `motivation`
- `behavioral`
- `experience`
- `technical_knowledge`
- `technical_experience`
- `problem_solving`

## Suggested Approach

1. Apply simple rules for obvious cases and `setup_or_meta`.
2. For non-obvious questions, search similar labeled examples in Qdrant.
3. Decide the label with weighted nearest-neighbor voting.

## Files

- `requirements.txt`: prototype-only dependencies
- `seed_examples.json`: starter labeled examples
- `prototype.py`: local-mode Qdrant test script

## Setup

Create a virtual environment inside this folder or nearby:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python prototype.py
```

This uses Qdrant local mode by default, so no separate Qdrant server is required.

## Notes

- This prototype uses local mode first to keep setup small.
- If results look promising, we can move to a real Qdrant server later.
- The example dataset is intentionally small and only meant for first validation.
