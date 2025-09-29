const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// MySQL Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Email Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  tls: {
    rejectUnauthorized: false
  }
});

// Multer Setup für Datei-Uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    await fs.mkdir(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `zeitnachweis-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|png|jpg|jpeg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Nur PDF, PNG, JPG, JPEG Dateien sind erlaubt!'));
    }
  }
});

// Initialize Database
async function initDatabase() {
  try {
    console.log('📋 Initialisiere Datenbank...');
    
    // Mitarbeiter-Tabelle
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS zeitnachweis_employees (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Upload-Tabelle
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS zeitnachweis_uploads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        month INT NOT NULL,
        year INT NOT NULL,
        filename VARCHAR(255) NOT NULL,
        filepath VARCHAR(500) NOT NULL,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES zeitnachweis_employees(id) ON DELETE CASCADE,
        UNIQUE KEY unique_employee_month (employee_id, month, year)
      )
    `);
    
    // Erinnerungs-Log Tabelle
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS zeitnachweis_reminders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        month INT NOT NULL,
        year INT NOT NULL,
        reminder_sent TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES zeitnachweis_employees(id) ON DELETE CASCADE
      )
    `);
    
    console.log('✅ Datenbank erfolgreich initialisiert');
  } catch (error) {
    console.error('❌ Fehler beim Initialisieren der Datenbank:', error);
  }
}

// API Endpoints

// Alle Mitarbeiter mit Upload-Status für aktuellen Monat
app.get('/api/employees/status', async (req, res) => {
  try {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    const [employees] = await pool.execute(`
      SELECT 
        e.id,
        e.name,
        e.email,
        e.active,
        u.upload_date,
        u.filename,
        CASE WHEN u.id IS NOT NULL THEN true ELSE false END as uploaded
      FROM zeitnachweis_employees e
      LEFT JOIN zeitnachweis_uploads u ON 
        e.id = u.employee_id AND 
        u.month = ? AND 
        u.year = ?
      WHERE e.active = true
      ORDER BY e.name
    `, [currentMonth, currentYear]);
    
    res.json(employees);
  } catch (error) {
    console.error('Fehler beim Abrufen der Mitarbeiter:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Mitarbeiter' });
  }
});

// Alle Mitarbeiter abrufen
app.get('/api/employees', async (req, res) => {
  try {
    const [employees] = await pool.execute(`
      SELECT * FROM zeitnachweis_employees 
      ORDER BY name
    `);
    res.json(employees);
  } catch (error) {
    console.error('Fehler beim Abrufen der Mitarbeiter:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Mitarbeiter' });
  }
});

// Neuer Mitarbeiter
app.post('/api/employees', async (req, res) => {
  try {
    const { name, email } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name und Email sind erforderlich' });
    }
    
    const [result] = await pool.execute(
      'INSERT INTO zeitnachweis_employees (name, email) VALUES (?, ?)',
      [name, email]
    );
    
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Mitarbeiter erfolgreich hinzugefügt' 
    });
  } catch (error) {
    console.error('Fehler beim Hinzufügen des Mitarbeiters:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Email-Adresse bereits vorhanden' });
    } else {
      res.status(500).json({ error: 'Fehler beim Hinzufügen des Mitarbeiters' });
    }
  }
});

// Mitarbeiter löschen/deaktivieren
app.delete('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.execute(
      'UPDATE zeitnachweis_employees SET active = false WHERE id = ?',
      [id]
    );
    
    res.json({ message: 'Mitarbeiter erfolgreich deaktiviert' });
  } catch (error) {
    console.error('Fehler beim Deaktivieren des Mitarbeiters:', error);
    res.status(500).json({ error: 'Fehler beim Deaktivieren des Mitarbeiters' });
  }
});

// Datei-Upload
app.post('/api/upload', upload.single('zeitnachweis'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }
    
    const { employeeId } = req.body;
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    if (!employeeId) {
      return res.status(400).json({ error: 'Mitarbeiter-ID fehlt' });
    }
    
    // Check if upload period is open (first 5 working days)
    if (!isUploadPeriodOpen()) {
      return res.status(403).json({ 
        error: 'Upload nur in den ersten 5 Werktagen des Monats möglich' 
      });
    }
    
    // Update or insert upload record
    await pool.execute(`
      INSERT INTO zeitnachweis_uploads (employee_id, month, year, filename, filepath)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        filename = VALUES(filename),
        filepath = VALUES(filepath),
        upload_date = CURRENT_TIMESTAMP
    `, [employeeId, currentMonth, currentYear, req.file.filename, req.file.path]);
    
    res.json({ 
      message: 'Zeitnachweis erfolgreich hochgeladen',
      filename: req.file.filename 
    });
  } catch (error) {
    console.error('Fehler beim Upload:', error);
    res.status(500).json({ error: 'Fehler beim Upload des Zeitnachweises' });
  }
});

// Check if upload period is open
function isUploadPeriodOpen() {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  // Get first day of month
  let workingDaysCount = 0;
  let checkDate = new Date(currentYear, currentMonth, 1);
  
  while (workingDaysCount < 5) {
    const dayOfWeek = checkDate.getDay();
    // Check if it's a working day (Monday=1 to Friday=5)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      workingDaysCount++;
      if (checkDate.toDateString() === today.toDateString()) {
        return true; // Today is within first 5 working days
      }
    }
    checkDate.setDate(checkDate.getDate() + 1);
    
    // Safety check: don't go beyond current month
    if (checkDate.getMonth() !== currentMonth) {
      break;
    }
  }
  
  // Check if today is before the 5th working day
  return today < checkDate;
}

// Send reminder emails
async function sendReminderEmails() {
  try {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    // Get employees who haven't uploaded yet
    const [employees] = await pool.execute(`
      SELECT e.id, e.name, e.email
      FROM zeitnachweis_employees e
      LEFT JOIN zeitnachweis_uploads u ON 
        e.id = u.employee_id AND 
        u.month = ? AND 
        u.year = ?
      WHERE e.active = true AND u.id IS NULL
    `, [currentMonth, currentYear]);
    
    for (const employee of employees) {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: employee.email,
        subject: `Erinnerung: Zeitnachweis für ${currentMonth}/${currentYear} hochladen`,
        html: `
          <p>Hallo ${employee.name},</p>
          <p>Dies ist eine freundliche Erinnerung, Ihren Zeitnachweis für den aktuellen Monat hochzuladen.</p>
          <p>Sie können dies in den ersten 5 Werktagen des Monats über das Zeitnachweis-Portal erledigen.</p>
          <br>
          <p>Mit freundlichen Grüßen,<br>Ihr Admin-Team</p>
        `
      });
      
      // Log reminder
      await pool.execute(`
        INSERT INTO zeitnachweis_reminders (employee_id, month, year)
        VALUES (?, ?, ?)
      `, [employee.id, currentMonth, currentYear]);
    }
    
    console.log(`📧 ${employees.length} Erinnerungs-Emails versendet`);
  } catch (error) {
    console.error('❌ Fehler beim Versenden der Erinnerungen:', error);
  }
}

// Schedule reminder emails (3rd working day of month at 9 AM)
cron.schedule('0 9 * * 1-5', () => {
  const today = new Date();
  if (isThirdWorkingDay(today)) {
    sendReminderEmails();
  }
});

function isThirdWorkingDay(date) {
  const month = date.getMonth();
  const year = date.getFullYear();
  let workingDaysCount = 0;
  let checkDate = new Date(year, month, 1);
  
  while (workingDaysCount < 3) {
    const dayOfWeek = checkDate.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      workingDaysCount++;
      if (workingDaysCount === 3 && 
          checkDate.toDateString() === date.toDateString()) {
        return true;
      }
    }
    checkDate.setDate(checkDate.getDate() + 1);
  }
  return false;
}

// Start server
async function startServer() {
  await initDatabase();
  
  app.listen(PORT, () => {
    console.log('🚀 =======================================');
    console.log(`📊 Zeitnachweis-App läuft auf Port ${PORT}`);
    console.log(`📁 URL: http://localhost:${PORT}`);
    console.log('🚀 =======================================');
  });
}

startServer();