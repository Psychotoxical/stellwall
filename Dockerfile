# syntax=docker/dockerfile:1
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY shared shared
COPY web web
RUN npm run build -w web

FROM node:24-slim
ENV NODE_ENV=production PORT=8080 WEB_DIR=/app/web/dist APP_DIR=/app/android DOCS_DIR=/data/documents
# Text recognition for documents: OCRmyPDF with German and English, pdftotext/pdfinfo to read the result.
RUN apt-get update   && apt-get install -y --no-install-recommends ocrmypdf tesseract-ocr-deu tesseract-ocr-eng poppler-utils   && rm -rf /var/lib/apt/lists/*   && mkdir -p /data/documents && chown node:node /data/documents
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --no-audit --no-fund -w @stellwall/server && npm cache clean --force
COPY shared/src shared/src
COPY server/src server/src
COPY server/drizzle server/drizzle
COPY --from=build /app/web/dist web/dist
# The Android app for the phones' updates; empty unless the release build put it there.
COPY android-dist/ /app/android/
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server/src/main.ts"]
