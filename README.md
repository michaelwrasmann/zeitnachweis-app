# Zeitnachweis-App

Ein System zur Verwaltung und Überwachung von Mitarbeiter-Zeitnachweisen.

## Features

- 📊 **Dashboard**: Übersicht über alle Mitarbeiter und deren Upload-Status
- 📤 **Upload-Bereich**: Mitarbeiter können ihre Zeitnachweise hochladen (nur erste 5 Werktage)
- 👥 **Admin-Bereich**: Verwaltung von Mitarbeitern (Hinzufügen, Deaktivieren)
- 📧 **Automatische Erinnerungen**: Email-Erinnerungen am 3. Werktag des Monats

## Installation

### Mit Docker

```bash
docker-compose up -d
```

### Ohne Docker

```bash
npm install
npm start
```

## Konfiguration

Erstelle eine `.env` Datei mit folgenden Einstellungen:

```env
# Database
DB_HOST=your_host
DB_USER=your_user
DB_PASSWORD=your_password
DB_DATABASE=test
DB_PORT=3306

# Server
PORT=3001

# Email
SMTP_HOST=mailgate.dlr.de
SMTP_PORT=25
EMAIL_FROM=clean1@dlr.de
ADMIN_EMAIL=admin@dlr.de
```

## Verwendung

Nach dem Start ist die App erreichbar unter:
- **Dashboard**: http://localhost:3001/
- **Upload**: http://localhost:3001/upload.html
- **Admin**: http://localhost:3001/admin.html

## Technologie-Stack

- **Backend**: Node.js, Express
- **Datenbank**: MySQL (externe DB)
- **Frontend**: Vanilla JavaScript, HTML, CSS
- **Container**: Docker, Docker Compose

## Upload-Regeln

- Uploads nur in den ersten 5 Werktagen des Monats möglich
- Erlaubte Formate: PDF, PNG, JPG, JPEG
- Max. Dateigröße: 10MB
- Bei erneutem Upload wird die alte Datei überschrieben

## Automatische Erinnerungen

- Werden am 3. Werktag des Monats um 9:00 Uhr versendet
- Nur an Mitarbeiter, die noch keinen Zeitnachweis hochgeladen haben

## Entwicklung

```bash
# Entwicklungsmodus mit nodemon
npm run dev
```

## Support

Bei Fragen oder Problemen: michael.wrasmann@dlr.de