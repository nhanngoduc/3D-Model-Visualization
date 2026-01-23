// Registration Controller
// Handles REG-01: Select Source and Target Models
// Implements all UI interactions for Story Group 1

const API_BASE = 'http://localhost:5000/api';

let registrationViewer = null;
let allPatients = [];
let currentPatientData = {};
let selectedSource = null;
let selectedTarget = null;

// Initialize
async function initRegistration() {
    console.log('Initializing Registration module...');
    
    await loadAllPatients();
    setupEventListeners();
}

// Load all patients and their data
async function loadAllPatients() {
    try {
        const response = await fetch(`${API_BASE}/patients`);
        const data = await response.json();
        
        if (data.patients) {
            allPatients = data.patients;
            
            // Load data for each patient
            for (const patient of allPatients) {
                const dataResponse = await fetch(`${API_BASE}/patient/${patient.id}/data`);
                const patientData = await dataResponse.json();
                currentPatientData[patient.id] = patientData.data;
            }
            
            populateModelSelectors();
        }
    } catch (error) {
        console.error('Error loading patients:', error);
        showValidationMessage('Error loading patient data', 'error');
    }
}

// Populate source and target dropdown menus
function populateModelSelectors() {
    const sourceSelect = document.getElementById('sourceModel');
    const targetSelect = document.getElementById('targetModel');
    
    sourceSelect.innerHTML = '<option value="">-- Select Source Model --</option>';
    targetSelect.innerHTML = '<option value="">-- Select Target Model --</option>';
    
    // Generate options for each patient's models
    allPatients.forEach(patient => {
        const patientData = currentPatientData[patient.id];
        
        if (patientData) {
            // Add Face scans
            if (patientData['Face scans']) {
                patientData['Face scans'].forEach(file => {
                    const optionValue = JSON.stringify({
                        patient_id: patient.id,
                        data_type: 'Face scans',
                        file_path: file.path,
                        file_type: file.type,
                        file_name: file.name
                    });
                    
                    const optionText = `${patient.name} - Face Scan - ${file.name}`;
                    
                    sourceSelect.appendChild(createOption(optionValue, optionText));
                    targetSelect.appendChild(createOption(optionValue, optionText));
                });
            }
            
            // Add Intraoral scans
            if (patientData['Intraoral scans']) {
                patientData['Intraoral scans'].forEach(file => {
                    const optionValue = JSON.stringify({
                        patient_id: patient.id,
                        data_type: 'Intraoral scans',
                        file_path: file.path,
                        file_type: file.type,
                        file_name: file.name
                    });
                    
                    const optionText = `${patient.name} - Intraoral - ${file.name}`;
                    
                    sourceSelect.appendChild(createOption(optionValue, optionText));
                    targetSelect.appendChild(createOption(optionValue, optionText));
                });
            }
            
            // Note: CBCT will be handled as series later in REG-05
        }
    });
}

function createOption(value, text) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    return option;
}

// Setup event listeners
function setupEventListeners() {
    const sourceSelect = document.getElementById('sourceModel');
    const targetSelect = document.getElementById('targetModel');
    const swapBtn = document.getElementById('swapModelsBtn');
    const proceedBtn = document.getElementById('proceedBtn');
    const continueRegBtn = document.getElementById('continueRegBtn');
    
    // REG-01.4: Validate on selection change
    sourceSelect.addEventListener('change', (e) => {
        selectedSource = e.target.value ? JSON.parse(e.target.value) : null;
        validateSelection();
    });
    
    targetSelect.addEventListener('change', (e) => {
        selectedTarget = e.target.value ? JSON.parse(e.target.value) : null;
        validateSelection();
    });
    
    // REG-01.3: Swap source and target
    swapBtn.addEventListener('click', swapModels);
    
    // Proceed to viewer
    proceedBtn.addEventListener('click', proceedToViewer);
    
    // Continue registration (next story group)
    continueRegBtn.addEventListener('click', () => {
        alert('Next: REG-03 (Registration Type Detection)\nStory Group 2 coming soon...');
    });
    
    // REG-02: Viewer controls
    document.getElementById('toggleSource').addEventListener('change', (e) => {
        if (registrationViewer) {
            registrationViewer.toggleSourceVisibility(e.target.checked);
        }
    });
    
    document.getElementById('toggleTarget').addEventListener('change', (e) => {
        if (registrationViewer) {
            registrationViewer.toggleTargetVisibility(e.target.checked);
        }
    });
    
    document.getElementById('sourceOpacity').addEventListener('input', (e) => {
        if (registrationViewer) {
            registrationViewer.setSourceOpacity(e.target.value);
            document.getElementById('sourceOpacityValue').textContent = e.target.value + '%';
        }
    });
    
    document.getElementById('targetOpacity').addEventListener('input', (e) => {
        if (registrationViewer) {
            registrationViewer.setTargetOpacity(e.target.value);
            document.getElementById('targetOpacityValue').textContent = e.target.value + '%';
        }
    });
    
    document.getElementById('cameraPreset').addEventListener('change', (e) => {
        if (registrationViewer) {
            registrationViewer.applyPreset(e.target.value);
        }
    });
}

// REG-01.4: Validate source ≠ target
function validateSelection() {
    const sourceSelect = document.getElementById('sourceModel');
    const targetSelect = document.getElementById('targetModel');
    const proceedBtn = document.getElementById('proceedBtn');
    const directionIndicator = document.getElementById('directionIndicator');
    const validationMessage = document.getElementById('validationMessage');
    
    proceedBtn.disabled = true;
    directionIndicator.style.display = 'none';
    validationMessage.style.display = 'none';
    
    if (!selectedSource || !selectedTarget) {
        showValidationMessage('Please select both Source and Target models', 'warning');
        return;
    }
    
    // Check if source === target
    if (selectedSource.file_path === selectedTarget.file_path) {
        showValidationMessage('Source and Target must be different models', 'error');
        return;
    }
    
    // Valid selection
    directionIndicator.style.display = 'flex';
    proceedBtn.disabled = false;
    validationMessage.style.display = 'none';
}

function showValidationMessage(message, type) {
    const validationMessage = document.getElementById('validationMessage');
    validationMessage.textContent = message;
    validationMessage.className = `validation-message validation-${type}`;
    validationMessage.style.display = 'block';
}

// REG-01.3: Swap source and target
function swapModels() {
    const sourceSelect = document.getElementById('sourceModel');
    const targetSelect = document.getElementById('targetModel');
    
    const temp = sourceSelect.value;
    sourceSelect.value = targetSelect.value;
    targetSelect.value = temp;
    
    selectedSource = sourceSelect.value ? JSON.parse(sourceSelect.value) : null;
    selectedTarget = targetSelect.value ? JSON.parse(targetSelect.value) : null;
    
    validateSelection();
}

// REG-01.6 & REG-02: Load models into overlay viewer
async function proceedToViewer() {
    try {
        // Show loading indicator
        document.getElementById('loadingIndicator').style.display = 'flex';
        document.getElementById('selectionView').style.display = 'none';
        document.getElementById('viewerContainer').style.display = 'none';
        
        // Initialize overlay viewer if not already done
        if (!registrationViewer) {
            registrationViewer = new RegistrationViewer('registrationViewer');
        }
        
        // Construct file URLs
        const sourceUrl = `${API_BASE}/file/${selectedSource.file_path}`;
        const targetUrl = `${API_BASE}/file/${selectedTarget.file_path}`;
        
        // Load models
        await registrationViewer.loadSourceAndTarget(
            sourceUrl,
            targetUrl,
            selectedSource.file_type,
            selectedTarget.file_type
        );
        
        // Hide loading, show viewer and controls
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('viewerContainer').style.display = 'block';
        document.getElementById('viewerControlsPanel').style.display = 'block';
        
        // Trigger resize to ensure canvas is properly sized
        window.dispatchEvent(new Event('resize'));
        
        console.log('Models loaded successfully!');
        
    } catch (error) {
        console.error('Error loading models:', error);
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('selectionView').style.display = 'flex';
        showValidationMessage('Error loading models: ' + error.message, 'error');
    }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', initRegistration);
