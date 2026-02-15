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

function buildRotationMatrix4(rotation3x3) {
    const R = rotation3x3;
    const m = new THREE.Matrix4();
    m.set(
        R[0][0], R[0][1], R[0][2], 0,
        R[1][0], R[1][1], R[1][2], 0,
        R[2][0], R[2][1], R[2][2], 0,
        0, 0, 0, 1
    );
    return m;
}

function getGlobalDisplayScale() {
    if (!splitViewViewer || !splitViewViewer.sourceViewer || !splitViewViewer.targetViewer) return 1.0;
    const sSrc = splitViewViewer.sourceViewer.modelScale || 1.0;
    const sDst = splitViewViewer.targetViewer.modelScale || 1.0;
    // Each viewer scale = 3 / maxDim. Use a single scale in overlay to keep registration-space mapping consistent.
    // globalScale = 3 / max(maxDimSrc, maxDimDst) = min(sSrc, sDst)
    return Math.min(sSrc, sDst);
}

function computeVisualPoseFromTransform(transform) {
    if (!splitViewViewer || !splitViewViewer.sourceViewer || !splitViewViewer.targetViewer) return null;
    if (!transform || !transform.rotation || !transform.translation) return null;

    const sourceViewer = splitViewViewer.sourceViewer;
    const targetViewer = splitViewViewer.targetViewer;

    // IMPORTANT: Use viewer centers (the exact centers used when geometry was translated in Three.js).
    // Using backend AABB centers here can shift the overlay because the displayed geometry is centered
    // using sourceViewer/targetViewer.modelCenter, not backend mesh centers.
    const centerSrc = sourceViewer.modelCenter || new THREE.Vector3(0, 0, 0);
    const centerDst = targetViewer.modelCenter || new THREE.Vector3(0, 0, 0);
    const globalScale = getGlobalDisplayScale();

    const rotMat = buildRotationMatrix4(transform.rotation);
    const tGlobal = new THREE.Vector3(
        transform.translation[0],
        transform.translation[1],
        transform.translation[2]
    );
    const rotatedCenterSrc = centerSrc.clone().applyMatrix4(rotMat);
    const tVisual = rotatedCenterSrc.add(tGlobal).sub(centerDst).multiplyScalar(globalScale);

    return {
        rotation: transform.rotation,
        position: [tVisual.x, tVisual.y, tVisual.z],
        scale: globalScale
    };
}

function ensureTransformVisualPose(stateTransform) {
    if (!stateTransform) return null;
    if (stateTransform.visual_pose) return stateTransform.visual_pose;
    const visual = computeVisualPoseFromTransform(stateTransform);
    if (visual) stateTransform.visual_pose = visual;
    return visual;
}

function resetRegistrationTransformState(reason = 'context-change') {
    if (window.manualState && window.manualState.transform) {
        console.log('[State Reset] Clearing transform due to:', reason);
    }
    if (window.manualState) {
        window.manualState.transform = null;
        window.manualState.previewApplied = false;
        window.manualState.originalSourceMatrix = null;
    }
}

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
        resetRegistrationTransformState('source-patient-change');
        onSourcePatientChange(e.target.value);
    });

    sourceDataTypeSelect.addEventListener('change', (e) => {
        resetRegistrationTransformState('source-datatype-change');
        onSourceDataTypeChange(e.target.value);
    });

    sourceModelSelect.addEventListener('change', (e) => {
        resetRegistrationTransformState('source-model-change');
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
        resetRegistrationTransformState('target-patient-change');
        onTargetPatientChange(e.target.value);
    });

    targetDataTypeSelect.addEventListener('change', (e) => {
        resetRegistrationTransformState('target-datatype-change');
        onTargetDataTypeChange(e.target.value);
    });

    targetModelSelect.addEventListener('change', (e) => {
        resetRegistrationTransformState('target-model-change');
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

    // Auto Registration
    const autoRegBtn = document.getElementById('autoRegBtn');
    if (autoRegBtn) {
        autoRegBtn.addEventListener('click', performAutoRegistration);
    }

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
    resetRegistrationTransformState('swap-models');
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
    resetRegistrationTransformState('back-to-selection');
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

                // TARGET MESH (Reference) — use unified overlay scale for both meshes
                const targetClone = targetMesh.clone();
                targetClone.rotation.set(0, 0, 0);
                targetClone.position.set(0, 0, 0);
                const S_global = getGlobalDisplayScale();
                targetClone.scale.setScalar(S_global);

                // SOURCE MESH (Transformed)
                const sourceClone = sourceMesh.clone();
                sourceClone.rotation.set(0, 0, 0);
                sourceClone.position.set(0, 0, 0);

                // Apply Registration Transform if exists
                if (manualState.transform) {
                    // Prefer visual pose that was cached from the last successful alignment
                    // so the model jumps back to the exact same displayed position.
                    const visualPose = ensureTransformVisualPose(manualState.transform);
                    if (visualPose) {
                        const rotMat = buildRotationMatrix4(visualPose.rotation);
                        const t = manualState.transform.translation || [0, 0, 0];
                        const centerSrc = sourceViewer.modelCenter || new THREE.Vector3(0, 0, 0);
                        const centerDst = targetViewer.modelCenter || new THREE.Vector3(0, 0, 0);
                        sourceClone.scale.setScalar(visualPose.scale || S_global);
                        sourceClone.setRotationFromMatrix(rotMat);
                        sourceClone.position.set(
                            visualPose.position[0],
                            visualPose.position[1],
                            visualPose.position[2]
                        );

                        const srcCenterVis = centerSrc.clone().applyMatrix4(rotMat).add(
                            new THREE.Vector3(t[0], t[1], t[2])
                        );
                        const centerDistanceMm = srcCenterVis.distanceTo(centerDst);
                        console.log('[Overlay Mapping Check] globalScale=', (visualPose.scale || S_global));
                        console.log('[Overlay Mapping Check] center distance (mm)=', centerDistanceMm.toFixed(3));
                    } else {
                        sourceClone.scale.setScalar(S_global);
                    }
                } else {
                    // No transform, just use same scale
                    sourceClone.scale.setScalar(S_global);
                }

                // Add to registration viewer's unified rotation group
                if (registrationViewer.scene && registrationViewer.rotationGroup) {
                    // Clear previous
                    while (registrationViewer.rotationGroup.children.length > 0) {
                        registrationViewer.rotationGroup.remove(registrationViewer.rotationGroup.children[0]);
                    }

                    // Reset rotation group to origin (no pivot offset)
                    registrationViewer.rotationGroup.position.set(0, 0, 0);
                    registrationViewer.rotationGroup.rotation.set(0, 0, 0);

                    // Add clones to group
                    registrationViewer.rotationGroup.add(sourceClone);
                    registrationViewer.rotationGroup.add(targetClone);

                    // Update references
                    registrationViewer.sourceMesh = sourceClone;
                    registrationViewer.targetMesh = targetClone;

                    // Set visual properties
                    sourceClone.visible = true;
                    targetClone.visible = true;
                    if (sourceClone.material) {
                        sourceClone.material = sourceClone.material.clone();
                        sourceClone.material.transparent = true;
                        sourceClone.material.opacity = 0.8;
                    }
                    if (targetClone.material) {
                        targetClone.material = targetClone.material.clone();
                        targetClone.material.transparent = true;
                        targetClone.material.opacity = 0.6;
                    }

                    // Fit camera
                    registrationViewer.fitCameraToObjects();

                    console.log('✓ Models added and aligned in overlay view');
                    showValidationMessage('Alignment applied! Both models are now visible.', 'success');
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

    // Unified Overlay Rotation
    const bindUnifiedRotate = (id, axis, dir) => {
        document.getElementById(id)?.addEventListener('click', () => {
            if (registrationViewer) registrationViewer.rotateAll(axis, rotationAmount * dir);
        });
    };

    bindUnifiedRotate('overlayRotateXPos', 'x', 1);
    bindUnifiedRotate('overlayRotateXNeg', 'x', -1);
    bindUnifiedRotate('overlayRotateYPos', 'y', 1);
    bindUnifiedRotate('overlayRotateYNeg', 'y', -1);
    bindUnifiedRotate('overlayRotateZPos', 'z', 1);
    bindUnifiedRotate('overlayRotateZNeg', 'z', -1);

    document.getElementById('overlayResetRotation')?.addEventListener('click', () => {
        if (registrationViewer) registrationViewer.resetRotation();
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

        // Enable Manual and Auto Registration buttons
        const manualRegBtn = document.getElementById('manualRegBtn');
        const autoRegBtn = document.getElementById('autoRegBtn');
        if (manualRegBtn) manualRegBtn.disabled = false;
        if (autoRegBtn) autoRegBtn.disabled = false;

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
window.manualState = manualState;

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

    // Disable manual reg button initially
    if (manualRegBtn) manualRegBtn.disabled = true;

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
        if (manualState.sourcePoints.length !== manualState.targetPoints.length || manualState.sourcePoints.length < 3) {
            alert('Please pick at least 3 matching point pairs for manual registration');
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
            ensureTransformVisualPose(manualState.transform);

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

            // Explicitly log the Coarse (Manual) RMSE as requested
            console.log('=== MANUAL REGISTRATION RESULTS ===');
            console.log(`RMSE (Coarse): ${result.rmse.toFixed(4)}`);
            console.log('===================================');

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
        if (
            manualState.sourcePoints.length === manualState.targetPoints.length &&
            manualState.sourcePoints.length >= 3
        ) {
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

    const sLen = manualState.sourcePoints.length; // keep count to display
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
        sCount.textContent = `${manualState.sourcePoints.length}`;
        if (manualState.sourcePoints.length >= 3) sCount.classList.add('done');
        else sCount.classList.remove('done');
    }
    if (tCount) {
        tCount.textContent = `${manualState.targetPoints.length}`;
        if (manualState.targetPoints.length >= 3) tCount.classList.add('done');
        else tCount.classList.remove('done');
    }
}

function clearManualPoints(preserveTransform = true) {
    manualState.sourcePoints = [];
    manualState.targetPoints = [];
    manualState.sourceMarkers = [];
    manualState.targetMarkers = [];
    manualState.previewApplied = false;
    manualState.originalSourceMatrix = null;
    if (!preserveTransform) {
        manualState.transform = null;
    }

    document.getElementById('sourcePointsList').innerHTML = '';
    document.getElementById('targetPointsList').innerHTML = '';

    if (splitViewViewer) {
        splitViewViewer.sourceViewer.clearMarkers();
        splitViewViewer.targetViewer.clearMarkers();
    }

    const computeBtn = document.getElementById('computeTransformBtn');
    if (computeBtn) computeBtn.disabled = true;

    const previewBtn = document.getElementById('previewTransformBtn');
    if (previewBtn) previewBtn.disabled = true;

    const acceptBtn = document.getElementById('acceptTransformBtn');
    if (acceptBtn) acceptBtn.disabled = true;
}

function onPointPicked(side, threePoint) {
    const arr = [threePoint.x, threePoint.y, threePoint.z];

    if (side === 'source') {
        manualState.sourcePoints.push(arr);
        const li = document.createElement('li');
        li.textContent = `(${arr.map(v => v.toFixed(3)).join(', ')})`;
        document.getElementById('sourcePointsList').appendChild(li);

        // Pass index as label (length is already updated)
        const label = manualState.sourcePoints.length.toString();
        const marker = splitViewViewer.sourceViewer.addMarker(threePoint, 0xff0000, label);
        manualState.sourceMarkers.push(marker);
    } else {
        manualState.targetPoints.push(arr);
        const li = document.createElement('li');
        li.textContent = `(${arr.map(v => v.toFixed(3)).join(', ')})`;
        document.getElementById('targetPointsList').appendChild(li);

        // Pass index as label
        const label = manualState.targetPoints.length.toString();
        const marker = splitViewViewer.targetViewer.addMarker(threePoint, 0x00ff00, label);
        manualState.targetMarkers.push(marker);
    }

    // Enable compute only when we have at least 3 matching pairs
    const pairCount = Math.min(manualState.sourcePoints.length, manualState.targetPoints.length);
    const hasValidPairs =
        manualState.sourcePoints.length === manualState.targetPoints.length &&
        pairCount >= 3;
    if (hasValidPairs) {
        document.getElementById('computeTransformBtn').disabled = false;
        showValidationMessage(`${pairCount} point pair${pairCount > 1 ? 's' : ''} ready. Click OK to register.`, 'success');
    } else {
        document.getElementById('computeTransformBtn').disabled = true;
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
                const state = window.manualState || {};
                console.log('Current Transform:', state.transform);

                if (!state.transform) {
                    console.error('No transform found in window.manualState!');
                    alert('Please run Auto Registration first or select points manually.');
                    return;
                }

                try {
                    const originalText = refineBtn.textContent;
                    refineBtn.textContent = 'Refining...';
                    refineBtn.disabled = true;

                    const payload = {
                        source_path: selectedSource.file_path,
                        target_path: selectedTarget.file_path,
                        rotation: state.transform.rotation,
                        translation: state.transform.translation
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

                    // Calculate RMSE improvement
                    const rmse_before = manualState.transform.rmse || 0;
                    const rmse_after = result.rmse || 0;
                    const improvement = rmse_before > 0 ? ((rmse_before - rmse_after) / rmse_before * 100).toFixed(1) : 0;

                    console.log('=== ICP REFINEMENT RESULTS ===');
                    console.log(`RMSE Before ICP: ${rmse_before.toFixed(4)}`);
                    console.log(`RMSE After ICP:  ${rmse_after.toFixed(4)}`);
                    console.log(`Improvement:     ${improvement}%`);
                    console.log('==============================');

                    // Update state with REFINED transform
                    manualState.transform = {
                        rotation: result.rotation,
                        translation: result.translation,
                        rmse: result.rmse,
                        fitness: result.fitness,
                        overlap: result.overlap,
                        center_dist: result.center_dist,
                        low_confidence: result.low_confidence,
                        quality_gate: result.quality_gate || null,
                        model_centers: manualState.transform?.model_centers || null
                    };
                    ensureTransformVisualPose(manualState.transform);

                    console.log('Refinement successful:', result);
                    const gatePassed = result.quality_gate ? !!result.quality_gate.passed : true;
                    const lowConfidence = !!result.low_confidence || !gatePassed;
                    console.log(
                        `[Refine Metrics] rmse=${(result.rmse ?? 0).toFixed?.(4) ?? result.rmse}, ` +
                        `fitness=${(result.fitness ?? 0).toFixed?.(4) ?? result.fitness}, ` +
                        `overlap=${result.overlap}, center_dist=${result.center_dist}, ` +
                        `gate_passed=${gatePassed}, low_confidence=${lowConfidence}`
                    );
                    if (lowConfidence) {
                        showValidationMessage(
                            `Refine completed but still low confidence (RMSE ${rmse_after.toFixed(3)}).`,
                            'warning'
                        );
                    } else {
                        showValidationMessage(`Refined! RMSE: ${rmse_before.toFixed(3)} → ${rmse_after.toFixed(3)} (${improvement}% better)`, 'success');
                    }

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
// Perform Auto Registration (Centroid + ICP)
async function performAutoRegistration() {
    try {
        if (!selectedSource || !selectedTarget) {
            alert("Please select both source and target models.");
            return;
        }

        const autoRegBtn = document.getElementById('autoRegBtn');
        const processingMsg = document.createElement('div');
        processingMsg.id = 'autoRegProcessing';
        processingMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); color: white; padding: 20px; border-radius: 8px; z-index: 9999;';
        processingMsg.textContent = 'Running Auto Registration... Please wait.';
        document.body.appendChild(processingMsg);

        if (autoRegBtn) autoRegBtn.disabled = true;

        const response = await fetch(`${API_BASE}/patient/${selectedSource.patient_id}/register/auto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source_path: selectedSource.file_path,
                target_path: selectedTarget.file_path
            })
        });

        const result = await response.json();

        // Remove processing message
        const msg = document.getElementById('autoRegProcessing');
        if (msg) msg.remove();
        if (autoRegBtn) autoRegBtn.disabled = false;

        if (response.ok) {
            console.log('Auto Registration Result:', result);

            if (!result.rotation || !result.translation) {
                throw new Error("Invalid response from server: rotation or translation missing");
            }

            // Sync with window.manualState for consistency
            manualState.transform = {
                rotation: result.rotation,
                translation: result.translation,
                rmse: result.rmse,
                fitness: result.fitness,
                overlap: result.overlap,
                center_dist: result.center_dist,
                low_confidence: result.low_confidence,
                quality_gate: result.quality_gate || null,
                model_centers: result.model_centers || null
            };
            ensureTransformVisualPose(manualState.transform);

            const gatePassed = result.quality_gate ? !!result.quality_gate.passed : true;
            const lowConfidence = !!result.low_confidence || !gatePassed;
            console.log(
                `[Auto Metrics] rmse=${(result.rmse ?? 0).toFixed?.(4) ?? result.rmse}, ` +
                `fitness=${(result.fitness ?? 0).toFixed?.(4) ?? result.fitness}, ` +
                `overlap=${result.overlap}, center_dist=${result.center_dist}, ` +
                `gate_passed=${gatePassed}, low_confidence=${lowConfidence}`
            );

            if (lowConfidence) {
                showValidationMessage(
                    'Auto registration returned low-confidence alignment. Please run Refine ICP before saving.',
                    'warning'
                );
                alert(
                    `Auto Registration (Low Confidence)\n` +
                    `RMSE: ${(result.rmse ?? 0).toFixed(4)}\n` +
                    `Fitness: ${(result.fitness ?? 0).toFixed(4)}`
                );
            } else {
                alert(`Auto Registration Complete!\nRMSE: ${result.rmse.toFixed(4)}`);
            }

            // Switch to overlay view
            await switchToRegistrationOverlayView();
        } else {
            alert(`Auto Registration Failed: ${result.error || 'Unknown error'}`);
        }

    } catch (error) {
        console.error("Auto registration error:", error);
        alert("An error occurred during auto registration.");
        const msg = document.getElementById('autoRegProcessing');
        if (msg) msg.remove();
        const autoRegBtn = document.getElementById('autoRegBtn');
        if (autoRegBtn) autoRegBtn.disabled = false;
    }
}
