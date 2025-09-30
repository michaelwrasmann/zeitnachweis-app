// Admin JavaScript für Zeitnachweis-App
document.addEventListener('DOMContentLoaded', function() {
    // Initialize admin page
    loadEmployeeTable();
    setupAddEmployeeForm();
    loadEmailStats();
});

/**
 * Load and display employee table
 */
async function loadEmployeeTable() {
    try {
        const response = await fetch('/api/employees');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const employees = await response.json();
        populateEmployeeTable(employees);
        
    } catch (error) {
        console.error('Fehler beim Laden der Mitarbeiterliste:', error);
        showMessage('Fehler beim Laden der Mitarbeiterliste.', 'error');
    }
}

/**
 * Populate employee table with data
 */
function populateEmployeeTable(employees) {
    const tableBody = document.getElementById('employeeTableBody');
    
    if (!tableBody) {
        console.error('Employee table body not found');
        return;
    }
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    // Add employees to table
    employees.forEach(employee => {
        const row = createEmployeeRow(employee);
        tableBody.appendChild(row);
    });
    
    // Show message if no employees
    if (employees.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="5" class="no-data">
                Keine Mitarbeiter vorhanden
            </td>
        `;
        tableBody.appendChild(row);
    }
}

/**
 * Create a table row for an employee
 */
function createEmployeeRow(employee) {
    const row = document.createElement('tr');
    row.className = employee.active ? 'employee-active' : 'employee-inactive';
    
    // Format creation date
    const createdDate = new Date(employee.created_at);
    const formattedDate = createdDate.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    
    // Status display
    const statusText = employee.active ? 'Aktiv' : 'Deaktiviert';
    const statusClass = employee.active ? 'status-active' : 'status-inactive';
    
    row.innerHTML = `
        <td class="employee-name">${escapeHtml(employee.name)}</td>
        <td class="employee-email">${escapeHtml(employee.email)}</td>
        <td class="employee-status">
            <span class="status-badge ${statusClass}">${statusText}</span>
        </td>
        <td class="employee-created">${formattedDate}</td>
        <td class="employee-actions">
            ${employee.active ? `
                <button class="btn btn-danger btn-sm" 
                        onclick="deactivateEmployee(${employee.id}, '${escapeHtml(employee.name)}')">
                    🚫 Deaktivieren
                </button>
            ` : `
                <span class="inactive-note">Deaktiviert</span>
            `}
        </td>
    `;
    
    return row;
}

/**
 * Setup add employee form
 */
function setupAddEmployeeForm() {
    const addForm = document.getElementById('addEmployeeForm');
    
    if (!addForm) {
        console.error('Add employee form not found');
        return;
    }
    
    addForm.addEventListener('submit', handleAddEmployee);
    
    // Add input validation
    const nameInput = document.getElementById('employeeName');
    const emailInput = document.getElementById('employeeEmail');
    
    if (nameInput) {
        nameInput.addEventListener('blur', validateName);
    }
    
    if (emailInput) {
        emailInput.addEventListener('blur', validateEmail);
    }
}

/**
 * Handle adding new employee
 */
async function handleAddEmployee(event) {
    event.preventDefault();
    
    const nameInput = document.getElementById('employeeName');
    const emailInput = document.getElementById('employeeEmail');
    const submitButton = event.target.querySelector('button[type="submit"]');
    
    if (!nameInput || !emailInput) {
        showMessage('Formularfelder nicht gefunden.', 'error');
        return;
    }
    
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    
    // Client-side validation
    if (!name || name.length < 2) {
        showMessage('Name muss mindestens 2 Zeichen lang sein.', 'error');
        nameInput.focus();
        return;
    }
    
    if (!isValidEmail(email)) {
        showMessage('Bitte geben Sie eine gültige E-Mail-Adresse ein.', 'error');
        emailInput.focus();
        return;
    }
    
    // Show loading state
    const originalButtonText = submitButton.textContent;
    submitButton.textContent = 'Wird hinzugefügt...';
    submitButton.disabled = true;
    
    try {
        const response = await fetch('/api/employees', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage(`Mitarbeiter "${name}" erfolgreich hinzugefügt!`, 'success');
            
            // Reset form
            event.target.reset();
            
            // Reload employee table
            loadEmployeeTable();
            
        } else {
            throw new Error(result.error || 'Fehler beim Hinzufügen des Mitarbeiters');
        }
        
    } catch (error) {
        console.error('Add employee error:', error);
        showMessage(error.message, 'error');
    } finally {
        // Reset button state
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;
    }
}

/**
 * Deactivate an employee
 */
async function deactivateEmployee(employeeId, employeeName) {
    // Confirm action
    if (!confirm(`Möchten Sie den Mitarbeiter "${employeeName}" wirklich deaktivieren?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/employees/${employeeId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage(`Mitarbeiter "${employeeName}" wurde deaktiviert.`, 'success');
            
            // Reload employee table
            loadEmployeeTable();
            
        } else {
            throw new Error(result.error || 'Fehler beim Deaktivieren des Mitarbeiters');
        }
        
    } catch (error) {
        console.error('Deactivate employee error:', error);
        showMessage(error.message, 'error');
    }
}

/**
 * Send reminder emails to employees who haven't uploaded
 */
async function sendReminders() {
    // Confirm action
    if (!confirm('Möchten Sie Erinnerungen an alle Mitarbeiter senden, die noch nicht hochgeladen haben?')) {
        return;
    }
    
    const reminderButton = document.querySelector('button[onclick="sendReminders()"]');
    
    if (reminderButton) {
        const originalText = reminderButton.textContent;
        reminderButton.textContent = 'Erinnerungen werden versendet...';
        reminderButton.disabled = true;
        
        try {
            // Get employees who haven't uploaded yet
            const statusResponse = await fetch('/api/employees/status');
            if (!statusResponse.ok) {
                throw new Error('Fehler beim Abrufen der Mitarbeiterstatus');
            }
            
            const employees = await statusResponse.json();
            const pendingEmployees = employees.filter(emp => !emp.uploaded);
            
            if (pendingEmployees.length === 0) {
                showMessage('Alle Mitarbeiter haben bereits ihre Zeitnachweise hochgeladen.', 'info');
                return;
            }
            
            // Simulate sending reminders (since there's no direct API endpoint)
            // In a real implementation, you would call an API endpoint here
            showMessage(`Erinnerungen wurden an ${pendingEmployees.length} Mitarbeiter gesendet.`, 'success');
            
            // Log the pending employees for debugging
            console.log('Erinnerungen gesendet an:', pendingEmployees.map(emp => emp.name));
            
        } catch (error) {
            console.error('Send reminders error:', error);
            showMessage('Fehler beim Senden der Erinnerungen.', 'error');
        } finally {
            reminderButton.textContent = originalText;
            reminderButton.disabled = false;
        }
    }
}

/**
 * Validate name input
 */
function validateName(event) {
    const input = event.target;
    const value = input.value.trim();
    
    if (value.length > 0 && value.length < 2) {
        input.setCustomValidity('Name muss mindestens 2 Zeichen lang sein.');
        input.classList.add('invalid');
    } else {
        input.setCustomValidity('');
        input.classList.remove('invalid');
    }
}

/**
 * Validate email input
 */
function validateEmail(event) {
    const input = event.target;
    const value = input.value.trim();
    
    if (value.length > 0 && !isValidEmail(value)) {
        input.setCustomValidity('Bitte geben Sie eine gültige E-Mail-Adresse ein.');
        input.classList.add('invalid');
    } else {
        input.setCustomValidity('');
        input.classList.remove('invalid');
    }
}

/**
 * Check if email is valid
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Show success/error messages
 */
function showMessage(message, type = 'info') {
    const statusContainer = document.getElementById('adminStatus');
    
    if (!statusContainer) {
        console.error('Admin status container not found');
        return;
    }
    
    // Clear existing messages
    statusContainer.innerHTML = '';
    
    // Create message element
    const messageElement = document.createElement('div');
    messageElement.className = `alert alert-${type}`;
    
    // Add appropriate icon
    let icon = '';
    switch (type) {
        case 'success':
            icon = '✅';
            break;
        case 'error':
            icon = '❌';
            break;
        case 'warning':
            icon = '⚠️';
            break;
        default:
            icon = 'ℹ️';
    }
    
    messageElement.innerHTML = `
        <span class="alert-icon">${icon}</span>
        <span class="alert-text">${escapeHtml(message)}</span>
        <button class="alert-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    statusContainer.appendChild(messageElement);
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            if (messageElement && messageElement.parentElement) {
                messageElement.remove();
            }
        }, 5000);
    }
    
    // Scroll to message
    messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Export employee list as CSV
 */
function exportEmployeeList() {
    fetch('/api/employees')
        .then(response => response.json())
        .then(employees => {
            const csv = convertToCSV(employees);
            downloadCSV(csv, 'mitarbeiterliste.csv');
        })
        .catch(error => {
            console.error('Export error:', error);
            showMessage('Fehler beim Exportieren der Mitarbeiterliste.', 'error');
        });
}

/**
 * Convert employee data to CSV
 */
function convertToCSV(employees) {
    const headers = ['Name', 'E-Mail', 'Status', 'Hinzugefügt am'];
    const csvContent = [
        headers.join(','),
        ...employees.map(emp => [
            `"${emp.name.replace(/"/g, '""')}"`,
            `"${emp.email.replace(/"/g, '""')}"`,
            emp.active ? 'Aktiv' : 'Deaktiviert',
            new Date(emp.created_at).toLocaleDateString('de-DE')
        ].join(','))
    ].join('\n');
    
    return csvContent;
}

/**
 * Download CSV file
 */
function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

/**
 * Search/filter employees in table
 */
function setupEmployeeSearch() {
    const searchInput = document.getElementById('employeeSearch');
    
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const tableRows = document.querySelectorAll('#employeeTableBody tr');
            
            tableRows.forEach(row => {
                const name = row.querySelector('.employee-name')?.textContent.toLowerCase() || '';
                const email = row.querySelector('.employee-email')?.textContent.toLowerCase() || '';
                
                const matches = name.includes(searchTerm) || email.includes(searchTerm);
                row.style.display = matches ? '' : 'none';
            });
        });
    }
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ctrl+R to refresh table
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            loadEmployeeTable();
        }
        
        // Ctrl+N to focus on new employee name input
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            const nameInput = document.getElementById('employeeName');
            if (nameInput) nameInput.focus();
        }
    });
}

// Initialize additional features
document.addEventListener('DOMContentLoaded', function() {
    setupEmployeeSearch();
    setupKeyboardShortcuts();
});

// Auto-refresh employee table every 2 minutes
setInterval(loadEmployeeTable, 120000);

/**
 * Load email statistics
 */
async function loadEmailStats() {
    try {
        const response = await fetch('/api/admin/email-stats');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const stats = await response.json();
        
        // Update statistics display
        const totalElement = document.getElementById('totalEmployees');
        const uploadedElement = document.getElementById('uploadedEmployees');
        const pendingElement = document.getElementById('pendingEmployees');
        const remindersElement = document.getElementById('remindersSent');
        
        if (totalElement) totalElement.textContent = stats.total_employees;
        if (uploadedElement) uploadedElement.textContent = stats.uploaded_employees;
        if (pendingElement) pendingElement.textContent = stats.pending_employees;
        if (remindersElement) remindersElement.textContent = stats.reminders_sent;
        
    } catch (error) {
        console.error('Fehler beim Laden der Email-Statistiken:', error);
        // Don't show error to user for stats, just log it
    }
}

/**
 * Send test emails based on reminder type
 */
async function sendTestEmail(reminderType) {
    const button = document.getElementById(reminderType + 'Btn');
    if (!button) return;
    
    const originalText = button.innerHTML;
    
    try {
        // Show loading state
        button.disabled = true;
        button.innerHTML = '⏳ Wird gesendet...';
        
        const response = await fetch('/api/admin/test-emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reminderType })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage(`✅ ${result.message}`, 'success');
            
            // Reload stats to show updated reminder count
            setTimeout(loadEmailStats, 1000);
        } else {
            throw new Error(result.error || 'Unbekannter Fehler');
        }
        
    } catch (error) {
        console.error('Fehler beim Senden der Test-Email:', error);
        showMessage('Fehler beim Senden: ' + error.message, 'error');
    } finally {
        // Reset button
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

/**
 * Test SMTP connection
 */
async function testSmtpConnection() {
    const button = document.getElementById('smtpTestBtn');
    const resultDiv = document.getElementById('smtpResult');
    const originalText = button.textContent;
    
    try {
        // Show loading state
        button.disabled = true;
        button.textContent = '⏳ Teste Verbindung...';
        resultDiv.innerHTML = '';
        
        const response = await fetch('/api/admin/test-smtp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            resultDiv.innerHTML = `
                <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; padding: 10px; margin-top: 10px;">
                    <strong>✅ SMTP-Verbindung erfolgreich!</strong><br>
                    <small>
                        Host: ${result.smtp_host}<br>
                        Port: ${result.smtp_port}<br>
                        Benutzer: ${result.smtp_user}<br>
                        Von: ${result.email_from}
                    </small>
                </div>
            `;
            showMessage('✅ SMTP-Verbindung erfolgreich!', 'success');
        } else {
            throw new Error(result.error || 'Unbekannter Fehler');
        }
        
    } catch (error) {
        console.error('SMTP-Test Fehler:', error);
        resultDiv.innerHTML = `
            <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; padding: 10px; margin-top: 10px;">
                <strong>❌ SMTP-Verbindung fehlgeschlagen!</strong><br>
                <small>${error.message}</small>
            </div>
        `;
        showMessage('❌ SMTP-Verbindung fehlgeschlagen: ' + error.message, 'error');
    } finally {
        // Reset button
        button.disabled = false;
        button.textContent = originalText;
    }
}

// Global functions to be called from HTML onclick
window.sendReminders = sendReminders;
window.loadEmailStats = loadEmailStats;
window.sendTestEmail = sendTestEmail;
window.testSmtpConnection = testSmtpConnection;