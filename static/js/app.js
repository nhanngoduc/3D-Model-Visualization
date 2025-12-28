// API Base URL
const API_BASE = 'http://localhost:5000/api';

// Global state
let currentPatient = null;
let currentDataType = null;
let patientData = null;
let viewer3D = null;
let dicomViewer = null;

// DOM Elements
const patientSelect = document.getElementById('patientSelect');
const dataTypeSection = document.getElementById('dataTypeSection');
const dataTypeTabs = document.getElementById('dataTypeTabs');
const fileListSection = document.getElementById('fileListSection');
const fileList = document.getElementById('fileList');
const welcomeScreen = document.getElementById('welcomeScreen');
const viewer3dCanvas = document.getElementById('viewer3d');
const dicomViewerEl = document.getElementById('dicomViewer');
const viewerControls = document.getElementById('viewerControls');
const headerInfo = document.getElementById('headerInfo');

// Initialize app
async function init() {
    console.log('Initializing Medical Data Viewer...');
    await loadPatients();
    setupEventListeners();
}

// Load patients from API
async function loadPatients() {
    try {
        updateStatus('Loading patients...', 'loading');
        const response = await fetch(`${API_BASE}/patients`);
        const data = await response.json();

        if (data.patients && data.patients.length > 0) {
            populatePatientSelect(data.patients);
            updateStatus('Ready', 'ready');
        } else {
            updateStatus('No patients found', 'error');
        }
    } catch (error) {
        console.error('Error loading patients:', error);
        updateStatus('Error loading patients', 'error');
    }
}

// Populate patient select dropdown
function populatePatientSelect(patients) {
    patientSelect.innerHTML = '<option value="">Select a patient...</option>';

    patients.forEach(patient => {
        const option = document.createElement('option');
        option.value = patient.id;
        option.textContent = patient.name;
        patientSelect.appendChild(option);
    });
}

// Setup event listeners
function setupEventListeners() {
    // Patient selection
    patientSelect.addEventListener('change', handlePatientChange);

    // Data type tabs
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const dataType = button.getAttribute('data-type');
            handleDataTypeChange(dataType);
        });
    });

    // Viewer controls
    const resetCameraBtn = document.getElementById('resetCamera');
    const toggleWireframeBtn = document.getElementById('toggleWireframe');

    if (resetCameraBtn) {
        resetCameraBtn.addEventListener('click', () => {
            if (viewer3D) viewer3D.resetCamera();
        });
    }

    if (toggleWireframeBtn) {
        toggleWireframeBtn.addEventListener('click', () => {
            if (viewer3D) viewer3D.toggleWireframe();
        });
    }
}

// Handle patient selection change
async function handlePatientChange(event) {
    const patientId = event.target.value;

    if (!patientId) {
        currentPatient = null;
        patientData = null;
        hideDataTypeSection();
        hideFileListSection();
        showWelcomeScreen();
        return;
    }

    currentPatient = patientId;
    updateStatus(`Loading data for ${patientId}...`, 'loading');

    try {
        const response = await fetch(`${API_BASE}/patient/${patientId}/data`);
        patientData = await response.json();

        console.log('Patient data loaded:', patientData);

        showDataTypeSection();
        updateStatus('Patient data loaded', 'ready');
    } catch (error) {
        console.error('Error loading patient data:', error);
        updateStatus('Error loading patient data', 'error');
    }
}

// Handle data type change
function handleDataTypeChange(dataType) {
    currentDataType = dataType;

    // Update active tab
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        if (button.getAttribute('data-type') === dataType) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });

    // Show files for this data type
    if (patientData && patientData.data[dataType]) {
        const files = patientData.data[dataType];
        displayFileList(files);
    }
}

// Display file list
function displayFileList(files) {
    fileList.innerHTML = '';

    if (files.length === 0) {
        fileList.innerHTML = '<p style="color: var(--text-secondary); padding: 1rem;">No files found</p>';
        showFileListSection();
        return;
    }

    files.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-name">${file.name}</div>
            <div class="file-meta">
                <span>${file.type.toUpperCase()}</span>
                <span>${formatFileSize(file.size)}</span>
            </div>
        `;

        fileItem.addEventListener('click', () => {
            handleFileClick(file, fileItem);
        });

        fileList.appendChild(fileItem);
    });

    showFileListSection();
}

// Handle file click
function handleFileClick(file, fileItem) {
    // Update active file
    document.querySelectorAll('.file-item').forEach(item => {
        item.classList.remove('active');
    });
    fileItem.classList.add('active');

    // Load and display file
    loadFile(file);
}

// Load and display file
async function loadFile(file) {
    updateStatus(`Loading ${file.name}...`, 'loading');

    const fileUrl = `${API_BASE}/file/${file.path}`;

    if (file.type === 'ply' || file.type === 'stl') {
        // Load 3D mesh
        hideWelcomeScreen();
        hideDicomViewer();
        showViewer3D();

        if (!viewer3D) {
            viewer3D = new Viewer3D('viewer3d');
        } else {
            // Ensure renderer is properly sized when canvas becomes visible
            viewer3D.onWindowResize();
        }

        await viewer3D.loadMesh(fileUrl, file.type);
        updateStatus(`Viewing ${file.name}`, 'ready');
    } else if (file.type === 'dcm') {
        // Load DICOM
        hideWelcomeScreen();
        hideViewer3D();
        showDicomViewer();

        if (!dicomViewer) {
            dicomViewer = new DicomViewer('dicomCanvas');
        }

        await dicomViewer.loadDicom(fileUrl);
        updateStatus(`Viewing ${file.name}`, 'ready');
    }
}

// UI Helper Functions
function showDataTypeSection() {
    dataTypeSection.style.display = 'block';
}

function hideDataTypeSection() {
    dataTypeSection.style.display = 'none';
}

function showFileListSection() {
    fileListSection.style.display = 'block';
}

function hideFileListSection() {
    fileListSection.style.display = 'none';
}

function showWelcomeScreen() {
    welcomeScreen.style.display = 'flex';
    viewer3dCanvas.style.display = 'none';
    dicomViewerEl.style.display = 'none';
    viewerControls.style.display = 'none';
}

function hideWelcomeScreen() {
    welcomeScreen.style.display = 'none';
}

function showViewer3D() {
    viewer3dCanvas.style.display = 'block';
    viewerControls.style.display = 'flex';
}

function hideViewer3D() {
    viewer3dCanvas.style.display = 'none';
    viewerControls.style.display = 'none';
}

function showDicomViewer() {
    dicomViewerEl.style.display = 'flex';
}

function hideDicomViewer() {
    dicomViewerEl.style.display = 'none';
}

function updateStatus(text, status) {
    const statusText = headerInfo.querySelector('.status-text');
    const statusIndicator = headerInfo.querySelector('.status-indicator');

    statusText.textContent = text;

    // Update indicator color based on status
    if (status === 'ready') {
        statusIndicator.style.background = '#4ade80'; // green
    } else if (status === 'loading') {
        statusIndicator.style.background = '#fbbf24'; // yellow
    } else if (status === 'error') {
        statusIndicator.style.background = '#ef4444'; // red
    }
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
