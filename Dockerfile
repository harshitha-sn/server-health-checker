# Server Health Checker — production-style image
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    FLASK_APP=app:app \
    DATABASE_PATH=/data/healthchecker.db

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py db.py health_service.py ./
COPY templates ./templates
COPY static ./static

RUN mkdir -p /data

EXPOSE 5000

# Gunicorn serves the Flask WSGI app (scales workers for small deployments)
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "app:app"]
