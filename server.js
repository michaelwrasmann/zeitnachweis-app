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

// Test endpoint for manual email sending (only for development)
app.post('/api/admin/test-emails', async (req, res) => {
  try {
    const { reminderType } = req.body;
    
    if (!['first', 'second', 'final'].includes(reminderType)) {
      return res.status(400).json({ error: 'Ungültiger Erinnerungstyp' });
    }
    
    console.log(`🧪 Test: Sende ${reminderType} Erinnerung manuell`);
    await sendReminderEmails(reminderType);
    
    res.json({ 
      message: `${reminderType} Erinnerungs-Emails erfolgreich versendet`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Fehler beim manuellen Email-Test:', error);
    res.status(500).json({ error: 'Fehler beim Versenden der Test-Emails' });
  }
});

// Get email statistics
app.get('/api/admin/email-stats', async (req, res) => {
  try {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    const [totalEmployees] = await pool.execute(
      'SELECT COUNT(*) as count FROM zeitnachweis_employees WHERE active = true'
    );
    
    const [uploadedEmployees] = await pool.execute(`
      SELECT COUNT(*) as count FROM zeitnachweis_employees e
      JOIN zeitnachweis_uploads u ON e.id = u.employee_id
      WHERE e.active = true AND u.month = ? AND u.year = ?
    `, [currentMonth, currentYear]);
    
    const [remindersSent] = await pool.execute(`
      SELECT COUNT(*) as count FROM zeitnachweis_reminders
      WHERE month = ? AND year = ?
    `, [currentMonth, currentYear]);
    
    res.json({
      total_employees: totalEmployees[0].count,
      uploaded_employees: uploadedEmployees[0].count,
      pending_employees: totalEmployees[0].count - uploadedEmployees[0].count,
      reminders_sent: remindersSent[0].count,
      month: currentMonth,
      year: currentYear
    });
  } catch (error) {
    console.error('❌ Fehler beim Abrufen der Email-Statistiken:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Statistiken' });
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

// Send reminder emails with different templates
async function sendReminderEmails(reminderType = 'first') {
  try {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const monthNames = [
      'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
    ];
    
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
    
    // Get current working day info
    const today = new Date();
    const workingDay = getWorkingDayNumber(today);
    
    for (const employee of employees) {
      const emailData = getEmailTemplate(reminderType, employee.name, currentMonth, currentYear, monthNames, workingDay);
      
      await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: employee.email,
        subject: emailData.subject,
        html: emailData.html
      });
      
      // Log reminder with type
      await pool.execute(`
        INSERT INTO zeitnachweis_reminders (employee_id, month, year)
        VALUES (?, ?, ?)
      `, [employee.id, currentMonth, currentYear]);
    }
    
    console.log(`📧 ${employees.length} ${reminderType} Erinnerungs-Emails versendet`);
  } catch (error) {
    console.error('❌ Fehler beim Versenden der Erinnerungen:', error);
  }
}

// Get email template based on reminder type
function getEmailTemplate(type, employeeName, month, year, monthNames, workingDay) {
  const monthName = monthNames[month - 1];
  const baseUrl = process.env.BASE_URL || 'http://129.247.232.14:3001';
  
  switch (type) {
    case 'first':
      return {
        subject: `📋 Zeitnachweis für ${monthName} ${year} - Upload möglich!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">🎯 Zeitnachweis Upload gestartet!</h2>
            <p>Hallo <strong>${employeeName}</strong>,</p>
            <p>Der Upload-Zeitraum für den <strong>${monthName} ${year}</strong> hat begonnen!</p>
            <div style="background-color: #e8f5e8; padding: 15px; border-left: 4px solid #27ae60; margin: 20px 0;">
              <p>✅ <strong>Sie haben ab heute 5 Werktage Zeit</strong> für den Upload Ihres Zeitnachweises.</p>
              <p>📅 Heute ist der <strong>${workingDay}. Werktag</strong> des Monats.</p>
            </div>
            <p><a href="${baseUrl}/upload" style="background-color: #3498db; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">🔗 Jetzt hochladen</a></p>
            <p>Mit freundlichen Grüßen,<br>Ihr Zeitnachweis-Team</p>
          </div>
        `
      };
    
    case 'second':
      return {
        subject: `⚠️ Erinnerung: Zeitnachweis für ${monthName} ${year} noch offen`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e67e22;">⏰ Noch Zeit für Ihren Zeitnachweis!</h2>
            <p>Hallo <strong>${employeeName}</strong>,</p>
            <p>Dies ist eine freundliche Erinnerung für Ihren Zeitnachweis im <strong>${monthName} ${year}</strong>.</p>
            <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
              <p>📅 Heute ist der <strong>${workingDay}. Werktag</strong> des Monats.</p>
              <p>⏳ <strong>Sie haben noch wenige Tage Zeit</strong> für den Upload.</p>
            </div>
            <p><a href="${baseUrl}/upload" style="background-color: #e67e22; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">📤 Jetzt hochladen</a></p>
            <p>Mit freundlichen Grüßen,<br>Ihr Zeitnachweis-Team</p>
          </div>
        `
      };
    
    case 'final':
      return {
        subject: `🚨 LETZTE CHANCE: Zeitnachweis für ${monthName} ${year}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e74c3c;">🚨 Letzter Upload-Tag!</h2>
            <p>Hallo <strong>${employeeName}</strong>,</p>
            <p><strong>WICHTIG:</strong> Heute ist der letzte Tag für den Upload Ihres Zeitnachweises für den <strong>${monthName} ${year}</strong>!</p>
            <div style="background-color: #f8d7da; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
              <p>🗓️ <strong>Heute ist der 5. und letzte Werktag</strong> für den Upload.</p>
              <p>⏰ <strong>Upload-Zeitraum endet heute um 24:00 Uhr!</strong></p>
            </div>
            <p><a href="${baseUrl}/upload" style="background-color: #dc3545; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">🚀 SOFORT HOCHLADEN</a></p>
            <p style="color: #666; font-size: 14px;">Bei Problemen wenden Sie sich bitte umgehend an das Admin-Team.</p>
            <p>Mit freundlichen Grüßen,<br>Ihr Zeitnachweis-Team</p>
          </div>
        `
      };
    
    default:
      return getEmailTemplate('first', employeeName, month, year, monthNames, workingDay);
  }
}

// Get current working day number in month
function getWorkingDayNumber(date) {
  const month = date.getMonth();
  const year = date.getFullYear();
  let workingDaysCount = 0;
  let checkDate = new Date(year, month, 1);
  
  while (checkDate <= date && checkDate.getMonth() === month) {
    const dayOfWeek = checkDate.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      workingDaysCount++;
      if (checkDate.toDateString() === date.toDateString()) {
        return workingDaysCount;
      }
    }
    checkDate.setDate(checkDate.getDate() + 1);
  }
  return workingDaysCount;
}

// Schedule reminder emails 
// 1st working day at 9 AM - First reminder
cron.schedule('0 9 * * 1-5', () => {
  const today = new Date();
  if (isFirstWorkingDay(today)) {
    console.log('📧 Sende erste Erinnerungsmail (1. Werktag)');
    sendReminderEmails('first');
  }
});

// 3rd working day at 9 AM - Second reminder  
cron.schedule('0 9 * * 1-5', () => {
  const today = new Date();
  if (isThirdWorkingDay(today)) {
    console.log('📧 Sende zweite Erinnerungsmail (3. Werktag)');
    sendReminderEmails('second');
  }
});

// 5th working day at 9 AM - Final reminder
cron.schedule('0 9 * * 1-5', () => {
  const today = new Date();
  if (isFifthWorkingDay(today)) {
    console.log('📧 Sende finale Erinnerungsmail (5. Werktag)');
    sendReminderEmails('final');
  }
});

function isFirstWorkingDay(date) {
  const month = date.getMonth();
  const year = date.getFullYear();
  let checkDate = new Date(year, month, 1);
  
  // Find first working day of month
  while (checkDate.getMonth() === month) {
    const dayOfWeek = checkDate.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      return checkDate.toDateString() === date.toDateString();
    }
    checkDate.setDate(checkDate.getDate() + 1);
  }
  return false;
}

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

function isFifthWorkingDay(date) {
  const month = date.getMonth();
  const year = date.getFullYear();
  let workingDaysCount = 0;
  let checkDate = new Date(year, month, 1);
  
  while (workingDaysCount < 5) {
    const dayOfWeek = checkDate.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      workingDaysCount++;
      if (workingDaysCount === 5 && 
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