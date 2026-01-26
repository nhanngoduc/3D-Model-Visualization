// Registration Controller
// Handles REG-01: Select Source and Target Models
// Implements all UI interactions for Story Group 1

const API_BASE = 'http://localhost:5000/api';

let registrationViewer = null;
let splitViewViewer = null;
let dicomViewer = null;
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
        if (splitViewViewer) splitViewViewer.toggleSourceVisibility(e.target.checked);
        if (registrationViewer) registrationViewer.toggleSourceVisibility(e.target.checked);
    });
    
    document.getElementById('toggleTarget').addEventListener('change', (e) => {
        if (splitViewViewer) splitViewViewer.toggleTargetVisibility(e.target.checked);
        if (registrationViewer) registrationViewer.toggleTargetVisibility(e.target.checked);
    });
    
    document.getElementById('sourceOpacity').addEventListener('input', (e) => {
        if (splitViewViewer) splitViewViewer.setSourceOpacity(e.target.value);
        if (registrationViewer) registrationViewer.setSourceOpacity(e.target.value);
        document.getElementById('sourceOpacityValue').textContent = e.target.value + '%';
    });
    
    document.getElementById('targetOpacity').addEventListener('input', (e) => {
        if (splitViewViewer) splitViewViewer.setTargetOpacity(e.target.value);
        if (registrationViewer) registrationViewer.setTargetOpacity(e.target.value);
        document.getElementById('targetOpacityValue').textContent = e.target.value + '%';
    });
    
    document.getElementById('cameraPreset').addEventListener('change', (e) => {
        if (splitViewViewer) {
            splitViewViewer.applyPreset(e.target.value);
        }
        if (registrationViewer) {
            registrationViewer.applyPreset(e.target.value);
        }
    });

    // Setup rotation controls
    setupRotationControls();
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
        const loadingInd = document.getElementById('loadingIndicator');
        const selectionView = document.getElementById('selectionView');
        const viewerContainer = document.getElementById('viewerContainer');
        const splitViewCont = document.getElementById('splitViewContainer');
        const dicomViewerCont = document.getElementById('dicomViewerContainer');
        
        if (loadingInd) loadingInd.style.display = 'flex';
        if (selectionView) selectionView.style.display = 'none';
        if (viewerContainer) viewerContainer.style.display = 'none';
        if (splitViewCont) splitViewCont.style.display = 'none';
        if (dicomViewerCont) dicomViewerCont.style.display = 'none';
        
        // Check if source or target is DICOM
        const sourceIsDicom = selectedSource && selectedSource.file_type === 'dcm';
        const targetIsDicom = selectedTarget && selectedTarget.file_type === 'dcm';
        
        // If either is DICOM, use DICOM viewer approach
        if (sourceIsDicom || targetIsDicom) {
            await loadDicomViewer(sourceIsDicom, targetIsDicom);
        } else {
            // Both are 3D models, use split view viewer
            await load3DViewer();
        }
        
        console.log('Models loaded successfully!');
        
    } catch (error) {
        console.error('Error loading models:', error);
        
        const loadingInd = document.getElementById('loadingIndicator');
        const selectionView = document.getElementById('selectionView');
        
        if (loadingInd) loadingInd.style.display = 'none';
        if (selectionView) selectionView.style.display = 'flex';
        
        showValidationMessage('Error loading models: ' + error.message, 'error');
    }
}

// Setup rotation controls for models
function setupRotationControls() {
    const rotationAmount = 5; // degrees per click
    
    // Keyboard shortcuts to select model (1 for Source, 2 for Target)
    document.addEventListener('keydown', (e) => {
        if (!registrationViewer) return;
        
        if (e.key === '1') {
            registrationViewer.setSelectedModel('source');
            console.log('Selected Source Model for rotation');
        } else if (e.key === '2') {
            registrationViewer.setSelectedModel('target');
            console.log('Selected Target Model for rotation');
        } else if (e.key === '0') {
            registrationViewer.setSelectedModel(null);
            console.log('Deselected model - Camera mode');
        }
    });
    
    // Source Model Rotation
    document.getElementById('sourceRotateXPos')?.addEventListener('click', () => {
        if (splitViewViewer) splitViewViewer.rotateSourceModel('x', rotationAmount);
        if (registrationViewer) registrationViewer.rotateSourceModel('x', rotationAmount);
    });
    document.getElementById('sourceRotateXNeg')?.addEventListener('click', () => {
        if (splitViewViewer) splitViewViewer.rotateSourceModel('x', -rotationAmount);
        if (registrationViewer) registrationViewer.rotateSourceModel('x', -rotationAmount);
    });
    document.getElementById('sourceRotateYPos')?.addEventListener('click', () => {
        if (splitViewViewer) splitViewViewer.rotateSourceModel('y', rotationAmount);
        if (registrationViewer) registrationViewer.rotateSourceModel('y', rotationAmount);
    });
    document.getElementById('sourceRotateYNeg')?.addEventListener('click', () => {
        if (splitViewViewer) splitViewViewer.rotateSourceModel('y', -rotationAmount);
        if (registrationViewer) registrationViewer.rotateSourceModel('y', -rotationAmount);
    });
    document.getElementById('sourceRotateZPos')?.addEventListener('click', () => {
        if (splitViewViewer) splitViewViewer.rotateSourceModel('z', rotationAmount);
        if (registrationViewer) registrationViewer.rotateSourceModel('z', rotationAmount);
    });
    document.getElementById('sourceRotateZNeg')?.addEventListener('click', () => {
        if (splitViewViewer) splitViewViewer.rotateSourceModel('z', -rotationAmount);
        if (registrationViewer) registrationViewer.rotateSourceModel('z', -rotationAmount);
    });
    document.getElementById('sourceResetRotation')?.addEventListener('click', () => {
        if (splitViewViewer) splitViewViewer.resetSourceRotation();
        if (registrationViewer) registrationViewer.resetSourceRotation();
    });

    // Target Model Rotation
    document.getElementById('targetRotateXPos')?.addEventListener('click', () => {
        if (splitViewViewer) splitViewViewer.rotateTargetModel('x', rotationAmount);
        if (registrationViewer) registrationViewer.rotateTargetModel('x', rotationAmount);
    });
    document.getElementById('targetRotateXNeg')?.addEventListener('click', () => {
        if (splitViewViewer) splitViewViewer.rotateTargetModel('x', -rotationAmount);
        if (registrationViewer) registrationViewer.rotateTargetModel('x', -rotationAmount);
    });
    document.getElementById('targetRotateYPos')?.addEventListener('click', () => {
        if (splitViewViewer) splitViewViewer.rotateTargetModel('y', rotationAmount);
        if (registrationViewer) registrationViewer.rotateTargetModel('y', rotationAmount);
    });
    document.getElementById('targetRotateYNeg')?.addEventListener('click', () => {
        if (splitViewViewer) splitViewViewer.rotateTargetModel('y', -rotationAmount);
        if (registrationViewer) registrationViewer.rotateTargetModel('y', -rotationAmount);
    });
    document.getElementById('targetRotateZPos')?.addEventListener('click', () => {
        if (splitViewViewer) splitViewViewer.rotateTargetModel('z', rotationAmount);
        if (registrationViewer) registrationViewer.rotateTargetModel('z', rotationAmount);
    });
    document.getElementById('targetRotateZNeg')?.addEventListener('click', () => {
        if (splitViewViewer) splitViewViewer.rotateTargetModel('z', -rotationAmount);
        if (registrationViewer) registrationViewer.rotateTargetModel('z', -rotationAmount);
    });
    document.getElementById('targetResetRotation')?.addEventListener('click', () => {
        if (splitViewViewer) splitViewViewer.resetTargetRotation();
        if (registrationViewer) registrationViewer.resetTargetRotation();
    });
}

// Load 3D registration viewer (split view)
async function load3DViewer() {
    try {
        // Validate selections
        if (!selectedSource || !selectedTarget) {
            throw new Error('Please select both source and target models');
        }
        
        // Check canvas elements exist
        const sourceCanvas = document.getElementById('sourceViewer');
        const targetCanvas = document.getElementById('targetViewer');
        
        if (!sourceCanvas || !targetCanvas) {
            throw new Error('Canvas elements not found in HTML');
        }
        
        // Initialize split view viewer with canvas IDs
        if (!splitViewViewer) {
            splitViewViewer = new SplitViewViewer('sourceViewer', 'targetViewer');
        }
        
        // Construct file URLs
        const sourceUrl = `${API_BASE}/file/${encodeURIComponent(selectedSource.file_path)}`;
        const targetUrl = `${API_BASE}/file/${encodeURIComponent(selectedTarget.file_path)}`;
        
        // Load models into respective viewers
        console.log('Loading source model:', sourceUrl);
        await splitViewViewer.sourceViewer.loadModel(sourceUrl, selectedSource.file_type);
        
        console.log('Loading target model:', targetUrl);
        await splitViewViewer.targetViewer.loadModel(targetUrl, selectedTarget.file_type);
        
        // Hide loading, show split view and controls
        const loadingInd = document.getElementById('loadingIndicator');
        const viewerCtrls = document.getElementById('viewerControlsPanel');
        
        if (loadingInd) loadingInd.style.display = 'none';
        document.getElementById('splitViewContainer').style.display = 'flex';
        if (viewerCtrls) viewerCtrls.style.display = 'block';
        
        // Trigger resize to ensure canvases are properly sized
        window.dispatchEvent(new Event('resize'));
        
        console.log('3D viewers loaded successfully');
    } catch (error) {
        console.error('Error in load3DViewer:', error);
        throw error;
    }
}

// Load DICOM viewer
async function loadDicomViewer(sourceIsDicom, targetIsDicom) {
    try {
        // Initialize DICOM viewer if not already done
        if (!dicomViewer) {
            const dicomCanvas = document.getElementById('dicomViewer');
            if (!dicomCanvas) {
                throw new Error('DICOM canvas element not found');
            }
            dicomViewer = new DicomViewer2D('dicomViewer');
            await dicomViewer.init();
            setupDicomControls();
        }
        
        // For now, load the first available DICOM series (prefer source if available)
        const dicomModel = sourceIsDicom ? selectedSource : selectedTarget;
        
        // Get DICOM series
        const response = await fetch(`${API_BASE}/cbct-series/${dicomModel.patient_id}`);
        const data = await response.json();
        
        if (!data.series || data.series.length === 0) {
            throw new Error('No DICOM files found');
        }
        
        // Load first series
        const series = data.series[0];
        await dicomViewer.loadDicomSeries(series.files);
        
        // Hide loading, show DICOM viewer
        const loadingInd = document.getElementById('loadingIndicator');
        const dicomCont = document.getElementById('dicomViewerContainer');
        const viewerCtrls = document.getElementById('viewerControlsPanel');
        
        if (loadingInd) loadingInd.style.display = 'none';
        if (dicomCont) dicomCont.style.display = 'flex';
        if (viewerCtrls) viewerCtrls.style.display = 'none';
        
        // Update slider max value
        const slider = document.getElementById('dicomSliceSlider');
        if (slider) {
            slider.max = series.files.length - 1;
        }
        
        // Trigger resize
        window.dispatchEvent(new Event('resize'));
    } catch (error) {
        console.error('Error in loadDicomViewer:', error);
        throw error;
    }
}

// Setup DICOM viewer controls
function setupDicomControls() {
    const prevBtn = document.getElementById('dicomPrevBtn');
    const nextBtn = document.getElementById('dicomNextBtn');
    const slider = document.getElementById('dicomSliceSlider');
    
    if (!prevBtn || !nextBtn || !slider) {
        console.warn('DICOM control elements not found');
        return;
    }
    
    prevBtn.addEventListener('click', () => {
        if (dicomViewer) {
            const index = dicomViewer.getCurrentIndex();
            if (index > 0) {
                dicomViewer.goToSlice(index - 1);
                slider.value = index - 1;
            }
        }
    });
    
    nextBtn.addEventListener('click', () => {
        if (dicomViewer) {
            const index = dicomViewer.getCurrentIndex();
            if (index < dicomViewer.getFileCount() - 1) {
                dicomViewer.goToSlice(index + 1);
                slider.value = index + 1;
            }
        }
    });
    
    slider.addEventListener('input', (e) => {
        if (dicomViewer) {
            dicomViewer.goToSlice(parseInt(e.target.value));
        }
    });
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', initRegistration);
