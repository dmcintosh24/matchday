FROM node:20-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ .
RUN npm run build

FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend-build /build/dist /app/static

VOLUME /app/data
ENV DB_PATH=/app/data/fpl_league.db

EXPOSE 8000
CMD ["uvicorn", "server_wrapper:app", "--host", "0.0.0.0", "--port", "8000"]
