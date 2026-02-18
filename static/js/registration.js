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
let registrationQuality = {
    passed: false,
    low_confidence: true,
    metrics: null,
    context: 'none'
};
const semiAutoState = {
    pairs: [],
    coarseInit: null,
    diagnostics: null,
    previewSourceMarkers: [],
    previewTargetMarkers: [],
    profile: 'default',
    deviceProfile: 'standard',
    suggestionMode: 'correspondence_v3',
    thresholds: null
};
const semiAutoSessionMetrics = {
    startedAt: null,
    suggestCount: 0,
    acceptedPairs: 0,
    editedPairs: 0,
    reruns: 0,
    completed: 0,
    lastDurationSec: null
};

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
        semiAutoSessionMetrics.startedAt = null;
        semiAutoSessionMetrics.suggestCount = 0;
        semiAutoSessionMetrics.acceptedPairs = 0;
        semiAutoSessionMetrics.editedPairs = 0;
        semiAutoSessionMetrics.reruns = 0;
        semiAutoSessionMetrics.completed = 0;
        semiAutoSessionMetrics.lastDurationSec = null;
        updateSemiAutoAdaptiveHint('');
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
        semiAutoSessionMetrics.startedAt = null;
        semiAutoSessionMetrics.suggestCount = 0;
        semiAutoSessionMetrics.acceptedPairs = 0;
        semiAutoSessionMetrics.editedPairs = 0;
        semiAutoSessionMetrics.reruns = 0;
        semiAutoSessionMetrics.completed = 0;
        semiAutoSessionMetrics.lastDurationSec = null;
        updateSemiAutoAdaptiveHint('');
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

function updateFinishButtonGate(passed, reason = '') {
    const finishBtn = document.getElementById('finishRegBtn');
    if (!finishBtn) return;
    finishBtn.disabled = !passed;
    finishBtn.title = passed ? '' : (reason || 'Finish is blocked until quality gate passes.');
}

function setRegistrationQuality(result, context = 'unknown') {
    const gatePassed = result && result.quality_gate ? !!result.quality_gate.passed : false;
    const lowConfidence = !!(result && result.low_confidence);
    registrationQuality = {
        passed: gatePassed && !lowConfidence,
        low_confidence: lowConfidence,
        metrics: result || null,
        context
    };

    const info = document.getElementById('registrationResultInfo');
    if (info) {
        if (registrationQuality.passed) {
            info.style.borderColor = 'rgba(76, 175, 80, 0.3)';
            info.style.background = 'rgba(76, 175, 80, 0.1)';
            info.style.color = '#4caf50';
            info.innerHTML = '<strong>✓ Registration Passed Quality Gate</strong><p style="margin: 8px 0 0 0; font-size: 0.85rem;">Alignment quality is acceptable. You can finish and save.</p>';
        } else {
            info.style.borderColor = 'rgba(255, 193, 7, 0.35)';
            info.style.background = 'rgba(255, 193, 7, 0.12)';
            info.style.color = '#ffd166';
            info.innerHTML = `<strong>Quality Gate Failed (${context})</strong><p style="margin: 8px 0 0 0; font-size: 0.85rem;">Please add 1-2 more point pairs and re-run refine before finishing.</p>`;
        }
    }

    updateFinishButtonGate(registrationQuality.passed);
}

function getAdaptiveGuidance(result) {
    if (!result) return '';
    const overlap = Number(result.overlap || 0);
    const centerDist = Number(result.center_dist || 0);
    const rmse = Number(result.rmse || 0);
    if (overlap < 0.18) {
        return 'Hint: overlap is low. Add 1-2 pairs spread wider (left-right + front teeth).';
    }
    if (centerDist > 40) {
        return 'Hint: center distance is high. Add one front and one posterior landmark pair.';
    }
    if (rmse > 3.0) {
        return 'Hint: RMSE is high. Replace a noisy pair and prefer cusp/incisal points.';
    }
    return 'Hint: add one extra stable pair and re-run refine.';
}

function updateSemiAutoAdaptiveHint(text) {
    const el = document.getElementById('semiAutoAdaptiveHint');
    if (!el) return;
    el.textContent = text || '';
}

async function refreshSemiAutoMetricsBadge() {
    const badge = document.getElementById('semiAutoMetricsBadge');
    if (!badge || !selectedSource) return;
    const elapsed = semiAutoSessionMetrics.startedAt
        ? Math.max(0, Math.round((Date.now() - semiAutoSessionMetrics.startedAt) / 1000))
        : 0;

    let backend = null;
    try {
        const resp = await fetch(`${API_BASE}/patient/${encodeURIComponent(selectedSource.patient_id)}/register/metrics`);
        backend = await resp.json();
    } catch (e) {
        backend = null;
    }

    const lines = [
        `session reruns=${semiAutoSessionMetrics.reruns}, edits=${semiAutoSessionMetrics.editedPairs}, t=${elapsed}s`,
        `accepted=${semiAutoSessionMetrics.acceptedPairs}, success=${semiAutoSessionMetrics.completed}`
    ];
    if (backend && typeof backend.gate_pass_rate === 'number') {
        lines.push(`backend pass=${(backend.gate_pass_rate * 100).toFixed(1)}%, avg_rmse=${backend.avg_rmse ?? '-'}`);
    }
    badge.textContent = lines.join(' | ');
}

async function reportSemiAutoSession(lastGatePassed) {
    if (!selectedSource || !selectedTarget) return;
    try {
        await fetch(`${API_BASE}/patient/${encodeURIComponent(selectedSource.patient_id)}/register/semi_auto/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source_path: selectedSource.file_path,
                target_path: selectedTarget.file_path,
                profile: semiAutoState.profile,
                device_profile: semiAutoState.deviceProfile,
                suggest_count: semiAutoSessionMetrics.suggestCount,
                accepted_pairs: semiAutoSessionMetrics.acceptedPairs,
                edited_pairs: semiAutoSessionMetrics.editedPairs,
                reruns: semiAutoSessionMetrics.reruns,
                completed: semiAutoSessionMetrics.completed,
                time_to_finish_sec: semiAutoSessionMetrics.lastDurationSec,
                last_gate_passed: !!lastGatePassed
            })
        });
    } catch (e) {
        // best-effort telemetry
    }
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
            registrationQuality = { passed: false, low_confidence: true, metrics: null, context: 'swap' };
            updateFinishButtonGate(false, 'Run registration again after swapping models.');

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
    clearSemiAutoPreviewMarkers();
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
        updateFinishButtonGate(registrationQuality.passed, 'Finish is blocked until quality gate passes.');

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
                // Create clean clone without marker children from split-view.
                const targetMaterial = Array.isArray(targetMesh.material)
                    ? targetMesh.material.map(m => (m && typeof m.clone === 'function') ? m.clone() : m)
                    : (targetMesh.material && typeof targetMesh.material.clone === 'function'
                        ? targetMesh.material.clone()
                        : targetMesh.material);
                const targetClone = new THREE.Mesh(targetMesh.geometry, targetMaterial);
                // Reset Rotation (crucial, as user might have rotated it)
                targetClone.rotation.set(0, 0, 0);
                // Reset Scale (it was scaled by S)
                targetClone.scale.setScalar(1);
                // Move Position to C (effectively undoing the geometry translation -C)
                if (targetViewer.modelCenter) {
                    targetClone.position.copy(targetViewer.modelCenter);
                }

                // SOURCE MESH (Transformed)
                const sourceMaterial = Array.isArray(sourceMesh.material)
                    ? sourceMesh.material.map(m => (m && typeof m.clone === 'function') ? m.clone() : m)
                    : (sourceMesh.material && typeof sourceMesh.material.clone === 'function'
                        ? sourceMesh.material.clone()
                        : sourceMesh.material);
                const sourceClone = new THREE.Mesh(sourceMesh.geometry, sourceMaterial);
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

                // Add to registration viewer's unified rotation group
                if (registrationViewer.scene && registrationViewer.rotationGroup) {
                    // Clear previous group children
                    while (registrationViewer.rotationGroup.children.length > 0) {
                        registrationViewer.rotationGroup.remove(registrationViewer.rotationGroup.children[0]);
                    }

                    // --- Fix Rotation Pivot (REG-02.3) ---
                    // By default, the group rotates around (0,0,0). 
                    // If models are far from origin, they "orbit" instead of rotating in place.
                    // Solution: Position the group at the model center, and offset the meshes locally.
                    const pivot = targetViewer.modelCenter.clone();

                    registrationViewer.rotationGroup.position.copy(pivot);
                    registrationViewer.rotationGroup.rotation.set(0, 0, 0); // Reset for new registration

                    // Adjust mesh positions to be relative to the group center (pivot)
                    targetClone.position.sub(pivot); // Effectively (0,0,0) locally
                    sourceClone.position.sub(pivot); // Transformed position relative to target center

                    registrationViewer.rotationGroup.add(sourceClone);
                    registrationViewer.rotationGroup.add(targetClone);

                    // Update references
                    registrationViewer.sourceMesh = sourceClone;
                    registrationViewer.targetMesh = targetClone;

                    // Set visual properties
                    sourceClone.visible = true;
                    targetClone.visible = true;
                    if (sourceClone.material) sourceClone.material.opacity = 0.8;
                    if (targetClone.material) targetClone.material.opacity = 0.6;

                    // Fit camera to show the restored world-space models
                    registrationViewer.fitCameraToObjects();

                    console.log('✓ Models added to unified rotation group with centered pivot');
                    showValidationMessage('Registration complete! Rotating models as a unit.', 'success');
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

        // Enable Manual Registration button
        const manualRegBtn = document.getElementById('manualRegBtn');
        if (manualRegBtn) manualRegBtn.disabled = false;
        const semiAutoRegBtn = document.getElementById('semiAutoRegBtn');
        if (semiAutoRegBtn) semiAutoRegBtn.disabled = false;
        await loadSemiAutoProfileOptions();
        registrationQuality = { passed: false, low_confidence: true, metrics: null, context: 'viewer_loaded' };
        updateFinishButtonGate(false, 'Run Semi-Auto/Refine and pass quality gate.');

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
    const semiAutoRegBtn = document.getElementById('semiAutoRegBtn');
    const manualModal = document.getElementById('manualRegModal');
    const closeManual = document.getElementById('closeManualModalBtn');
    const enterPickModeBtn = document.getElementById('enterPickModeBtn');
    const clearPointsBtn = document.getElementById('clearPointsBtn');
    const computeTransformBtn = document.getElementById('computeTransformBtn');
    const previewTransformBtn = document.getElementById('previewTransformBtn');
    const acceptTransformBtn = document.getElementById('acceptTransformBtn');

    // Disable manual reg button initially
    if (manualRegBtn) manualRegBtn.disabled = true;
    if (semiAutoRegBtn) semiAutoRegBtn.disabled = true;

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
            setRegistrationQuality({ low_confidence: true, quality_gate: { passed: false } }, 'manual_coarse');

            // Explicitly log the Coarse (Manual) RMSE as requested
            console.log('=== MANUAL REGISTRATION RESULTS ===');
            console.log(`RMSE (Coarse): ${result.rmse.toFixed(4)}`);
            if (typeof result.inlier_count === 'number') {
                console.log(`Inliers: ${result.inlier_count}/${result.total_points}`);
            }
            console.log('===================================');

            // Step 2: Auto refine immediately using coarse init
            const refineResp = await fetch(`${API_BASE}/patient/${encodeURIComponent(selectedSource.patient_id)}/register/icp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_path: selectedSource.file_path,
                    target_path: selectedTarget.file_path,
                    rotation: manualState.transform.rotation,
                    translation: manualState.transform.translation,
                    flow: 'manual_compute_auto_refine',
                    profile: semiAutoState.profile,
                    device_profile: semiAutoState.deviceProfile
                })
            });
            const refined = await refineResp.json();
            if (!refineResp.ok) throw new Error(refined.error || 'Refine after manual compute failed');

            const gatePassed = refined.quality_gate ? !!refined.quality_gate.passed : false;
            const lowConfidence = !!refined.low_confidence || !gatePassed;

            manualState.transform = {
                rotation: refined.rotation,
                translation: refined.translation,
                rmse: refined.rmse
            };
            setRegistrationQuality(refined, 'manual_refine');

            if (lowConfidence) {
                // Show current best candidate in overlay (for inspection), but keep Finish blocked by gate.
                computeBtn.textContent = originalText;
                computeBtn.disabled = false;
                const manualModal = document.getElementById('manualRegModal');
                if (manualModal) manualModal.style.display = 'none';
                exitPickMode();
                if (manualModal) manualModal.style.display = 'none';
                await switchToRegistrationOverlayView();
                showValidationMessage(
                    `Refine gate failed after manual points. RMSE=${(refined.rmse || 0).toFixed(3)}, overlap=${((refined.overlap || 0) * 100).toFixed(1)}%. Candidate shown; add 1-2 more pairs and refine again.`,
                    'warning'
                );
                updateSemiAutoAdaptiveHint(getAdaptiveGuidance(refined));
                return;
            }

            // Step 3: Save only when refined gate passes.
            const applyResp = await fetch(`${API_BASE}/patient/${encodeURIComponent(selectedSource.patient_id)}/register/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_path: selectedSource.file_path,
                    rotation: refined.rotation,
                    translation: refined.translation
                })
            });
            const applyResult = await applyResp.json();
            if (!applyResp.ok) throw new Error(applyResult.error || 'Save failed');

            // Restore button state
            computeBtn.textContent = originalText;
            computeBtn.disabled = true;

            // Close modal and switch to combined overlay view
            const manualModal = document.getElementById('manualRegModal');
            if (manualModal) manualModal.style.display = 'none';
            exitPickMode();
            await switchToRegistrationOverlayView();
            clearManualPoints();
            updateSemiAutoAdaptiveHint('');
            showValidationMessage(`Manual+Refine passed. RMSE=${(refined.rmse || 0).toFixed(3)}`, 'success');

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
            splitViewViewer.sourceViewer.removeMarker(marker);
        }

        const list = document.getElementById('sourcePointsList');
        if (list.lastElementChild) list.removeChild(list.lastElementChild);

        showValidationMessage('Undid last Source point', 'info');
    } else {
        manualState.targetPoints.pop();
        const marker = manualState.targetMarkers.pop();
        if (marker && splitViewViewer && splitViewViewer.targetViewer) {
            splitViewViewer.targetViewer.removeMarker(marker);
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

function clearManualPoints() {
    manualState.sourcePoints = [];
    manualState.targetPoints = [];
    manualState.sourceMarkers = [];
    manualState.targetMarkers = [];
    manualState.previewApplied = false;
    manualState.originalSourceMatrix = null;
    // DON'T clear transform - it's needed for ICP refinement!
    // manualState.transform = null;

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

function renderSemiAutoPairsModal() {
    const container = document.getElementById('semiAutoPairsList');
    const diag = document.getElementById('semiAutoDiagnostics');
    if (!container || !diag) return;

    const d = semiAutoState.diagnostics || {};
    const top = Array.isArray(d.top_candidates) ? d.top_candidates.slice(0, 3) : [];
    const topTxt = top.length
        ? `\nTop: ` + top.map((x, i) => `${i + 1}) ${Number(x.score || 0).toFixed(3)} ${x.reason || ''}`).join(' | ')
        : '';
    const t = semiAutoState.thresholds || {};
    diag.textContent =
        `ROI: ${d.roi_mode || '-'} | attempts: ${d.attempt_count || '-'} | strategy: ${(semiAutoState.coarseInit && semiAutoState.coarseInit.strategy) || '-'}\n` +
        `profile=${semiAutoState.profile} | device=${semiAutoState.deviceProfile} | mode=${semiAutoState.suggestionMode} | gate(rmse<=${t.rmse_max ?? '-'}, overlap>=${t.overlap_min ?? '-'})${topTxt}`;

    container.innerHTML = '';
    semiAutoState.pairs.forEach((pair, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:start;padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);';
        row.innerHTML = `
            <input type="checkbox" class="semi-pair-keep" data-index="${idx}" checked />
            <div>
                <div style="font-weight:600;">Pair #${idx + 1} (conf ${(pair.confidence ?? 0).toFixed(2)})</div>
                <div style="font-size:12px;color:#ccc;">S: (${pair.source_point.map(v => Number(v).toFixed(2)).join(', ')})</div>
                <div style="font-size:12px;color:#ccc;">T: (${pair.target_point.map(v => Number(v).toFixed(2)).join(', ')})</div>
            </div>
            <button class="btn btn-small semi-pair-remove" data-index="${idx}" style="padding:4px 8px;">Delete</button>
        `;
        container.appendChild(row);
    });

    container.querySelectorAll('.semi-pair-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.dataset.index, 10);
            semiAutoState.pairs.splice(index, 1);
            semiAutoSessionMetrics.editedPairs += 1;
            renderSemiAutoPairsModal();
            refreshSemiAutoMetricsBadge();
        });
    });
}

function clearSemiAutoPreviewMarkers() {
    if (!splitViewViewer || !splitViewViewer.sourceViewer || !splitViewViewer.targetViewer) return;
    semiAutoState.previewSourceMarkers.forEach(m => splitViewViewer.sourceViewer.removeMarker(m));
    semiAutoState.previewTargetMarkers.forEach(m => splitViewViewer.targetViewer.removeMarker(m));
    semiAutoState.previewSourceMarkers = [];
    semiAutoState.previewTargetMarkers = [];
}

function addSuggestMarkerSafe(viewer, pointVec3, color, label, options = {}) {
    if (!viewer) return null;
    if (options.pinned && typeof viewer.addPinnedDot === 'function') {
        return viewer.addPinnedDot(pointVec3, color, 0.02);
    }
    const manualStyle = !!options.manualStyle;
    // Keep semi-auto visualization identical to manual picking marker style when requested.
    if (manualStyle && typeof viewer.addMarker === 'function') {
        return viewer.addMarker(pointVec3, color, label);
    }
    if (typeof viewer.addStableMarker === 'function') {
        return viewer.addStableMarker(pointVec3, color, label);
    }
    // Backward-compatible fallback if browser cached old splitViewViewer.js.
    return viewer.addMarker(pointVec3, color, label);
}

function enhanceSuggestMarkerVisibility(marker, viewer = null) {
    if (!marker) return;
    // Force marker to be mesh-anchored (guards against legacy/cached scene-attached markers).
    if (viewer && viewer.mesh && marker.userData && marker.userData.localPos) {
        if (marker.parent !== viewer.mesh) {
            const lp = marker.userData.localPos.clone ? marker.userData.localPos.clone() : new THREE.Vector3(
                Number(marker.userData.localPos.x || 0),
                Number(marker.userData.localPos.y || 0),
                Number(marker.userData.localPos.z || 0)
            );
            if (marker.parent) marker.parent.remove(marker);
            marker.position.copy(lp);
            viewer.mesh.add(marker);
        }
    }
    marker.renderOrder = 1200;
    marker.userData.pixelRadius = Math.max(10, Number(marker.userData.pixelRadius || 0));
    marker.userData.labelPixelSize = Math.max(24, Number(marker.userData.labelPixelSize || 0));
    if (marker.material) {
        marker.material.opacity = 1.0;
        marker.material.transparent = true;
        marker.material.depthTest = false;
        marker.material.depthWrite = false;
    }
    if (marker.children && marker.children.length) {
        marker.children.forEach((c) => {
            if (c && c.material) {
                c.renderOrder = 1201;
                c.material.opacity = 1.0;
                c.material.transparent = true;
                c.material.depthTest = false;
                c.material.depthWrite = false;
            }
        });
    }
}

function showSemiAutoPreviewMarkers() {
    if (!splitViewViewer || !splitViewViewer.sourceViewer || !splitViewViewer.targetViewer) return;
    clearSemiAutoPreviewMarkers();
    semiAutoState.pairs.forEach((pair, i) => {
        const label = `S${i + 1}`;
        const sRaw = pair.source_point.map(Number);
        const tRaw = pair.target_point.map(Number);
        const sSnap = splitViewViewer.sourceViewer.snapToSurface(
            new THREE.Vector3(sRaw[0], sRaw[1], sRaw[2]),
            3000000,
            true
        );
        const tSnap = splitViewViewer.targetViewer.snapToSurface(
            new THREE.Vector3(tRaw[0], tRaw[1], tRaw[2]),
            3000000,
            true
        );
        const s = [sSnap.x, sSnap.y, sSnap.z];
        const t = [tSnap.x, tSnap.y, tSnap.z];
        pair.source_point = s;
        pair.target_point = t;
        const sMarker = addSuggestMarkerSafe(
            splitViewViewer.sourceViewer,
            new THREE.Vector3(s[0], s[1], s[2]),
            0xffc107,
            null,
            { manualStyle: true }
        );
        const tMarker = addSuggestMarkerSafe(
            splitViewViewer.targetViewer,
            new THREE.Vector3(t[0], t[1], t[2]),
            0x5eead4,
            null,
            { manualStyle: true }
        );
        enhanceSuggestMarkerVisibility(sMarker, splitViewViewer.sourceViewer);
        enhanceSuggestMarkerVisibility(tMarker, splitViewViewer.targetViewer);
        semiAutoState.previewSourceMarkers.push(sMarker);
        semiAutoState.previewTargetMarkers.push(tMarker);
    });
    console.log(`[SemiAuto] preview markers source=${semiAutoState.previewSourceMarkers.length}, target=${semiAutoState.previewTargetMarkers.length}`);
}

function getSemiAutoAcceptedPairs() {
    const checks = document.querySelectorAll('#semiAutoPairsList .semi-pair-keep');
    const accepted = [];
    checks.forEach(chk => {
        if (chk.checked) {
            const i = parseInt(chk.dataset.index, 10);
            if (semiAutoState.pairs[i]) accepted.push(semiAutoState.pairs[i]);
        }
    });
    return accepted;
}

function loadPairsIntoManualEditor(pairs) {
    clearManualPoints();
    const sList = document.getElementById('sourcePointsList');
    const tList = document.getElementById('targetPointsList');

    pairs.forEach((pair, i) => {
        const sRaw = pair.source_point.map(Number);
        const tRaw = pair.target_point.map(Number);
        const sSnap = splitViewViewer && splitViewViewer.sourceViewer
            ? splitViewViewer.sourceViewer.snapToSurface(new THREE.Vector3(sRaw[0], sRaw[1], sRaw[2]), 3000000, true)
            : new THREE.Vector3(sRaw[0], sRaw[1], sRaw[2]);
        const tSnap = splitViewViewer && splitViewViewer.targetViewer
            ? splitViewViewer.targetViewer.snapToSurface(new THREE.Vector3(tRaw[0], tRaw[1], tRaw[2]), 3000000, true)
            : new THREE.Vector3(tRaw[0], tRaw[1], tRaw[2]);
        const s = [sSnap.x, sSnap.y, sSnap.z];
        const t = [tSnap.x, tSnap.y, tSnap.z];
        pair.source_point = s;
        pair.target_point = t;
        manualState.sourcePoints.push(s);
        manualState.targetPoints.push(t);

        const sLi = document.createElement('li');
        sLi.textContent = `(${s.map(v => v.toFixed(3)).join(', ')})`;
        sList.appendChild(sLi);
        const tLi = document.createElement('li');
        tLi.textContent = `(${t.map(v => v.toFixed(3)).join(', ')})`;
        tList.appendChild(tLi);

        if (splitViewViewer && splitViewViewer.sourceViewer && splitViewViewer.targetViewer) {
            const label = String(i + 1);
            manualState.sourceMarkers.push(
                addSuggestMarkerSafe(
                    splitViewViewer.sourceViewer,
                    new THREE.Vector3(s[0], s[1], s[2]),
                    0xff0000,
                    label,
                    { manualStyle: true }
                )
            );
            manualState.targetMarkers.push(
                addSuggestMarkerSafe(
                    splitViewViewer.targetViewer,
                    new THREE.Vector3(t[0], t[1], t[2]),
                    0x00ff00,
                    label,
                    { manualStyle: true }
                )
            );
        }
    });

    updatePickOverlayCounts();
    const computeBtn = document.getElementById('computeTransformBtn');
    if (computeBtn) computeBtn.disabled = pairs.length < 3;
}

async function runSemiAutoPipeline(acceptedPairs) {
    const sourcePatientId = encodeURIComponent(selectedSource.patient_id);
    semiAutoSessionMetrics.reruns += 1;
    semiAutoSessionMetrics.acceptedPairs = acceptedPairs.length;
    await refreshSemiAutoMetricsBadge();

    // Step 1: coarse transform from accepted pairs.
    const coarseResp = await fetch(`${API_BASE}/patient/${sourcePatientId}/register/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            source_points: acceptedPairs.map(p => p.source_point),
            target_points: acceptedPairs.map(p => p.target_point)
        })
    });
    const coarse = await coarseResp.json();
    if (!coarseResp.ok) throw new Error(coarse.error || 'Semi-auto coarse transform failed');

    manualState.transform = {
        rotation: coarse.rotation,
        translation: coarse.translation,
        rmse: coarse.rmse
    };

    // Step 2: auto refine with ICP from coarse init.
    const refineResp = await fetch(`${API_BASE}/patient/${sourcePatientId}/register/icp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            source_path: selectedSource.file_path,
            target_path: selectedTarget.file_path,
            rotation: coarse.rotation,
            translation: coarse.translation,
            flow: 'semi_auto',
            profile: semiAutoState.profile,
            device_profile: semiAutoState.deviceProfile
        })
    });
    const refined = await refineResp.json();
    if (!refineResp.ok) throw new Error(refined.error || 'Semi-auto refine failed');

    const gatePassed = refined.quality_gate ? !!refined.quality_gate.passed : false;
    const lowConfidence = !!refined.low_confidence;

    manualState.transform = {
        rotation: refined.rotation,
        translation: refined.translation,
        rmse: refined.rmse
    };
    setRegistrationQuality(refined, 'semi_auto');

    if (!gatePassed || lowConfidence) {
        const msg = `Semi-auto gate failed. RMSE=${(refined.rmse || 0).toFixed(3)}, overlap=${((refined.overlap || 0) * 100).toFixed(1)}%. Add 1-2 pairs and re-run.`;
        showValidationMessage(msg, 'warning');
        updateSemiAutoAdaptiveHint(getAdaptiveGuidance(refined));
        loadPairsIntoManualEditor(acceptedPairs);
        const manualModal = document.getElementById('manualRegModal');
        if (manualModal) manualModal.style.display = 'block';
        await reportSemiAutoSession(false);
        await refreshSemiAutoMetricsBadge();
        return { passed: false, refined };
    }

    // Step 3: save only when gate passes.
    const applyResp = await fetch(`${API_BASE}/patient/${sourcePatientId}/register/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            source_path: selectedSource.file_path,
            rotation: refined.rotation,
            translation: refined.translation
        })
    });
    const applyResult = await applyResp.json();
    if (!applyResp.ok) throw new Error(applyResult.error || 'Save refined alignment failed');

    await switchToRegistrationOverlayView();
    semiAutoSessionMetrics.completed += 1;
    if (semiAutoSessionMetrics.startedAt) {
        semiAutoSessionMetrics.lastDurationSec = Math.max(0, Math.round((Date.now() - semiAutoSessionMetrics.startedAt) / 1000));
    }
    updateSemiAutoAdaptiveHint('');
    await reportSemiAutoSession(true);
    await refreshSemiAutoMetricsBadge();
    showValidationMessage(
        `Semi-auto passed. RMSE=${(refined.rmse || 0).toFixed(3)}, overlap=${((refined.overlap || 0) * 100).toFixed(1)}%.`,
        'success'
    );
    return { passed: true, refined };
}

async function loadSemiAutoProfileOptions() {
    const profileSelect = document.getElementById('semiAutoProfileSelect');
    const deviceSelect = document.getElementById('semiAutoDeviceProfile');
    if (!profileSelect || !deviceSelect || !selectedSource) return;
    try {
        const resp = await fetch(`${API_BASE}/patient/${encodeURIComponent(selectedSource.patient_id)}/register/semi_auto/profiles`);
        const data = await resp.json();
        if (!resp.ok) return;

        const profiles = data.profiles || {};
        const devices = data.device_profiles || {};
        profileSelect.innerHTML = '';
        Object.keys(profiles).forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = k;
            profileSelect.appendChild(opt);
        });
        deviceSelect.innerHTML = '';
        Object.keys(devices).forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = k;
            deviceSelect.appendChild(opt);
        });
        if (profiles[semiAutoState.profile]) profileSelect.value = semiAutoState.profile;
        if (devices[semiAutoState.deviceProfile]) deviceSelect.value = semiAutoState.deviceProfile;
    } catch (e) {
        // fallback to static options in HTML
    }
}

function setupSemiAutoUI() {
    const semiBtn = document.getElementById('semiAutoRegBtn');
    const semiModal = document.getElementById('semiAutoModal');
    const semiToggleBtn = document.getElementById('semiAutoToggleBtn');
    const closeBtn = document.getElementById('semiAutoCloseBtn');
    const runBtn = document.getElementById('semiAutoRunBtn');
    const editBtn = document.getElementById('semiAutoEditManualBtn');
    const deviceSelect = document.getElementById('semiAutoDeviceProfile');
    const profileSelect = document.getElementById('semiAutoProfileSelect');
    const modeSelect = document.getElementById('semiAutoSuggestionMode');
    const numPairsSelect = document.getElementById('semiAutoNumPairs');
    if (!semiBtn || !semiModal || !semiToggleBtn || !closeBtn || !runBtn || !editBtn || !profileSelect || !modeSelect || !numPairsSelect || !deviceSelect) return;

    const setSemiPanelMinimized = (minimized) => {
        semiModal.classList.toggle('minimized', !!minimized);
        semiToggleBtn.textContent = minimized ? 'Expand' : 'Minimize';
    };
    semiToggleBtn.addEventListener('click', () => {
        setSemiPanelMinimized(!semiModal.classList.contains('minimized'));
    });

    profileSelect.addEventListener('change', () => {
        semiAutoState.profile = profileSelect.value;
    });
    modeSelect.addEventListener('change', () => {
        semiAutoState.suggestionMode = modeSelect.value;
    });
    deviceSelect.addEventListener('change', () => {
        semiAutoState.deviceProfile = deviceSelect.value;
    });

    semiBtn.addEventListener('click', async () => {
        if (!selectedSource || !selectedTarget) {
            showValidationMessage('Please select source and target models first.', 'warning');
            return;
        }
        if (!semiAutoSessionMetrics.startedAt) semiAutoSessionMetrics.startedAt = Date.now();
        semiAutoSessionMetrics.suggestCount += 1;
        updateSemiAutoAdaptiveHint('');
        await refreshSemiAutoMetricsBadge();

        semiBtn.disabled = true;
        const original = semiBtn.textContent;
        semiBtn.textContent = 'Suggesting...';
        try {
            const resp = await fetch(`${API_BASE}/patient/${encodeURIComponent(selectedSource.patient_id)}/register/semi_auto/suggest_points`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_path: selectedSource.file_path,
                    target_path: selectedTarget.file_path,
                    force_mouth_roi: true,
                    num_pairs: parseInt(numPairsSelect.value, 10) || 3,
                    profile: semiAutoState.profile,
                    suggestion_mode: semiAutoState.suggestionMode,
                    device_profile: semiAutoState.deviceProfile
                })
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.error || 'Suggest points failed');

            semiAutoState.pairs = Array.isArray(result.pairs) ? result.pairs : [];
            semiAutoState.coarseInit = result.coarse_init || null;
            semiAutoState.diagnostics = result.diagnostics || null;
            semiAutoState.profile = result.profile || semiAutoState.profile;
            semiAutoState.deviceProfile = result.device_profile || semiAutoState.deviceProfile;
            semiAutoState.thresholds = result.thresholds || null;
            profileSelect.value = semiAutoState.profile;
            deviceSelect.value = semiAutoState.deviceProfile;
            renderSemiAutoPairsModal();
            showSemiAutoPreviewMarkers();
            setSemiPanelMinimized(false);
            semiModal.style.display = 'block';
            await refreshSemiAutoMetricsBadge();
        } catch (err) {
            showValidationMessage(`Semi-auto suggest failed: ${err.message}`, 'error');
        } finally {
            semiBtn.disabled = false;
            semiBtn.textContent = original;
        }
    });

    closeBtn.addEventListener('click', () => {
        semiModal.style.display = 'none';
        clearSemiAutoPreviewMarkers();
        setSemiPanelMinimized(false);
    });

    editBtn.addEventListener('click', () => {
        const accepted = getSemiAutoAcceptedPairs();
        if (accepted.length < 3) {
            alert('Keep at least 3 point pairs.');
            return;
        }
        semiAutoSessionMetrics.acceptedPairs = accepted.length;
        semiAutoSessionMetrics.editedPairs += Math.max(0, semiAutoState.pairs.length - accepted.length);
        refreshSemiAutoMetricsBadge();
        loadPairsIntoManualEditor(accepted);
        semiModal.style.display = 'none';
        clearSemiAutoPreviewMarkers();
        const manualModal = document.getElementById('manualRegModal');
        if (manualModal) manualModal.style.display = 'block';
    });

    runBtn.addEventListener('click', async () => {
        const accepted = getSemiAutoAcceptedPairs();
        if (accepted.length < 3) {
            alert('Keep at least 3 point pairs to run Semi-Auto.');
            return;
        }
        semiAutoSessionMetrics.acceptedPairs = accepted.length;
        semiAutoSessionMetrics.editedPairs += Math.max(0, semiAutoState.pairs.length - accepted.length);

        const original = runBtn.textContent;
        runBtn.disabled = true;
        runBtn.textContent = 'Running...';
        try {
            const runResult = await runSemiAutoPipeline(accepted);
            if (runResult && runResult.passed) {
                semiModal.style.display = 'none';
                clearSemiAutoPreviewMarkers();
            }
        } catch (err) {
            showValidationMessage(`Semi-auto failed: ${err.message}`, 'error');
        } finally {
            runBtn.disabled = false;
            runBtn.textContent = original;
        }
    });
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
                        translation: manualState.transform.translation,
                        flow: 'manual_refine',
                        profile: semiAutoState.profile,
                        device_profile: semiAutoState.deviceProfile
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
                    const gatePassed = result.quality_gate ? !!result.quality_gate.passed : ((result.rmse || 999) <= 3.0);
                    const lowConfidence = !!result.low_confidence || !gatePassed;

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
                        rmse: result.rmse
                    };
                    setRegistrationQuality(result, 'refine_icp');

                    console.log('Refinement successful:', result);
                    if (lowConfidence) {
                        showValidationMessage(
                            `Refine gate failed. RMSE=${rmse_after.toFixed(3)}, overlap=${((result.overlap || 0) * 100).toFixed(1)}%. Add more point pairs.`,
                            'warning'
                        );
                        reportSemiAutoSession(false);
                        updateSemiAutoAdaptiveHint(getAdaptiveGuidance(result));
                        refreshSemiAutoMetricsBadge();
                        return;
                    }
                    updateSemiAutoAdaptiveHint('');
                    reportSemiAutoSession(true);
                    showValidationMessage(`Refined! RMSE: ${rmse_before.toFixed(3)} -> ${rmse_after.toFixed(3)} (${improvement}% better)`, 'success');

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
            if (!registrationQuality.passed) {
                showValidationMessage('Finish blocked: alignment did not pass quality gate yet.', 'warning');
                return;
            }
            showValidationMessage('Registration results saved successfully!', 'success');
            // Could navigate to next step or show more options here
        });
    }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
    initRegistration();
    setupManualRegistrationUI();
    setupSemiAutoUI();
    setupOverlayControls();
    updateFinishButtonGate(false, 'Run Semi-Auto/Refine and pass quality gate.');
});


