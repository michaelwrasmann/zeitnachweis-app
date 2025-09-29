// Upload JavaScript für Zeitnachweis-App
document.addEventListener('DOMContentLoaded', function() {
    // Initialize upload page
    loadEmployeeList();
    setupUploadForm();
    checkUploadPeriod();
});

/**
 * Load employee list for dropdown
 */
async function loadEmployeeList() {
    try {
        const response = await fetch('/api/employees');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const employees = await response.json();
        populateEmployeeDropdown(employees);
        
    } catch (error) {
        console.error('Fehler beim Laden der Mitarbeiterliste:', error);
        showMessage('Fehler beim Laden der Mitarbeiterliste.', 'error');
    }
}

/**
 * Populate the employee dropdown with data
 */
function populateEmployeeDropdown(employees) {
    const employeeSelect = document.getElementById('employeeSelect');
    
    if (!employeeSelect) {
        console.error('Employee select element not found');
        return;
    }
    
    // Clear existing options except the placeholder
    employeeSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    
    // Add active employees to dropdown
    const activeEmployees = employees.filter(emp => emp.active);
    
    activeEmployees.forEach(employee => {
        const option = document.createElement('option');
        option.value = employee.id;
        option.textContent = `${employee.name} (${employee.email})`;
        employeeSelect.appendChild(option);
    });
    
    // Show message if no active employees
    if (activeEmployees.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Keine aktiven Mitarbeiter verfügbar';
        option.disabled = true;
        employeeSelect.appendChild(option);
    }
}

/**
 * Setup upload form event handlers
 */
function setupUploadForm() {
    const uploadForm = document.getElementById('uploadForm');
    const fileInput = document.getElementById('fileInput');
    
    if (!uploadForm) {
        console.error('Upload form not found');
        return;
    }
    
    // Handle form submission
    uploadForm.addEventListener('submit', handleUpload);
    
    // Handle file input change
    if (fileInput) {
        fileInput.addEventListener('change', handleFileChange);
    }
}

/**
 * Handle file input change event
 */
function handleFileChange(event) {
    const file = event.target.files[0];
    const fileInfo = document.querySelector('.file-info');
    
    if (!file) return;
    
    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > maxSize) {
        showMessage('Datei ist zu groß. Maximale Dateigröße: 10MB', 'error');
        event.target.value = '';
        return;
    }
    
    // Validate file type
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpg', 'image/jpeg'];
    if (!allowedTypes.includes(file.type)) {
        showMessage('Ungültiger Dateityp. Erlaubt sind: PDF, PNG, JPG, JPEG', 'error');
        event.target.value = '';
        return;
    }
    
    // Update file info display
    if (fileInfo) {
        const fileSize = (file.size / (1024 * 1024)).toFixed(2);
        fileInfo.innerHTML = `
            <strong>Ausgewählte Datei:</strong> ${escapeHtml(file.name)}<br>
            <strong>Größe:</strong> ${fileSize} MB<br>
            <strong>Typ:</strong> ${file.type}
        `;
    }
}

/**
 * Handle upload form submission
 */
async function handleUpload(event) {
    event.preventDefault();
    
    const employeeSelect = document.getElementById('employeeSelect');
    const fileInput = document.getElementById('fileInput');
    const submitButton = event.target.querySelector('button[type="submit"]');
    
    // Validate form inputs
    if (!employeeSelect || !employeeSelect.value) {
        showMessage('Bitte wählen Sie einen Mitarbeiter aus.', 'error');
        return;
    }
    
    if (!fileInput || !fileInput.files[0]) {
        showMessage('Bitte wählen Sie eine Datei aus.', 'error');
        return;
    }
    
    // Check upload period before proceeding
    const canUpload = await checkUploadPeriod();
    if (!canUpload) {
        return;
    }
    
    // Show loading state
    const originalButtonText = submitButton.textContent;
    submitButton.textContent = 'Wird hochgeladen...';
    submitButton.disabled = true;
    
    try {
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('zeitnachweis', fileInput.files[0]);
        formData.append('employeeId', employeeSelect.value);
        
        // Upload file
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage('Zeitnachweis erfolgreich hochgeladen!', 'success');
            
            // Reset form
            event.target.reset();
            
            // Reset file info display
            const fileInfo = document.querySelector('.file-info');
            if (fileInfo) {
                fileInfo.textContent = 'Max. Dateigröße: 10MB';
            }
            
        } else {
            throw new Error(result.error || 'Upload fehlgeschlagen');
        }
        
    } catch (error) {
        console.error('Upload error:', error);
        showMessage(error.message || 'Fehler beim Hochladen der Datei.', 'error');
    } finally {
        // Reset button state
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;
    }
}

/**
 * Check if upload period is currently open
 */
async function checkUploadPeriod() {
    try {
        // Test upload period by attempting a test request
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ test: true })
        });
        
        if (response.status === 403) {
            const result = await response.json();
            showMessage(result.error || 'Upload-Zeitraum ist geschlossen.', 'warning');
            disableUploadForm();
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.error('Fehler beim Prüfen des Upload-Zeitraums:', error);
        return true; // Allow upload attempt if check fails
    }
}

/**
 * Disable upload form when upload period is closed
 */
function disableUploadForm() {
    const uploadForm = document.getElementById('uploadForm');
    const employeeSelect = document.getElementById('employeeSelect');
    const fileInput = document.getElementById('fileInput');
    const submitButton = uploadForm ? uploadForm.querySelector('button[type="submit"]') : null;
    
    if (employeeSelect) employeeSelect.disabled = true;
    if (fileInput) fileInput.disabled = true;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = '❌ Upload geschlossen';
    }
    
    // Add visual indicator
    if (uploadForm) {
        uploadForm.classList.add('disabled');
    }
}

/**
 * Show success/error messages
 */
function showMessage(message, type = 'info') {
    const statusContainer = document.getElementById('uploadStatus');
    
    if (!statusContainer) {
        console.error('Upload status container not found');
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
 * Get current upload period info for display
 */
function getUploadPeriodInfo() {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Calculate the first 5 working days of the month
    let workingDaysCount = 0;
    let checkDate = new Date(currentYear, currentMonth, 1);
    let lastWorkingDay = null;
    
    while (workingDaysCount < 5) {
        const dayOfWeek = checkDate.getDay();
        if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Monday to Friday
            workingDaysCount++;
            lastWorkingDay = new Date(checkDate);
        }
        checkDate.setDate(checkDate.getDate() + 1);
        
        if (checkDate.getMonth() !== currentMonth) {
            break;
        }
    }
    
    return {
        isOpen: today <= lastWorkingDay,
        endDate: lastWorkingDay
    };
}

/**
 * Update upload period information display
 */
function updateUploadPeriodInfo() {
    const periodInfo = getUploadPeriodInfo();
    const infoBox = document.querySelector('.info-box ul');
    
    if (infoBox) {
        const firstLi = infoBox.querySelector('li');
        if (firstLi) {
            const endDateStr = periodInfo.endDate ? 
                periodInfo.endDate.toLocaleDateString('de-DE') : 'unbekannt';
            
            firstLi.innerHTML = `Uploads sind nur in den ersten 5 Werktagen des Monats möglich (bis ${endDateStr})`;
            
            if (!periodInfo.isOpen) {
                firstLi.style.color = '#e74c3c';
                firstLi.style.fontWeight = 'bold';
            }
        }
    }
}

// Initialize upload period info on load
document.addEventListener('DOMContentLoaded', function() {
    updateUploadPeriodInfo();
});

// Add drag and drop functionality
function setupDragAndDrop() {
    const fileInput = document.getElementById('fileInput');
    const uploadForm = document.getElementById('uploadForm');
    
    if (!fileInput || !uploadForm) return;
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadForm.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Highlight drop area when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadForm.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadForm.addEventListener(eventName, unhighlight, false);
    });
    
    // Handle dropped files
    uploadForm.addEventListener('drop', handleDrop, false);
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function highlight(e) {
        uploadForm.classList.add('drag-over');
    }
    
    function unhighlight(e) {
        uploadForm.classList.remove('drag-over');
    }
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            fileInput.files = files;
            handleFileChange({ target: fileInput });
        }
    }
}

// Initialize drag and drop
document.addEventListener('DOMContentLoaded', setupDragAndDrop);