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
            
            populatePatientSelectors();
        }
    } catch (error) {
        console.error('Error loading patients:', error);
        showValidationMessage('Error loading patient data', 'error');
    }
}

// Populate patient dropdowns
function populatePatientSelectors() {
    const sourcePatientSelect = document.getElementById('sourcePatient');
    const targetPatientSelect = document.getElementById('targetPatient');
    
    sourcePatientSelect.innerHTML = '<option value="">-- Select Patient --</option>';
    targetPatientSelect.innerHTML = '<option value="">-- Select Patient --</option>';
    
    allPatients.forEach(patient => {
        const option1 = createOption(patient.id, patient.name);
        const option2 = createOption(patient.id, patient.name);
        
        sourcePatientSelect.appendChild(option1);
        targetPatientSelect.appendChild(option2);
    });
}

// Handle patient selection change
function onSourcePatientChange(patientId) {
    const dataTypeSelect = document.getElementById('sourceDataType');
    const modelSelect = document.getElementById('sourceModel');
    
    dataTypeSelect.innerHTML = '<option value="">-- Select Data Type --</option>';
    modelSelect.innerHTML = '<option value="">-- Select Model --</option>';
    dataTypeSelect.disabled = !patientId;
    modelSelect.disabled = true;
    
    if (!patientId) return;
    
    const patientData = currentPatientData[patientId];
    if (!patientData) return;
    
    // Add available data types
    const dataTypes = ['Face scans', 'Intraoral scans', 'Pre-Op CBCT'];
    dataTypes.forEach(dataType => {
        if (patientData[dataType] && patientData[dataType].length > 0) {
            const option = createOption(dataType, dataType);
            dataTypeSelect.appendChild(option);
        }
    });
}

function onTargetPatientChange(patientId) {
    const dataTypeSelect = document.getElementById('targetDataType');
    const modelSelect = document.getElementById('targetModel');
    
    dataTypeSelect.innerHTML = '<option value="">-- Select Data Type --</option>';
    modelSelect.innerHTML = '<option value="">-- Select Model --</option>';
    dataTypeSelect.disabled = !patientId;
    modelSelect.disabled = true;
    
    if (!patientId) return;
    
    const patientData = currentPatientData[patientId];
    if (!patientData) return;
    
    // Add available data types
    const dataTypes = ['Face scans', 'Intraoral scans', 'Pre-Op CBCT'];
    dataTypes.forEach(dataType => {
        if (patientData[dataType] && patientData[dataType].length > 0) {
            const option = createOption(dataType, dataType);
            dataTypeSelect.appendChild(option);
        }
    });
}

// Handle data type selection change
function onSourceDataTypeChange(dataType) {
    const patientId = document.getElementById('sourcePatient').value;
    const modelSelect = document.getElementById('sourceModel');
    
    modelSelect.innerHTML = '<option value="">-- Select Model --</option>';
    modelSelect.disabled = !dataType;
    
    if (!dataType || !patientId) return;
    
    const patientData = currentPatientData[patientId];
    if (!patientData || !patientData[dataType]) return;
    
    // Add available models
    patientData[dataType].forEach(file => {
        const optionValue = JSON.stringify({
            patient_id: patientId,
            data_type: dataType,
            file_path: file.path,
            file_type: file.type,
            file_name: file.name
        });
        
        const option = createOption(optionValue, file.name);
        modelSelect.appendChild(option);
    });
}

function onTargetDataTypeChange(dataType) {
    const patientId = document.getElementById('targetPatient').value;
    const modelSelect = document.getElementById('targetModel');
    
    modelSelect.innerHTML = '<option value="">-- Select Model --</option>';
    modelSelect.disabled = !dataType;
    
    if (!dataType || !patientId) return;
    
    const patientData = currentPatientData[patientId];
    if (!patientData || !patientData[dataType]) return;
    
    // Add available models
    patientData[dataType].forEach(file => {
        const optionValue = JSON.stringify({
            patient_id: patientId,
            data_type: dataType,
            file_path: file.path,
            file_type: file.type,
            file_name: file.name
        });
        
        const option = createOption(optionValue, file.name);
        modelSelect.appendChild(option);
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
    const sourcePatientSelect = document.getElementById('sourcePatient');
    const sourceDataTypeSelect = document.getElementById('sourceDataType');
    const sourceModelSelect = document.getElementById('sourceModel');
    
    const targetPatientSelect = document.getElementById('targetPatient');
    const targetDataTypeSelect = document.getElementById('targetDataType');
    const targetModelSelect = document.getElementById('targetModel');
    
    const swapBtn = document.getElementById('swapModelsBtn');
    const proceedBtn = document.getElementById('proceedBtn');
    const continueRegBtn = document.getElementById('continueRegBtn');
    
    // Source dropdowns
    sourcePatientSelect.addEventListener('change', (e) => {
        onSourcePatientChange(e.target.value);
    });
    
    sourceDataTypeSelect.addEventListener('change', (e) => {
        onSourceDataTypeChange(e.target.value);
    });
    
    sourceModelSelect.addEventListener('change', (e) => {
        selectedSource = e.target.value ? JSON.parse(e.target.value) : null;
        validateSelection();
    });
    
    // Target dropdowns
    targetPatientSelect.addEventListener('change', (e) => {
        onTargetPatientChange(e.target.value);
    });
    
    targetDataTypeSelect.addEventListener('change', (e) => {
        onTargetDataTypeChange(e.target.value);
    });
    
    targetModelSelect.addEventListener('change', (e) => {
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
    const sourcePatient = document.getElementById('sourcePatient');
    const sourceDataType = document.getElementById('sourceDataType');
    const sourceModel = document.getElementById('sourceModel');
    
    const targetPatient = document.getElementById('targetPatient');
    const targetDataType = document.getElementById('targetDataType');
    const targetModel = document.getElementById('targetModel');
    
    // Swap patient
    const tempPatient = sourcePatient.value;
    sourcePatient.value = targetPatient.value;
    targetPatient.value = tempPatient;
    
    // Refresh data types
    onSourcePatientChange(sourcePatient.value);
    onTargetPatientChange(targetPatient.value);
    
    // Small delay to let data types populate
    setTimeout(() => {
        // Swap data type
        const tempDataType = sourceDataType.value;
        sourceDataType.value = targetDataType.value;
        targetDataType.value = tempDataType;
        
        // Refresh models
        onSourceDataTypeChange(sourceDataType.value);
        onTargetDataTypeChange(targetDataType.value);
        
        // Small delay to let models populate
        setTimeout(() => {
            // Swap model
            const tempModel = sourceModel.value;
            sourceModel.value = targetModel.value;
            targetModel.value = tempModel;
            
            selectedSource = sourceModel.value ? JSON.parse(sourceModel.value) : null;
            selectedTarget = targetModel.value ? JSON.parse(targetModel.value) : null;
            
            validateSelection();
        }, 50);
    }, 50);
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
