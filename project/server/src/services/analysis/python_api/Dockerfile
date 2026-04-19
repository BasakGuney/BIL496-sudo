FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ARG INSTALL_AUDIO_DEPS=false

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg libsndfile1 \
  && rm -rf /var/lib/apt/lists/*

COPY requirements-core.txt requirements-audio.txt ./
RUN pip install --no-cache-dir -r requirements-core.txt \
  && if [ "$INSTALL_AUDIO_DEPS" = "true" ]; then pip install --no-cache-dir -r requirements-audio.txt; fi

COPY . .

ENV REPORTS_DIR=/reports

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
