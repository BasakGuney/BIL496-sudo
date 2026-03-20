TERMINAL 1

cd C:\Users\basak\BIL496-sudo\project\server\src\services\analysis\python_api
python -m venv .venv

python -m pip install --upgrade pip
pip install -r requirements.txt

'{"mode":"health"}' | python .\frame_face_analyzer.py

python .\api.py



TERMINAL 2

cd C:\Users\basak\BIL496-sudo\project\server
$env:PYTHON_BIN="C:\Users\basak\BIL496-sudo\project\server\src\services\analysis\python_api\.venv\Scripts\python.exe"
npm install
npm run dev



TERMINAL 3

cd C:\Users\basak\BIL496-sudo\project\client
npm install
npm run dev
