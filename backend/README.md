# Чисто — backend (FastAPI + SQLite)

## Запуск

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env           # поменять SECRET_KEY
uvicorn app.main:app --reload --port 8000