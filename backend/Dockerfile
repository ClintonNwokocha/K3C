# Product image for the Django backend (ksccc-api). Runs under Gunicorn —
# never `manage.py runserver`. Migrations and collectstatic are deliberately
# not run at container startup; the deploying infrastructure runs those as
# explicit, reviewed steps against the running container, not baked into
# this image's entrypoint.

FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /app/media /app/staticfiles \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2"]
