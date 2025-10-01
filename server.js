// Zeitnachweis-App Server - Basierend auf WeaselParts
// Rudimentäres System mit automatischen Email-Erinnerungen

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static('public'));

// MySQL Connection Pool (exakt wie WeaselParts)
let pool;

function createMySQLPool() {
  pool = mysql.createPool({
    host: process.env.DB_HOST || '129.247.232.14',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'advaiv',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'test',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
  });
  
  console.log('🔗 MySQL Pool erstellt für:', process.env.DB_HOST || '129.247.232.14');
  return pool;
}

// Initialize MySQL Pool
createMySQLPool();

// File Upload Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().slice(0, 10);
    const employeeId = req.params.employeeId || 'unknown';
    cb(null, `zeitnachweis_${employeeId}_${timestamp}_${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Nur PDF-Dateien sind erlaubt'), false);
    }
  }
});

// Database Initialization (WeaselParts Style)
async function initializeDatabase() {
  try {
    console.log('🗄️ Initialisiere Zeitnachweis-Datenbank...');
    
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
        reminder_type ENUM('first', 'second', 'final') NOT NULL,
        reminder_sent TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES zeitnachweis_employees(id) ON DELETE CASCADE
      )
    `);
    
    console.log('✅ Datenbank erfolgreich initialisiert');
  } catch (error) {
    console.error('❌ Fehler beim Initialisieren der Datenbank:', error);
  }
}

// Initialize database on startup
initializeDatabase();

// ================== API ENDPOINTS ==================

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Alle Mitarbeiter mit Upload-Status für vorherigen Monat
app.get('/api/employees/status', async (req, res) => {
  try {
    const now = new Date();
    const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    
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
    `, [lastMonth, lastMonthYear]);
    
    res.json(employees);
  } catch (error) {
    console.error('❌ Fehler beim Laden der Mitarbeiter:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Mitarbeiter' });
  }
});

// Alle Mitarbeiter
app.get('/api/employees', async (req, res) => {
  try {
    const [employees] = await pool.execute(`
      SELECT * FROM zeitnachweis_employees 
      ORDER BY name
    `);
    res.json(employees);
  } catch (error) {
    console.error('❌ Fehler beim Laden der Mitarbeiter:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Mitarbeiter' });
  }
});

// Neuen Mitarbeiter hinzufügen
app.post('/api/employees', async (req, res) => {
  try {
    const { name, email } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name und E-Mail sind erforderlich' });
    }
    
    const [result] = await pool.execute(
      'INSERT INTO zeitnachweis_employees (name, email) VALUES (?, ?)',
      [name, email]
    );
    
    res.json({ 
      id: result.insertId, 
      name, 
      email, 
      message: 'Mitarbeiter erfolgreich hinzugefügt' 
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'E-Mail-Adresse bereits vorhanden' });
    } else {
      console.error('❌ Fehler beim Hinzufügen des Mitarbeiters:', error);
      res.status(500).json({ error: 'Fehler beim Hinzufügen des Mitarbeiters' });
    }
  }
});

// Mitarbeiter löschen
app.delete('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await pool.execute(
      'DELETE FROM zeitnachweis_employees WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
    }
    
    res.json({ message: 'Mitarbeiter erfolgreich gelöscht' });
  } catch (error) {
    console.error('❌ Fehler beim Löschen des Mitarbeiters:', error);
    res.status(500).json({ error: 'Fehler beim Löschen des Mitarbeiters' });
  }
});

// File Upload
app.post('/api/upload/:employeeId', upload.single('zeitnachweis'), async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { month, year } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }
    
    if (!month || !year) {
      return res.status(400).json({ error: 'Monat und Jahr sind erforderlich' });
    }
    
    // Insert or update upload record
    await pool.execute(`
      INSERT INTO zeitnachweis_uploads (employee_id, month, year, filename, filepath)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        filename = VALUES(filename),
        filepath = VALUES(filepath),
        upload_date = CURRENT_TIMESTAMP
    `, [employeeId, month, year, req.file.filename, req.file.path]);
    
    res.json({ 
      message: 'Zeitnachweis erfolgreich hochgeladen',
      filename: req.file.filename 
    });
  } catch (error) {
    console.error('❌ Fehler beim Hochladen:', error);
    res.status(500).json({ error: 'Fehler beim Hochladen der Datei' });
  }
});

// SMTP Test Endpoint (exakt wie WeaselParts)
app.post('/api/send-test-email', async (req, res) => {
  try {
    console.log('📧 API-Anfrage: Test-Email senden');

    // SMTP-Konfiguration aus Umgebungsvariablen (WeaselParts Style)
    const smtpConfig = {
      host: process.env.SMTP_HOST || 'smtp.dlr.de',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false, // STARTTLS
      auth: {
        user: process.env.SMTP_USER || 'f_weasel',
        pass: process.env.SMTP_PASS
      }
    };

    // Überprüfen ob SMTP-Passwort gesetzt ist
    if (!smtpConfig.auth.pass) {
      console.error('❌ SMTP_PASS Umgebungsvariable ist nicht gesetzt');
      return res.status(400).json({ 
        error: 'Email-Konfiguration unvollständig',
        details: 'SMTP_PASS Umgebungsvariable muss konfiguriert werden'
      });
    }

    console.log(`📧 SMTP Config: ${smtpConfig.host}:${smtpConfig.port} (${smtpConfig.auth.user})`);

    // Nodemailer Transporter erstellen
    const transporter = nodemailer.createTransport(smtpConfig);
    
    // FROM-Email Logic wie WeaselParts
    const fromEmail = smtpConfig.auth.user.includes('f_weasel') ? 'weasel@dlr.de' : smtpConfig.auth.user;

    // Email-Inhalt
    const mailOptions = {
      from: `"Zeitnachweis-System" <${fromEmail}>`,
      to: 'michael.wrasmann@dlr.de',
      subject: 'Test-Email vom Zeitnachweis-System',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
            📊 Zeitnachweis-System Test-Email
          </h2>
          
          <p style="font-size: 16px; line-height: 1.6; color: #34495e;">
            Hallo,<br><br>
            diese Test-Email bestätigt, dass das <strong>Zeitnachweis-System</strong> erfolgreich konfiguriert ist 
            und E-Mails versenden kann.
          </p>
          
          <div style="background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #6b7280;">📋 System-Informationen</h3>
            <p style="margin: 5px 0;"><strong>SMTP Server:</strong> ${smtpConfig.host}:${smtpConfig.port}</p>
            <p style="margin: 5px 0;"><strong>Absender:</strong> ${smtpConfig.auth.user}</p>
            <p style="margin: 5px 0;"><strong>Zeitstempel:</strong> ${new Date().toLocaleString('de-DE')}</p>
          </div>
          
          <p style="font-size: 14px; color: #7f8c8d; margin-top: 30px;">
            <em>Diese E-Mail wurde automatisch vom Zeitnachweis-System generiert.</em>
          </p>
        </div>
      `
    };

    // Email versenden
    const info = await transporter.sendMail(mailOptions);

    console.log('✅ Test-Email erfolgreich versendet');
    console.log('Message ID:', info.messageId);

    res.json({
      message: 'Test-Email erfolgreich versendet',
      messageId: info.messageId,
      recipient: 'michael.wrasmann@dlr.de'
    });

  } catch (error) {
    console.error('❌ Fehler beim Versenden der Test-Email:', error);
    res.status(500).json({ 
      error: 'Fehler beim Versenden der Email',
      details: error.message
    });
  }
});

// Send Reminder Emails (Manual Trigger)
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

// Email Statistics
app.get('/api/admin/email-stats', async (req, res) => {
  try {
    const now = new Date();
    const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    
    const [totalEmployees] = await pool.execute(
      'SELECT COUNT(*) as count FROM zeitnachweis_employees WHERE active = true'
    );
    
    const [uploadedEmployees] = await pool.execute(`
      SELECT COUNT(*) as count FROM zeitnachweis_employees e
      JOIN zeitnachweis_uploads u ON e.id = u.employee_id
      WHERE e.active = true AND u.month = ? AND u.year = ?
    `, [lastMonth, lastMonthYear]);
    
    const [remindersSent] = await pool.execute(`
      SELECT COUNT(*) as count FROM zeitnachweis_reminders
      WHERE month = ? AND year = ?
    `, [lastMonth, lastMonthYear]);
    
    res.json({
      total_employees: totalEmployees[0].count,
      uploaded_employees: uploadedEmployees[0].count,
      pending_employees: totalEmployees[0].count - uploadedEmployees[0].count,
      reminders_sent: remindersSent[0].count,
      month: lastMonth,
      year: lastMonthYear
    });
  } catch (error) {
    console.error('❌ Fehler beim Laden der Statistiken:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Statistiken' });
  }
});

// ================== EMAIL FUNCTIONS ==================

// Send reminder emails with different templates (WeaselParts Style)
async function sendReminderEmails(reminderType = 'first') {
  try {
    console.log(`📧 Sende ${reminderType} Erinnerungs-Emails...`);
    
    // SMTP-Konfiguration exakt wie WeaselParts
    const smtpConfig = {
      host: process.env.SMTP_HOST || 'smtp.dlr.de',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || 'f_weasel',
        pass: process.env.SMTP_PASS
      }
    };
    
    if (!smtpConfig.auth.pass) {
      console.log('⚠️ SMTP-Konfiguration fehlt - Erinnerungsmail übersprungen');
      return;
    }
    
    const transporter = nodemailer.createTransport(smtpConfig);
    const now = new Date();
    // Prüfe den vorherigen Monat
    const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    
    const monthNames = [
      'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
    ];
    
    // Get employees who haven't uploaded for LAST month
    const [employees] = await pool.execute(`
      SELECT e.id, e.name, e.email
      FROM zeitnachweis_employees e
      LEFT JOIN zeitnachweis_uploads u ON 
        e.id = u.employee_id AND 
        u.month = ? AND 
        u.year = ?
      WHERE e.active = true AND u.id IS NULL
    `, [lastMonth, lastMonthYear]);
    
    console.log(`📧 Sende ${reminderType} Emails an ${employees.length} Mitarbeiter für ${monthNames[lastMonth-1]} ${lastMonthYear}`);
    
    for (const employee of employees) {
      try {
        const emailData = getEmailTemplate(reminderType, employee.name, lastMonth, lastMonthYear, monthNames);
        
        // From-Email wie WeaselParts behandeln
        const fromEmail = smtpConfig.auth.user.includes('f_weasel') ? 'weasel@dlr.de' : smtpConfig.auth.user;
        
        const result = await transporter.sendMail({
          from: `"Zeitnachweis-System" <${fromEmail}>`,
          to: employee.email,
          subject: emailData.subject,
          html: emailData.html
        });
        
        // Log reminder in database
        await pool.execute(`
          INSERT INTO zeitnachweis_reminders (employee_id, month, year, reminder_type)
          VALUES (?, ?, ?, ?)
        `, [employee.id, lastMonth, lastMonthYear, reminderType]);
        
        console.log(`✅ ${reminderType} Email gesendet an ${employee.email} (MessageID: ${result.messageId})`);
        
      } catch (emailError) {
        console.error(`❌ Fehler beim Senden an ${employee.email}:`, emailError.message);
      }
    }
    
    console.log(`✅ ${employees.length} ${reminderType} Erinnerungs-Emails versendet`);
    
  } catch (error) {
    console.error('❌ Fehler beim Versenden der Erinnerungen:', error);
    throw error;
  }
}

// Email Template Function
function getEmailTemplate(type, employeeName, month, year, monthNames) {
  const monthName = monthNames[month - 1];
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  
  switch (type) {
    case 'first':
      return {
        subject: `📋 Fehlender Zeitnachweis für ${monthName} ${year}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e67e22;">📋 Zeitnachweis fehlt noch!</h2>
            <p>Hallo <strong>${employeeName}</strong>,</p>
            <p>Uns fehlt noch Ihr Zeitnachweis für den <strong>${monthName} ${year}</strong>.</p>
            <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
              <p>📅 <strong>Zeitnachweis für ${monthName} ${year} fehlt</strong></p>
              <p>⏰ <strong>Bitte laden Sie diesen so schnell wie möglich hoch.</strong></p>
            </div>
            <p><a href="${baseUrl}/upload" style="background-color: #e67e22; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">🔗 Jetzt hochladen</a></p>
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
              <p>📅 <strong>Zweite Erinnerung</strong></p>
              <p>⏳ <strong>Bitte laden Sie Ihren Zeitnachweis bald hoch</strong></p>
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
            <h2 style="color: #e74c3c;">🚨 Finale Erinnerung!</h2>
            <p>Hallo <strong>${employeeName}</strong>,</p>
            <p><strong>WICHTIG:</strong> Dies ist die letzte Erinnerung für Ihren Zeitnachweis für den <strong>${monthName} ${year}</strong>!</p>
            <div style="background-color: #f8d7da; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
              <p>🗓️ <strong>Finale Erinnerung</strong></p>
              <p>⏰ <strong>Bitte laden Sie Ihren Zeitnachweis DRINGEND hoch!</strong></p>
            </div>
            <p><a href="${baseUrl}/upload" style="background-color: #dc3545; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">🚀 SOFORT HOCHLADEN</a></p>
            <p style="color: #666; font-size: 14px;">Bei Problemen wenden Sie sich bitte umgehend an das Admin-Team.</p>
            <p>Mit freundlichen Grüßen,<br>Ihr Zeitnachweis-Team</p>
          </div>
        `
      };
    
    default:
      return getEmailTemplate('first', employeeName, month, year, monthNames);
  }
}

// ================== CRON JOBS ==================

// Schedule reminder emails für fehlende Zeitnachweise
// 5. Tag des Monats um 9 AM - Erste Erinnerung 
cron.schedule('0 9 5 * *', () => {
  console.log('📧 Sende erste Erinnerungsmail für fehlende Zeitnachweise (5. des Monats)');
  sendReminderEmails('first');
});

// 10. Tag des Monats um 9 AM - Zweite Erinnerung
cron.schedule('0 9 10 * *', () => {
  console.log('📧 Sende zweite Erinnerungsmail für fehlende Zeitnachweise (10. des Monats)');
  sendReminderEmails('second');
});

// 15. Tag des Monats um 9 AM - Finale Erinnerung
cron.schedule('0 9 15 * *', () => {
  console.log('📧 Sende finale Erinnerungsmail für fehlende Zeitnachweise (15. des Monats)');
  sendReminderEmails('final');
});

// ================== SERVER START ==================

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n📧 Server wird heruntergefahren...');
  if (pool) {
    await pool.end();
    console.log('🗄️ MySQL-Verbindung geschlossen');
  }
  process.exit(0);
});

// Server starten
app.listen(PORT, () => {
  console.log('📧 =======================================');
  console.log(`🚀 Zeitnachweis-App läuft auf Port ${PORT}`);
  console.log(`📁 URL: http://localhost:${PORT}`);
  console.log(`🗄️ MySQL-Datenbank: ${process.env.DB_HOST || '129.247.232.14'}:${process.env.DB_PORT || 3306}`);
  console.log('📧 Email-System bereit');
  console.log('📧 =======================================');
});