// Test Server für Email-Funktionalität ohne Datenbank
const express = require('express');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
require('dotenv').config({ path: '.env.local' });

const app = express();
const PORT = 3002;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Mock-Daten für Tests
const mockEmployees = [
    { id: 1, name: 'Max Mustermann', email: 'max.mustermann@example.com', active: true, uploaded: false },
    { id: 2, name: 'Anna Schmidt', email: 'anna.schmidt@example.com', active: true, uploaded: true },
    { id: 3, name: 'Peter Weber', email: 'peter.weber@example.com', active: true, uploaded: false },
];

let reminderCount = 0;

// Email Transporter (Mock für Tests)
const transporter = {
    sendMail: async (mailOptions) => {
        console.log('📧 Mock Email gesendet:');
        console.log('  To:', mailOptions.to);
        console.log('  Subject:', mailOptions.subject);
        console.log('  HTML Length:', mailOptions.html.length, 'chars');
        console.log('  ───────────────────────────────────');
        return Promise.resolve({ messageId: 'mock-' + Date.now() });
    }
};

// API Endpoints für Tests

// Mitarbeiter mit Upload-Status
app.get('/api/employees/status', (req, res) => {
    res.json(mockEmployees);
});

// Alle Mitarbeiter
app.get('/api/employees', (req, res) => {
    res.json(mockEmployees);
});

// Email-Statistiken
app.get('/api/admin/email-stats', (req, res) => {
    const totalEmployees = mockEmployees.filter(emp => emp.active).length;
    const uploadedEmployees = mockEmployees.filter(emp => emp.active && emp.uploaded).length;
    
    res.json({
        total_employees: totalEmployees,
        uploaded_employees: uploadedEmployees,
        pending_employees: totalEmployees - uploadedEmployees,
        reminders_sent: reminderCount,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
    });
});

// Test-Email-Versand
app.post('/api/admin/test-emails', async (req, res) => {
    try {
        const { reminderType } = req.body;
        
        if (!['first', 'second', 'final'].includes(reminderType)) {
            return res.status(400).json({ error: 'Ungültiger Erinnerungstyp' });
        }
        
        console.log(`🧪 Test: Sende ${reminderType} Erinnerung`);
        await sendReminderEmails(reminderType);
        
        res.json({ 
            message: `${reminderType} Test-Erinnerungs-Emails erfolgreich versendet`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Fehler beim manuellen Email-Test:', error);
        res.status(500).json({ error: 'Fehler beim Versenden der Test-Emails' });
    }
});

// Email-Versand-Funktionen (vereinfacht für Tests)
async function sendReminderEmails(reminderType = 'first') {
    try {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        const monthNames = [
            'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
            'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
        ];
        
        // Nur Mitarbeiter ohne Upload
        const pendingEmployees = mockEmployees.filter(emp => emp.active && !emp.uploaded);
        
        console.log(`📧 Sende ${reminderType} Emails an ${pendingEmployees.length} Mitarbeiter:`);
        
        for (const employee of pendingEmployees) {
            const emailData = getEmailTemplate(reminderType, employee.name, currentMonth, currentYear, monthNames, 1);
            
            await transporter.sendMail({
                from: process.env.EMAIL_FROM,
                to: employee.email,
                subject: emailData.subject,
                html: emailData.html
            });
            
            reminderCount++;
        }
        
        console.log(`✅ ${pendingEmployees.length} ${reminderType} Test-Emails "versendet"`);
        
    } catch (error) {
        console.error('❌ Fehler beim Versenden der Test-Erinnerungen:', error);
        throw error;
    }
}

// Email-Template-Funktion
function getEmailTemplate(type, employeeName, month, year, monthNames, workingDay) {
    const monthName = monthNames[month - 1];
    const baseUrl = process.env.BASE_URL || 'http://localhost:3002';
    
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

// Test-Cron-Job (alle 10 Sekunden für Demo)
cron.schedule('*/10 * * * * *', () => {
    console.log('⏰ Test-Cron läuft... (alle 10 Sekunden)');
});

// Server starten
app.listen(PORT, () => {
    console.log('🧪 =======================================');
    console.log(`🔬 Test-Server läuft auf Port ${PORT}`);
    console.log(`📁 URL: http://localhost:${PORT}`);
    console.log(`🔧 Admin: http://localhost:${PORT}/admin.html`);
    console.log('🧪 =======================================');
    console.log('📧 Email-Funktionalität bereit für Tests');
    console.log('💡 Alle Emails werden als Mock-Logs ausgegeben');
});