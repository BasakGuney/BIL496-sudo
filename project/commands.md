TERMINAL 1

cd .\project\server
python -m venv .venv-analysis
cd .\src\services\analysis\python_api

..\..\..\..\.venv-analysis\Scripts\python.exe -m pip install --upgrade pip
..\..\..\..\.venv-analysis\Scripts\pip.exe install -r requirements.txt

echo {"mode":"health"} | ..\..\..\..\.venv-analysis\Scripts\python.exe .\vision_analyzer.py

..\..\..\..\.venv-analysis\Scripts\python.exe .\api.py



TERMINAL 2

cd .\project\server
$env:PYTHON_BIN=(Resolve-Path ".\.venv-analysis\Scripts\python.exe").Path
npm install
npm run dev



TERMINAL 3

cd .\project\client
npm install
npm run dev


TEST COMMANDS

cd .\project\server
npm run test:smoke

cd .\project\client
npm run test:smoke

MANUAL TEST EVIDENCE

Checklist: project\docs\testing\MANUAL_SMOKE_CHECKLIST.md
Matrix: project\docs\testing\REQUIREMENT_TEST_MATRIX.md
