FROM node:18-alpine

# Arbeitsverzeichnis erstellen
WORKDIR /app

# Package.json kopieren und Dependencies installieren
COPY package*.json ./
RUN npm install --production

# App-Code kopieren
COPY . .

# Upload-Verzeichnis erstellen
RUN mkdir -p public/uploads

# Port freigeben
EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# App starten
CMD ["npm", "start"]