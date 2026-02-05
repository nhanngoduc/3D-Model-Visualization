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
        // If both selected and they point to the same file, allow proceeding with a warning
        if (selectedSource && selectedTarget && selectedSource.file_path === selectedTarget.file_path) {
            const proceedBtn = document.getElementById('proceedBtn');
            proceedBtn.disabled = false;
            showValidationMessage('Warning: Source and Target are the same model. Proceed to overlay for testing or manual registration.', 'warning');
            document.getElementById('directionIndicator').style.display = 'flex';
        }
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
        // If both selected and they point to the same file, allow proceeding with a warning
        if (selectedSource && selectedTarget && selectedSource.file_path === selectedTarget.file_path) {
            const proceedBtn = document.getElementById('proceedBtn');
            proceedBtn.disabled = false;
            showValidationMessage('Warning: Source and Target are the same model. Proceed to overlay for testing or manual registration.', 'warning');
            document.getElementById('directionIndicator').style.display = 'flex';
        }
    });

    // REG-01.3: Swap source and target
    swapBtn.addEventListener('click', swapModels);

    // Proceed to viewer
    proceedBtn.addEventListener('click', proceedToViewer);

    // Continue registration (next story group)
    continueRegBtn.addEventListener('click', () => {
        alert('Next: REG-03 (Registration Type Detection)\nStory Group 2 coming soon...');
    });

    // Back to Selection
    const backBtn = document.getElementById('backToSelectionBtn');
    if (backBtn) {
        backBtn.addEventListener('click', backToSelection);
    }

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

    // Check if source === target — allow same model with a warning for testing/manual registration
    if (selectedSource.file_path === selectedTarget.file_path) {
        showValidationMessage('Warning: Source and Target are the same model. Proceed to overlay for testing or manual registration.', 'warning');
        directionIndicator.style.display = 'flex';
        proceedBtn.disabled = false;
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
        const modelSelectionPanel = document.getElementById('modelSelectionPanel');

        if (loadingInd) loadingInd.style.display = 'flex';
        if (selectionView) selectionView.style.display = 'none';
        if (viewerContainer) viewerContainer.style.display = 'none';
        if (splitViewCont) splitViewCont.style.display = 'none';
        if (dicomViewerCont) dicomViewerCont.style.display = 'none';
        if (modelSelectionPanel) modelSelectionPanel.style.display = 'none';

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
        const modelSelectionPanel = document.getElementById('modelSelectionPanel');

        if (loadingInd) loadingInd.style.display = 'none';
        if (selectionView) selectionView.style.display = 'flex';
        if (modelSelectionPanel) modelSelectionPanel.style.display = 'block';

        showValidationMessage('Error loading models: ' + error.message, 'error');
    }
}

function backToSelection() {
    const viewerControls = document.getElementById('viewerControlsPanel');
    const modelSelectionPanel = document.getElementById('modelSelectionPanel');
    const selectionView = document.getElementById('selectionView');
    const viewerContainer = document.getElementById('viewerContainer');
    const splitViewCont = document.getElementById('splitViewContainer');
    const dicomViewerCont = document.getElementById('dicomViewerContainer');

    // Hide viewer panels
    if (viewerControls) viewerControls.style.display = 'none';
    if (viewerContainer) viewerContainer.style.display = 'none';
    if (splitViewCont) splitViewCont.style.display = 'none';
    if (dicomViewerCont) dicomViewerCont.style.display = 'none';

    // Show selection panels
    if (modelSelectionPanel) modelSelectionPanel.style.display = 'block';
    if (selectionView) selectionView.style.display = 'flex';

    // Reset validation but keep selections
    validateSelection();
}

// Switch to combined overlay view after registration
async function switchToRegistrationOverlayView() {
    try {
        console.log('Switching to registration overlay view...');

        // Hide split view and controls
        const splitViewCont = document.getElementById('splitViewContainer');
        const viewerCtrls = document.getElementById('viewerControlsPanel');

        if (splitViewCont) splitViewCont.style.display = 'none';
        if (viewerCtrls) viewerCtrls.style.display = 'none';

        // Show overlay viewer container and controls
        const viewerContainer = document.getElementById('viewerContainer');
        const overlayControls = document.getElementById('overlayControlsPanel');

        if (viewerContainer) viewerContainer.style.display = 'block';
        if (overlayControls) overlayControls.style.display = 'block';

        // Initialize registration overlay viewer if not already done
        if (!registrationViewer) {
            const regCanvas = document.getElementById('registrationViewer');
            if (!regCanvas) {
                throw new Error('Registration viewer canvas not found');
            }
            registrationViewer = new RegistrationViewer('registrationViewer');
        }

        // Get the meshes from split viewers
        if (splitViewViewer && splitViewViewer.sourceViewer && splitViewViewer.targetViewer) {
            const sourceViewer = splitViewViewer.sourceViewer;
            const targetViewer = splitViewViewer.targetViewer;

            const sourceMesh = sourceViewer.mesh;
            const targetMesh = targetViewer.mesh;

            if (sourceMesh && targetMesh) {
                // CLEAR existing meshes from scene
                if (registrationViewer.sourceMesh) registrationViewer.scene.remove(registrationViewer.sourceMesh);
                if (registrationViewer.targetMesh) registrationViewer.scene.remove(registrationViewer.targetMesh);

                // --- CLONE AND RESTORE WORLD COORDINATES ---
                // The split view meshes have geometry centered at (0,0,0) and are scaled.
                // We must restore them to their original World Space position/scale for correct alignment.
                // Formula: P_world = Center + P_local / Scale (If we scaled down)
                // Actually SplitViewViewer does: 
                // geometry.translate(-C); scale=S;
                // So displayed P = (P_orig - C) * S.
                // To restore P_orig: P_orig = (P/S) + C.

                // TARGET MESH (Reference)
                // Clone the mesh (shares geometry)
                const targetClone = targetMesh.clone();
                // Reset Rotation (crucial, as user might have rotated it)
                targetClone.rotation.set(0, 0, 0);
                // Reset Scale (it was scaled by S)
                targetClone.scale.setScalar(1);
                // Move Position to C (effectively undoing the geometry translation -C)
                if (targetViewer.modelCenter) {
                    targetClone.position.copy(targetViewer.modelCenter);
                }

                // SOURCE MESH (Transformed)
                const sourceClone = sourceMesh.clone();
                sourceClone.rotation.set(0, 0, 0);
                sourceClone.scale.setScalar(1);
                if (sourceViewer.modelCenter) {
                    sourceClone.position.copy(sourceViewer.modelCenter);
                }

                // Apply Registration Transform to Source
                if (manualState.transform) {
                    const R = manualState.transform.rotation;
                    const t = manualState.transform.translation;

                    const m = new THREE.Matrix4();
                    m.set(
                        R[0][0], R[0][1], R[0][2], t[0],
                        R[1][0], R[1][1], R[1][2], t[1],
                        R[2][0], R[2][1], R[2][2], t[2],
                        0, 0, 0, 1
                    );

                    // Apply matrix. Since the mesh is now effectively at P_world origin but translated by position=C,
                    // applying matrix M to the object works as: M * Translate(C) * Vertices.
                    // This correctly transforms the model in World Space.
                    sourceClone.applyMatrix4(m);
                }

                // Add to registration viewer scene
                if (registrationViewer.scene) {
                    registrationViewer.scene.add(sourceClone);
                    registrationViewer.scene.add(targetClone);

                    // Update references
                    registrationViewer.sourceMesh = sourceClone;
                    registrationViewer.targetMesh = targetClone;
                    registrationViewer.selectedModel = 'source'; // Default selection

                    // Set visual properties
                    sourceClone.visible = true;
                    targetClone.visible = true;
                    if (sourceClone.material) sourceClone.material.opacity = 0.8;
                    if (targetClone.material) targetClone.material.opacity = 0.6;

                    // Fit camera to show the restored world-space models
                    registrationViewer.fitCameraToObjects();

                    console.log('✓ Models restored to world coordinates and aligned');
                    showValidationMessage('Registration complete! Viewing aligned models.', 'success');
                }
            }
        }

        // Trigger resize
        window.dispatchEvent(new Event('resize'));

    } catch (error) {
        console.error('Error switching to overlay view:', error);
        showValidationMessage('Error switching to overlay view: ' + error.message, 'error');
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

// Manual Registration state
const manualState = {
    sourcePoints: [],
    targetPoints: [],
    sourceMarkers: [],
    targetMarkers: [],
    previewApplied: false,
    originalSourceMatrix: null,
    transform: null
};

// Event handlers for manual registration UI
function setupManualRegistrationUI() {
    const manualRegBtn = document.getElementById('manualRegBtn');
    const manualModal = document.getElementById('manualRegModal');
    const closeManual = document.getElementById('closeManualModalBtn');
    const enterPickModeBtn = document.getElementById('enterPickModeBtn');
    const clearPointsBtn = document.getElementById('clearPointsBtn');
    const computeTransformBtn = document.getElementById('computeTransformBtn');
    const previewTransformBtn = document.getElementById('previewTransformBtn');
    const acceptTransformBtn = document.getElementById('acceptTransformBtn');

    manualRegBtn.addEventListener('click', () => {
        manualModal.style.display = 'block';
    });

    closeManual.addEventListener('click', () => {
        manualModal.style.display = 'none';
        exitPickMode();
    });

    clearPointsBtn.addEventListener('click', () => {
        clearManualPoints();
    });

    enterPickModeBtn.addEventListener('click', () => {
        togglePickMode();
    });

    // UX Improvement: Wire up the finish pick button in the overlay
    const finishPickBtn = document.getElementById('finishPickBtn');
    if (finishPickBtn) {
        finishPickBtn.addEventListener('click', () => {
            // Exit pick mode -> This will effectively "Finish Picking"
            togglePickMode();
        });
    }

    // Undo button
    const undoPickBtn = document.getElementById('undoPickBtn');
    if (undoPickBtn) {
        undoPickBtn.addEventListener('click', undoLastPoint);
    }

    computeTransformBtn.addEventListener('click', async () => {
        if (manualState.sourcePoints.length !== manualState.targetPoints.length || manualState.sourcePoints.length !== 4) {
            alert('Please pick exactly 4 point pairs for manual registration');
            return;
        }

        try {
            // Show loading
            const computeBtn = document.getElementById('computeTransformBtn');
            const originalText = computeBtn.textContent;
            computeBtn.textContent = 'Registering...';
            computeBtn.disabled = true;

            // Step 1: Compute transform (get R, t)
            const resp = await fetch(`${API_BASE}/patient/${encodeURIComponent(selectedSource.patient_id)}/register/manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source_points: manualState.sourcePoints, target_points: manualState.targetPoints })
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.error || 'Compute failed');

            manualState.transform = result;

            // Step 2: Save the registered model to backend
            // (We do this now so the file exists, but we visualize using the computed matrix)
            const applyResp = await fetch(`${API_BASE}/patient/${encodeURIComponent(selectedSource.patient_id)}/register/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_path: selectedSource.file_path,
                    rotation: manualState.transform.rotation,
                    translation: manualState.transform.translation
                })
            });

            const applyResult = await applyResp.json();
            if (!applyResp.ok) throw new Error(applyResult.error || 'Save failed');

            console.log('Backend registration successful:', applyResult);

            showValidationMessage(`✓ Registration successful! RMSE=${result.rmse.toFixed(3)}`, 'success');

            // Restore button state
            computeBtn.textContent = originalText;
            computeBtn.disabled = true;

            // Close modal and switch to combined overlay view
            const manualModal = document.getElementById('manualRegModal');
            if (manualModal) manualModal.style.display = 'none';
            exitPickMode();

            // Switch from split view to combined overlay view
            try {
                await switchToRegistrationOverlayView();
                // Only clear points if switch was successful (or partially so)
                clearManualPoints();
            } catch (switchError) {
                console.error("View switch failed:", switchError);
                showValidationMessage('Registration saved, but view switch failed: ' + switchError.message, 'warning');
            }

        } catch (err) {
            console.error('Registration error:', err);
            showValidationMessage('Error: ' + err.message, 'error');

            // Restore button state on error
            const computeBtn = document.getElementById('computeTransformBtn');
            computeBtn.textContent = 'OK';
            computeBtn.disabled = false;
        }
    });
}

function togglePickMode() {
    if (!splitViewViewer) return;
    const enterBtn = document.getElementById('enterPickModeBtn');
    const manualModal = document.getElementById('manualRegModal');
    const pickModeOverlay = document.getElementById('pickModeOverlay');

    const isActive = enterBtn.classList.toggle('active');
    const enabling = isActive;

    splitViewViewer.sourceViewer.setPickMode(enabling);
    splitViewViewer.targetViewer.setPickMode(enabling);

    if (enabling) {
        splitViewViewer.sourceViewer.setOnPointPick((pt) => onPointPicked('source', pt));
        splitViewViewer.targetViewer.setOnPointPick((pt) => onPointPicked('target', pt));

        // UX Improvement: Hide blocking modal, show non-blocking overlay
        if (manualModal) manualModal.style.display = 'none';
        if (pickModeOverlay) {
            pickModeOverlay.style.display = 'flex';
            updatePickOverlayCounts();
        }

        showValidationMessage('Pick mode enabled: Click on Source or Target to pick points', 'info');
        document.getElementById('enterPickModeBtn').textContent = 'Exit Pick Mode';
    } else {
        exitPickMode();
    }
}

function exitPickMode() {
    const enterBtn = document.getElementById('enterPickModeBtn');
    const manualModal = document.getElementById('manualRegModal');
    const pickModeOverlay = document.getElementById('pickModeOverlay');

    enterBtn.classList.remove('active');
    enterBtn.textContent = 'Enter Pick Mode';

    if (splitViewViewer) {
        splitViewViewer.sourceViewer.setPickMode(false);
        splitViewViewer.targetViewer.setPickMode(false);
        splitViewViewer.sourceViewer.setOnPointPick(null);
        splitViewViewer.targetViewer.setOnPointPick(null);
    }

    // Restore modal, hide overlay
    if (pickModeOverlay) pickModeOverlay.style.display = 'none';
    if (manualModal) manualModal.style.display = 'block';

    // Force render update
    if (splitViewViewer) {
        if (splitViewViewer.sourceViewer) {
            splitViewViewer.sourceViewer.renderer.render(
                splitViewViewer.sourceViewer.scene,
                splitViewViewer.sourceViewer.camera
            );
        }
        if (splitViewViewer.targetViewer) {
            splitViewViewer.targetViewer.renderer.render(
                splitViewViewer.targetViewer.scene,
                splitViewViewer.targetViewer.camera
            );
        }
    }

    // Update button OK state based on current points
    const computeBtn = document.getElementById('computeTransformBtn');
    if (computeBtn) {
        if (manualState.sourcePoints.length === 4 && manualState.targetPoints.length === 4) {
            computeBtn.disabled = false;
            showValidationMessage('Ready! Click OK to register.', 'success');
        } else {
            computeBtn.disabled = true;
        }
    }

    showValidationMessage('Pick mode disabled', 'info');
}

function undoLastPoint() {
    // Undo logic: We need to know which side was picked last? 
    // Or just check lengths. If equal, maybe undo target (assuming source then target pattern)?
    // But user can pick in any order.
    // Ideally we should track a history stack.

    // For now, let's just try to be smart or simple.
    // Simple approach: Check lists. If we have more target points or equal, remove last target.
    // If we have more source points, remove last source.
    // This assumes user roughly alternates or finishes one side.

    const sLen = manualState.sourcePoints.length;
    const tLen = manualState.targetPoints.length;

    if (sLen === 0 && tLen === 0) return;

    let sideToRemove = null;

    // Heuristic: Remove the one that was likely added last.
    // We can rely on timestamp? No timestamps stored safely.
    // Let's rely on standard workflow: Source -> Target -> Source -> Target.
    // If lengths are equal (e.g. 1 and 1), last one was probably Target.
    // If Source > Target (e.g. 2 and 1), last one was Source.
    // If Target > Source (e.g. 1 and 2), last one was Target.

    if (tLen >= sLen && tLen > 0) {
        sideToRemove = 'target';
    } else {
        sideToRemove = 'source';
    }

    if (sideToRemove === 'source') {
        manualState.sourcePoints.pop();
        const marker = manualState.sourceMarkers.pop();
        if (marker && splitViewViewer && splitViewViewer.sourceViewer) {
            splitViewViewer.sourceViewer.scene.remove(marker);
        }

        const list = document.getElementById('sourcePointsList');
        if (list.lastElementChild) list.removeChild(list.lastElementChild);

        showValidationMessage('Undid last Source point', 'info');
    } else {
        manualState.targetPoints.pop();
        const marker = manualState.targetMarkers.pop();
        if (marker && splitViewViewer && splitViewViewer.targetViewer) {
            splitViewViewer.targetViewer.scene.remove(marker);
        }

        const list = document.getElementById('targetPointsList');
        if (list.lastElementChild) list.removeChild(list.lastElementChild);

        showValidationMessage('Undid last Target point', 'info');
    }

    updatePickOverlayCounts();
    document.getElementById('computeTransformBtn').disabled = true;
}

function updatePickOverlayCounts() {
    const sCount = document.getElementById('sourcePickCount');
    const tCount = document.getElementById('targetPickCount');
    if (sCount) {
        sCount.textContent = `${manualState.sourcePoints.length}/4`;
        if (manualState.sourcePoints.length === 4) sCount.classList.add('done');
        else sCount.classList.remove('done');
    }
    if (tCount) {
        tCount.textContent = `${manualState.targetPoints.length}/4`;
        if (manualState.targetPoints.length === 4) tCount.classList.add('done');
        else tCount.classList.remove('done');
    }
}

function clearManualPoints() {
    manualState.sourcePoints = [];
    manualState.targetPoints = [];
    manualState.sourceMarkers = [];
    manualState.targetMarkers = [];
    manualState.previewApplied = false;
    manualState.originalSourceMatrix = null;
    manualState.transform = null;

    document.getElementById('sourcePointsList').innerHTML = '';
    document.getElementById('targetPointsList').innerHTML = '';

    if (splitViewViewer) {
        splitViewViewer.sourceViewer.clearMarkers();
        splitViewViewer.targetViewer.clearMarkers();
    }

    document.getElementById('computeTransformBtn').disabled = true;
    document.getElementById('previewTransformBtn').disabled = true;
    document.getElementById('acceptTransformBtn').disabled = true;
}

function onPointPicked(side, threePoint) {
    const arr = [threePoint.x, threePoint.y, threePoint.z];

    if (side === 'source') {
        if (manualState.sourcePoints.length >= 4) {
            showValidationMessage('Already picked 4 source points', 'warning');
            return;
        }
        manualState.sourcePoints.push(arr);
        const li = document.createElement('li');
        li.textContent = `(${arr.map(v => v.toFixed(3)).join(', ')})`;
        document.getElementById('sourcePointsList').appendChild(li);

        // Pass index as label (length is already updated)
        const label = manualState.sourcePoints.length.toString();
        const marker = splitViewViewer.sourceViewer.addMarker(threePoint, 0xff0000, label);
        manualState.sourceMarkers.push(marker);
    } else {
        if (manualState.targetPoints.length >= 4) {
            showValidationMessage('Already picked 4 target points', 'warning');
            return;
        }
        manualState.targetPoints.push(arr);
        const li = document.createElement('li');
        li.textContent = `(${arr.map(v => v.toFixed(3)).join(', ')})`;
        document.getElementById('targetPointsList').appendChild(li);

        // Pass index as label
        const label = manualState.targetPoints.length.toString();
        const marker = splitViewViewer.targetViewer.addMarker(threePoint, 0x00ff00, label);
        manualState.targetMarkers.push(marker);
    }

    // Enable compute when we have exactly 4 pairs
    if (manualState.sourcePoints.length === 4 && manualState.targetPoints.length === 4) {
        document.getElementById('computeTransformBtn').disabled = false;
        showValidationMessage('4 points picked! Click OK to register.', 'success');
        // Optional: Auto-exit pick mode?
        // togglePickMode(); 
    }

    // Update overlay counts
    updatePickOverlayCounts();
}

// Setup overlay viewer controls (shown after successful registration)
function setupOverlayControls() {
    const backBtn = document.getElementById('backToSplitViewBtn');
    const toggleSourceBtn = document.getElementById('overlayToggleSource');
    const toggleTargetBtn = document.getElementById('overlayToggleTarget');
    const sourceOpacitySlider = document.getElementById('overlaySourceOpacity');
    const targetOpacitySlider = document.getElementById('overlayTargetOpacity');
    const cameraPresetSelect = document.getElementById('overlayCameraPreset');
    const finishBtn = document.getElementById('finishRegBtn');

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            // Go back to split view
            const viewerContainer = document.getElementById('viewerContainer');
            const overlayControls = document.getElementById('overlayControlsPanel');
            const splitViewCont = document.getElementById('splitViewContainer');
            const viewerCtrls = document.getElementById('viewerControlsPanel');

            if (viewerContainer) viewerContainer.style.display = 'none';
            if (overlayControls) overlayControls.style.display = 'none';
            if (splitViewCont) splitViewCont.style.display = 'flex';
            if (viewerCtrls) viewerCtrls.style.display = 'block';
        });
    }

    // Add "Refine Alignment (ICP)" button if not present
    let refineBtn = document.getElementById('refineRegBtn');
    if (!refineBtn) {
        // Create button container or append to existing
        const panel = document.getElementById('overlayControlsPanel');
        if (panel) {
            refineBtn = document.createElement('button');
            refineBtn.id = 'refineRegBtn';
            refineBtn.className = 'btn secondary-btn'; // Use existing class
            refineBtn.textContent = '✨ Refine Alignment (ICP)';
            refineBtn.style.marginTop = '10px';
            refineBtn.style.marginBottom = '10px';
            refineBtn.style.width = '100%';

            // Insert before Finish button
            if (finishBtn) {
                panel.insertBefore(refineBtn, finishBtn);
            } else {
                panel.appendChild(refineBtn);
            }

            refineBtn.addEventListener('click', async () => {
                console.log('Refine button clicked');
                console.log('Current Transform:', manualState.transform);

                if (!manualState.transform) {
                    console.error('No transform found in state!');
                    return;
                }

                try {
                    const originalText = refineBtn.textContent;
                    refineBtn.textContent = 'Refining...';
                    refineBtn.disabled = true;

                    const payload = {
                        source_path: selectedSource.file_path,
                        target_path: selectedTarget.file_path,
                        rotation: manualState.transform.rotation,
                        translation: manualState.transform.translation
                    };
                    console.log('Sending ICP payload:', payload);

                    // We need selectedTarget.file_path. Let's make sure 'selectedTarget' is accessible.
                    // It is global in this file.

                    const resp = await fetch(`${API_BASE}/patient/${encodeURIComponent(selectedSource.patient_id)}/register/icp`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    const result = await resp.json();
                    if (!resp.ok) throw new Error(result.error || 'Refinement failed');

                    // Update state with REFINED transform
                    manualState.transform = {
                        rotation: result.rotation,
                        translation: result.translation,
                        rmse: result.rmse
                    };

                    console.log('Refinement successful:', result);
                    showValidationMessage(`Refined! RMSE improved to ${result.rmse.toFixed(3)}`, 'success');

                    // Update view
                    await switchToRegistrationOverlayView();

                    // Also update the SAVED file on backend
                    await fetch(`${API_BASE}/patient/${encodeURIComponent(selectedSource.patient_id)}/register/apply`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            source_path: selectedSource.file_path,
                            rotation: result.rotation,
                            translation: result.translation
                        })
                    });

                } catch (err) {
                    console.error('Refinement error:', err);
                    showValidationMessage('Refinement failed: ' + err.message, 'error');
                } finally {
                    const btn = document.getElementById('refineRegBtn');
                    if (btn) {
                        btn.textContent = '✨ Refine Alignment (ICP)';
                        btn.disabled = false;
                    }
                }
            });
        }
    }

    if (toggleSourceBtn) {
        toggleSourceBtn.addEventListener('change', (e) => {
            if (registrationViewer && registrationViewer.sourceMesh) {
                registrationViewer.sourceMesh.visible = e.target.checked;
            }
        });
    }

    if (toggleTargetBtn) {
        toggleTargetBtn.addEventListener('change', (e) => {
            if (registrationViewer && registrationViewer.targetMesh) {
                registrationViewer.targetMesh.visible = e.target.checked;
            }
        });
    }

    if (sourceOpacitySlider) {
        sourceOpacitySlider.addEventListener('input', (e) => {
            if (registrationViewer && registrationViewer.sourceMesh && registrationViewer.sourceMesh.material) {
                registrationViewer.sourceMesh.material.opacity = e.target.value / 100;
            }
            document.getElementById('overlaySourceOpacityValue').textContent = e.target.value + '%';
        });
    }

    if (targetOpacitySlider) {
        targetOpacitySlider.addEventListener('input', (e) => {
            if (registrationViewer && registrationViewer.targetMesh && registrationViewer.targetMesh.material) {
                registrationViewer.targetMesh.material.opacity = e.target.value / 100;
            }
            document.getElementById('overlayTargetOpacityValue').textContent = e.target.value + '%';
        });
    }

    if (cameraPresetSelect) {
        cameraPresetSelect.addEventListener('change', (e) => {
            if (registrationViewer) {
                registrationViewer.applyPreset(e.target.value);
            }
        });
    }

    if (finishBtn) {
        finishBtn.addEventListener('click', () => {
            showValidationMessage('Registration results saved successfully!', 'success');
            // Could navigate to next step or show more options here
        });
    }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
    initRegistration();
    setupManualRegistrationUI();
    setupOverlayControls();
});
