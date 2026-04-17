# Docker Setup

Bu proje Docker tarafında 3 servis olarak ayağa kalkar:

- `client`: React + Vite arayüzü
- `server`: Node.js / Express backend
- `python-api`: FastAPI tabanlı analiz servisi

## 1. Hazırlık

Repo kökünde değil, `project/` klasörü içinde çalışın.

```bash
cd project
cp .env.docker.example .env
```

`.env` içine gerçek `OPENAI_API_KEY` değerini yazın.

## 2. Servisleri Başlatma

```bash
docker compose up --build
```

İlk kurulum uzun sürebilir. Özellikle `python-api` servisi `torch`, `transformers` ve benzeri ağır bağımlılıkları kurar.
Docker tarafında Python bağımlılıkları için ayrı `requirements.docker.txt` kullanılır ve `torch` CPU odaklı sabit sürümle kurulur. Bu, özellikle Apple Silicon cihazlarda gereksiz CUDA paketlerini çekmemek içindir.

## 3. Erişim Noktaları

- Client: `http://localhost:5173`
- Server: `http://localhost:3001`
- Python API: `http://localhost:8000`

## 4. Ortam Değişkenleri

- `OPENAI_API_KEY`: Node ve Python servislerinin OpenAI çağrıları için zorunlu
- `VITE_BACKEND_URL`: Tarayıcıdaki istemcinin backend'e gideceği adres
- `PORT`: Node backend portu
- `PYTHON_API_BASE_URL`: Backend'in Python servisine erişim adresi
- `REPORTS_DIR`: Analiz raporlarının yazıldığı ortak klasör

## 5. Veri ve Volume Yapısı

`docker-compose.yml` şu paylaşımları kullanır:

- `./reports:/app/reports`
- `hf-cache:/root/.cache/huggingface`

`reports` klasörü backend ve Python servisleri arasında ortak kullanılır. Hugging Face cache volume'u ise model indirmelerini tekrar etmemek içindir.

## 6. Servis Sağlık Kontrolleri

- Backend: `GET /health`
- Python API: `GET /`

Compose, backend'i Python API sağlıklı olduktan sonra başlatır. Client da backend sağlıklı olunca açılır.

## 7. Durdurma ve Temizlik

```bash
docker compose down
```

Cache volume'larını da temizlemek isterseniz:

```bash
docker compose down -v
```

## 8. Notlar

- Client şu anda Vite development server ile çalışır. Geliştirme için pratiktir.
- Production dağıtımı istenirse client için `npm run build` + Nginx katmanı eklenebilir.
- Python image'ının build süresi ve boyutu yüksektir; bu normaldir.
