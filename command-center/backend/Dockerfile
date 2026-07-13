# Backend image. Slim Python base; dependencies cached as their own layer so
# app-code changes don't reinstall the world. Runs as a non-root user.
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# No apt packages needed: asyncpg ships wheels, and the compose healthcheck
# uses Python's stdlib (urllib) rather than curl — which also avoids relying
# on the Debian mirror being reachable from inside the build.

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

RUN chmod +x ./entrypoint.sh \
    && adduser --disabled-password --gecos "" appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Entrypoint applies migrations, then execs the server.
ENTRYPOINT ["./entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
