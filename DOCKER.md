# Docker Kurulumu

Bu proje `docker compose` ile 3 servis olarak calisir:

- `client`: Vite ile build alinmis arayuz, Nginx uzerinden `http://localhost:3000`
- `server`: Node/Express backend, `http://localhost:3001`
- `python-api`: FastAPI tabanli analiz servisi, `http://localhost:8000`

## Gereken ortam degiskenleri

En azindan `OPENAI_API_KEY` tanimli olmalidir. Bunu terminalde export ederek ya da compose calistirirken satir ici vererek gecirebilirsiniz:

```bash
export OPENAI_API_KEY=your_key_here
docker compose up --build
```

Isterseniz su sekilde de calistirabilirsiniz:

```bash
OPENAI_API_KEY=your_key_here docker compose up --build
```

Client image'i build asamasinda backend adresini gomuyor. Varsayilan deger:

```text
VITE_BACKEND_URL=http://localhost:3001
```

Farkli bir adres kullanacaksaniz:

```bash
VITE_BACKEND_URL=http://localhost:3001 OPENAI_API_KEY=your_key_here docker compose up --build
```

## Calistirma

```bash
docker compose up --build
```

Ardindan:

- Client: `http://localhost:3000`
- Server: `http://localhost:3001`
- Python API: `http://localhost:8000`

## Kalici veri

Raporlar host makinedeki su klasorde tutulur ve iki backend servisine de volume olarak baglanir:

```text
project/server/reports
```

## Notlar

- Python image'i `torch`, `torchaudio`, `transformers`, `mediapipe` gibi agir paketler kurdugu icin ilk build uzun surebilir.
- `server` servisi Python analiz servisine `http://python-api:8000` uzerinden baglanir.
- Browser tarafi backend'e `http://localhost:3001` uzerinden gider; bu nedenle varsayilan `VITE_BACKEND_URL` compose icin uygundur.
