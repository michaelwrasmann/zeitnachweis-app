// Dashboard JavaScript für Zeitnachweis-App
document.addEventListener('DOMContentLoaded', function() {
    // Initialize dashboard on load
    loadEmployeeStatus();
    updateCurrentMonth();
    
    // Set up auto-refresh every 30 seconds
    setInterval(loadEmployeeStatus, 30000);
});

/**
 * Load and display employee status from API
 */
async function loadEmployeeStatus() {
    try {
        const response = await fetch('/api/employees/status');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const employees = await response.json();
        
        // Update statistics
        updateStatistics(employees);
        
        // Update employee grid
        updateEmployeeGrid(employees);
        
    } catch (error) {
        console.error('Fehler beim Laden der Mitarbeiterdaten:', error);
        showError('Fehler beim Laden der Mitarbeiterdaten. Bitte versuchen Sie es später erneut.');
    }
}

/**
 * Update statistics cards with employee data
 */
function updateStatistics(employees) {
    const totalEmployees = employees.length;
    const uploadedEmployees = employees.filter(emp => emp.uploaded).length;
    const pendingEmployees = totalEmployees - uploadedEmployees;
    const progressPercent = totalEmployees > 0 ? Math.round((uploadedEmployees / totalEmployees) * 100) : 0;
    
    // Update DOM elements
    const totalElement = document.getElementById('totalEmployees');
    const uploadedElement = document.getElementById('uploadedCount');
    const pendingElement = document.getElementById('pendingCount');
    const progressBarElement = document.getElementById('progressBar');
    const progressPercentElement = document.getElementById('progressPercent');
    
    if (totalElement) totalElement.textContent = totalEmployees;
    if (uploadedElement) uploadedElement.textContent = uploadedEmployees;
    if (pendingElement) pendingElement.textContent = pendingEmployees;
    if (progressPercentElement) progressPercentElement.textContent = `${progressPercent}%`;
    
    // Update progress bar
    if (progressBarElement) {
        progressBarElement.style.width = `${progressPercent}%`;
        
        // Add visual feedback for progress levels
        progressBarElement.classList.remove('low-progress', 'medium-progress', 'high-progress');
        if (progressPercent < 30) {
            progressBarElement.classList.add('low-progress');
        } else if (progressPercent < 70) {
            progressBarElement.classList.add('medium-progress');
        } else {
            progressBarElement.classList.add('high-progress');
        }
    }
}

/**
 * Update the employee grid with current status
 */
function updateEmployeeGrid(employees) {
    const employeeGrid = document.getElementById('employeeGrid');
    
    if (!employeeGrid) {
        console.error('Employee grid element not found');
        return;
    }
    
    // Clear existing content
    employeeGrid.innerHTML = '';
    
    // Create employee cards
    employees.forEach(employee => {
        const employeeCard = createEmployeeCard(employee);
        employeeGrid.appendChild(employeeCard);
    });
    
    // Show message if no employees
    if (employees.length === 0) {
        employeeGrid.innerHTML = '<div class="no-employees">Keine aktiven Mitarbeiter gefunden</div>';
    }
}

/**
 * Create an individual employee card element
 */
function createEmployeeCard(employee) {
    const card = document.createElement('div');
    card.className = `employee-card ${employee.uploaded ? 'uploaded' : 'pending'}`;
    
    // Format upload date if available
    let uploadInfo = '';
    if (employee.uploaded && employee.upload_date) {
        const uploadDate = new Date(employee.upload_date);
        const formattedDate = uploadDate.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        uploadInfo = `
            <div class="upload-info">
                <small>Hochgeladen: ${formattedDate}</small>
            </div>
        `;
    }
    
    card.innerHTML = `
        <div class="employee-header">
            <div class="employee-name">${escapeHtml(employee.name)}</div>
            <div class="status-indicator ${employee.uploaded ? 'uploaded' : 'pending'}"></div>
        </div>
        <div class="employee-email">${escapeHtml(employee.email)}</div>
        ${uploadInfo}
        <div class="employee-status">
            <span class="status-text ${employee.uploaded ? 'uploaded-text' : 'pending-text'}">
                ${employee.uploaded ? 'Hochgeladen' : 'Ausstehend'}
            </span>
        </div>
    `;
    
    return card;
}

/**
 * Update current month display
 */
function updateCurrentMonth() {
    const currentMonthElement = document.getElementById('currentMonth');
    
    if (currentMonthElement) {
        const now = new Date();
        const monthNames = [
            'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
            'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
        ];
        
        const monthYear = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
        currentMonthElement.textContent = monthYear;
    }
}

/**
 * Show error message to user
 */
function showError(message) {
    // Create or update error message container
    let errorContainer = document.querySelector('.error-message');
    
    if (!errorContainer) {
        errorContainer = document.createElement('div');
        errorContainer.className = 'error-message alert alert-error';
        
        // Insert at the beginning of main content
        const container = document.querySelector('.container');
        if (container) {
            container.insertBefore(errorContainer, container.firstChild);
        }
    }
    
    errorContainer.innerHTML = `
        <span class="error-icon">⚠️</span>
        <span class="error-text">${escapeHtml(message)}</span>
        <button class="error-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
        if (errorContainer && errorContainer.parentElement) {
            errorContainer.remove();
        }
    }, 10000);
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
 * Show loading state
 */
function showLoading() {
    const employeeGrid = document.getElementById('employeeGrid');
    if (employeeGrid) {
        employeeGrid.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <div class="loading-text">Mitarbeiterdaten werden geladen...</div>
            </div>
        `;
    }
}

// Add some utility functions for better user experience

/**
 * Refresh dashboard data manually
 */
function refreshDashboard() {
    showLoading();
    loadEmployeeStatus();
}

// Add refresh button functionality if it exists
document.addEventListener('DOMContentLoaded', function() {
    const refreshButton = document.getElementById('refreshButton');
    if (refreshButton) {
        refreshButton.addEventListener('click', refreshDashboard);
    }
});

// Add keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // F5 or Ctrl+R to refresh
    if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
        e.preventDefault();
        refreshDashboard();
    }
});

// Visual feedback for real-time updates
let lastUpdateTime = null;

function showUpdateIndicator() {
    // Create or update the last update indicator
    let indicator = document.getElementById('lastUpdateIndicator');
    
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'lastUpdateIndicator';
        indicator.className = 'update-indicator';
        
        const header = document.querySelector('.header');
        if (header) {
            header.appendChild(indicator);
        }
    }
    
    const now = new Date();
    lastUpdateTime = now;
    
    indicator.textContent = `Letzte Aktualisierung: ${now.toLocaleTimeString('de-DE')}`;
    
    // Add visual feedback
    indicator.classList.add('updated');
    setTimeout(() => {
        indicator.classList.remove('updated');
    }, 2000);
}

// Update the loadEmployeeStatus function to show update indicator
const originalLoadEmployeeStatus = loadEmployeeStatus;
loadEmployeeStatus = async function() {
    await originalLoadEmployeeStatus();
    showUpdateIndicator();
};