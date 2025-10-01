# Zeitnachweis-System

Ein rudimentäres Zeitnachweis-System mit automatischen Email-Erinnerungen, basierend auf der bewährten WeaselParts-Architektur.

## 🚀 Features

- **Mitarbeiterverwaltung**: Hinzufügen und Verwalten von Mitarbeitern
- **Zeitnachweis-Upload**: PDF-Upload für monatliche Zeitnachweise  
- **Automatische Erinnerungen**: 3-stufiges Email-System (5., 10., 15. des Monats)
- **Dashboard**: Übersicht über Upload-Status und Statistiken
- **Email-Test**: Test der SMTP-Konfiguration
- **Admin-Panel**: Verwaltung und manueller Email-Versand

## 🏗️ Architektur

- **Backend**: Node.js + Express
- **Datenbank**: MySQL (gleiche DB wie WeaselParts: 129.247.232.14)
- **Email**: Nodemailer mit DLR SMTP
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Container**: Docker + Docker Compose

## 📦 Installation

1. **Repository klonen/erstellen**:
   ```bash
   mkdir zeitnachweis-app
   cd zeitnachweis-app
   ```

2. **Dependencies installieren**:
   ```bash
   npm install
   ```

3. **Environment konfigurieren**:
   ```bash
   cp .env.example .env
   # .env bearbeiten und WeaselParts .env-Werte einfügen
   ```

4. **Mit Docker starten**:
   ```bash
   docker-compose up -d --build
   ```

## 🔧 Konfiguration

### Environment Variables (.env)

```bash
# Database (gleiche wie WeaselParts)
DB_HOST=129.247.232.14
DB_PORT=3306
DB_USER=advaiv
DB_PASSWORD=<von_weaselparts_kopieren>
DB_DATABASE=test

# Server
PORT=3001

# SMTP (exakt wie WeaselParts)
SMTP_HOST=smtp.dlr.de
SMTP_PORT=587
SMTP_USER=f_weasel
SMTP_PASS=<von_weaselparts_kopieren>
```

### Email-System

Das System verwendet die bewährte WeaselParts Email-Logik:
- **FROM-Email**: `f_weasel` → `weasel@dlr.de`
- **SMTP**: DLR Server mit STARTTLS
- **Templates**: 3 Erinnerungsstufen mit HTML-Design

### Cron Jobs

Automatische Erinnerungen:
- **5. des Monats, 9:00**: Erste Erinnerung
- **10. des Monats, 9:00**: Zweite Erinnerung  
- **15. des Monats, 9:00**: Finale Erinnerung

## 🗄️ Datenbank

### Tabellen

1. **zeitnachweis_employees**: Mitarbeiterdaten
2. **zeitnachweis_uploads**: Upload-Protokoll
3. **zeitnachweis_reminders**: Email-Log

### Migration

Das System nutzt die existierende WeaselParts-Datenbank und erstellt automatisch neue Tabellen mit dem Präfix `zeitnachweis_`.

## 🌐 API Endpoints

- `GET /api/health` - Health Check
- `GET /api/employees` - Alle Mitarbeiter
- `POST /api/employees` - Mitarbeiter hinzufügen
- `DELETE /api/employees/:id` - Mitarbeiter löschen
- `GET /api/employees/status` - Upload-Status
- `POST /api/upload/:employeeId` - Zeitnachweis hochladen
- `POST /api/send-test-email` - Test-Email senden
- `POST /api/admin/test-emails` - Reminder-Test
- `GET /api/admin/email-stats` - Email-Statistiken

## 🎯 URLs

- **Dashboard**: http://localhost:3001/
- **Admin**: http://localhost:3001/admin.html
- **Email Test**: http://localhost:3001/email-test.html

## 🔍 Debugging

### Logs anzeigen
```bash
docker-compose logs -f app
```

### SMTP testen
1. `/email-test.html` aufrufen
2. "Test-Email senden" klicken
3. Logs prüfen

### Datenbank-Verbindung testen
```bash
docker-compose logs db-healthcheck
```

## 📧 Email-Templates

### Erste Erinnerung (5. des Monats)
- **Betreff**: "📋 Fehlender Zeitnachweis für [Monat] [Jahr]"
- **Ton**: Freundlich, informativ

### Zweite Erinnerung (10. des Monats)  
- **Betreff**: "⚠️ Erinnerung: Zeitnachweis für [Monat] [Jahr] noch offen"
- **Ton**: Neutral, erinnernd

### Finale Erinnerung (15. des Monats)
- **Betreff**: "🚨 LETZTE CHANCE: Zeitnachweis für [Monat] [Jahr]"
- **Ton**: Dringend, final

## 🔐 Sicherheit

- Verwendet bewährte WeaselParts SMTP-Konfiguration
- Keine Secrets im Code
- Environment-basierte Konfiguration
- MySQL-Verbindung über geschütztes Netzwerk

## 📝 Nächste Schritte

1. **.env von WeaselParts kopieren**
2. **Auf Ubuntu-Server deployen** (Port 3001)
3. **Email-Funktionalität testen**
4. **Mitarbeiter hinzufügen**
5. **Cron-Jobs überwachen**

## 🛟 Support

Bei Problemen:
1. Logs prüfen: `docker-compose logs -f`
2. Email-Test ausführen: `/email-test.html`
3. SMTP-Konfiguration mit WeaselParts vergleichen
