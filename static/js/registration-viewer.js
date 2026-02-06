// Registration Overlay Viewer using Three.js
// Handles REG-02: Initialize Single Overlay Viewer

class RegistrationViewer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        // Meshes
        this.sourceMesh = null;
        this.targetMesh = null;
        this.rotationGroup = new THREE.Group(); // New group for unified rotation

        // Mouse interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.selectedModel = null; // 'source' or 'target'
        this.isDragging = false;
        this.previousMousePosition = { x: 0, y: 0 };
        this.rotationSpeed = 0.01;

        // State
        this.cameraPresets = {
            isometric: { posDir: [1, 1, 1] },
            front: { posDir: [0, 0, 1] },
            top: { posDir: [0, 1, 0] },
            left: { posDir: [-1, 0, 0] },
            fitAll: null // Computed dynamically
        };

        this.init();
    }

    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        this.scene.add(this.rotationGroup); // Add group to scene

        // Get canvas dimensions
        let width = this.canvas.clientWidth || this.canvas.parentElement.clientWidth || 800;
        let height = this.canvas.clientHeight || this.canvas.parentElement.clientHeight || 600;

        if (width === 0) width = 800;
        if (height === 0) height = 600;

        // Create camera
        // Create camera
        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 50000);
        this.camera.position.set(50, 50, 50);
        this.camera.lookAt(0, 0, 0);

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            logarithmicDepthBuffer: true // Helps with large depth ranges
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Headlight (attached to camera)
        this.camera.add(new THREE.PointLight(0xffffff, 0.8));
        this.scene.add(this.camera); // Important: add camera to scene for headlight to work

        // Additional Directional Light for shape definition
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
        dirLight.position.set(0, 100, 100);
        this.scene.add(dirLight);

        // Add orbit controls (disabled by default when rotating models)
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;

        // Setup mouse interaction
        this.setupMouseInteraction();

        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());

        // Start animation loop
        this.animate();
    }

    setupMouseInteraction() {
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.onMouseLeave(e));
    }

    onMouseDown(event) {
        // Calculate mouse position in normalized device coordinates
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / this.canvas.clientWidth) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / this.canvas.clientHeight) * 2 + 1;

        // Get objects intersecting the picking ray
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const meshes = [];
        if (this.sourceMesh) meshes.push(this.sourceMesh);
        if (this.targetMesh) meshes.push(this.targetMesh);

        const intersects = this.raycaster.intersectObjects(meshes);

        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;

            // Determine which model was clicked
            if (clickedMesh === this.sourceMesh) {
                this.selectedModel = 'source';
            } else if (clickedMesh === this.targetMesh) {
                this.selectedModel = 'target';
            }

            this.isDragging = true;
            this.previousMousePosition = { x: event.clientX, y: event.clientY };

            // Disable camera controls when rotating a model
            this.controls.enabled = false;

            // Visual feedback - highlight selected model
            this.updateModelHighlight();
        }
    }

    onMouseMove(event) {
        if (!this.isDragging) return;

        const deltaX = event.clientX - this.previousMousePosition.x;
        const deltaY = event.clientY - this.previousMousePosition.y;

        // REG-02.3 Fix: Rotate unified group instead of individual models
        if (this.rotationGroup) {
            this.rotationGroup.rotation.y += deltaX * this.rotationSpeed;
            this.rotationGroup.rotation.x += deltaY * this.rotationSpeed;
        }

        this.previousMousePosition = { x: event.clientX, y: event.clientY };
    }

    onMouseUp(event) {
        this.isDragging = false;

        // Re-enable camera controls
        this.controls.enabled = true;

        // Remove highlight
        this.updateModelHighlight();
    }

    onMouseLeave(event) {
        this.isDragging = false;
        this.selectedModel = null;
        this.controls.enabled = true;
        this.updateModelHighlight();
    }

    updateModelHighlight() {
        // Highlight unified group or individual models? 
        // For unified rotation, we can highlight the group if needed
    }

    // REG-01.6 & REG-02.1: Load both source and target models
    async loadSourceAndTarget(sourceUrl, targetUrl, sourceType, targetType) {
        try {
            console.log('Loading source and target models...');

            // Load source model (colored, movable)
            this.sourceMesh = await this.loadModel(sourceUrl, sourceType, 'source');

            // Load target model (gray, fixed)
            this.targetMesh = await this.loadModel(targetUrl, targetType, 'target');

            // Position meshes
            this.positionMeshes();

            console.log('Both models loaded successfully');
            return true;
        } catch (error) {
            console.error('Error loading models:', error);
            throw error;
        }
    }

    async loadModel(url, type, role) {
        try {
            let geometry;

            if (type === 'ply') {
                const loader = new THREE.PLYLoader();
                geometry = await new Promise((resolve, reject) => {
                    loader.load(url, resolve, undefined, reject);
                });
            } else if (type === 'stl') {
                const loader = new THREE.STLLoader();
                geometry = await new Promise((resolve, reject) => {
                    loader.load(url, resolve, undefined, reject);
                });
            }

            geometry.computeVertexNormals();

            // Create material based on role
            let material;
            if (role === 'source') {
                // Source: use original vertex colors from file
                if (geometry.attributes.color) {
                    material = new THREE.MeshPhongMaterial({
                        vertexColors: true,
                        specular: 0x111111,
                        shininess: 200,
                        flatShading: false,
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 1.0
                    });
                } else {
                    // Use neutral light gray if no colors in file
                    material = new THREE.MeshPhongMaterial({
                        color: 0xcccccc,
                        specular: 0x111111,
                        shininess: 200,
                        flatShading: false,
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 1.0
                    });
                }
            } else if (role === 'target') {
                // Target: use original vertex colors from file
                if (geometry.attributes.color) {
                    material = new THREE.MeshPhongMaterial({
                        vertexColors: true,
                        specular: 0x111111,
                        shininess: 200,
                        flatShading: false,
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 1.0
                    });
                } else {
                    // Use neutral light gray if no colors in file
                    material = new THREE.MeshPhongMaterial({
                        color: 0xcccccc,
                        specular: 0x111111,
                        shininess: 200,
                        flatShading: false,
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 1.0
                    });
                }
            }

            const mesh = new THREE.Mesh(geometry, material);
            this.centerAndScaleMesh(mesh);
            this.scene.add(mesh);

            return mesh;
        } catch (error) {
            console.error(`Error loading ${role} model:`, error);
            throw error;
        }
    }

    generateGradientColors(geometry) {
        const positionAttribute = geometry.getAttribute('position');
        const colors = [];
        const color = new THREE.Color();

        for (let i = 0; i < positionAttribute.count; i++) {
            const y = positionAttribute.getY(i);
            const hue = 0.5 + (y * 0.3);
            color.setHSL(hue, 0.7, 0.6);
            colors.push(color.r, color.g, color.b);
        }

        return colors;
    }

    centerAndScaleMesh(mesh) {
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);

        mesh.geometry.translate(-center.x, -center.y, -center.z);

        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 3 / maxDim;
        mesh.scale.setScalar(scale);

        mesh.geometry.computeBoundingBox();
    }

    positionMeshes() {
        // Position source and target side by side for visibility
        if (this.sourceMesh) {
            this.sourceMesh.position.set(-2, 0, 0);
        }
        if (this.targetMesh) {
            this.targetMesh.position.set(2, 0, 0);
        }

        this.fitCameraToObjects();
    }

    fitCameraToObjects() {
        if (!this.rotationGroup) return;

        // Ensure all world matrices are up to date before computing bounding box
        this.scene.updateMatrixWorld(true);

        const box = new THREE.Box3();
        // Use setFromObject on the group to get the collective world-space bounding box
        box.setFromObject(this.rotationGroup);

        if (box.isEmpty()) {
            console.warn('fitCameraToObjects: Bounding box is empty');
            return;
        }

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        const distance = maxDim * 2;

        // Position camera to see everything
        this.camera.position.set(
            center.x + distance,
            center.y + distance,
            center.z + distance
        );

        // Crucial: Update OrbitControls target so mouse rotation happens around the models
        this.controls.target.copy(center);
        this.camera.lookAt(center);

        this.controls.update();

        console.log('Camera fitted to models. Center:', center, 'Distance:', distance);
    }

    // REG-02.2: Toggle visibility
    toggleSourceVisibility(visible) {
        if (this.sourceMesh) {
            this.sourceMesh.visible = visible;
        }
    }

    toggleTargetVisibility(visible) {
        if (this.targetMesh) {
            this.targetMesh.visible = visible;
        }
    }

    // REG-02.3: Set opacity
    setSourceOpacity(opacity) {
        if (this.sourceMesh && this.sourceMesh.material) {
            this.sourceMesh.material.opacity = opacity / 100;
        }
    }

    setTargetOpacity(opacity) {
        if (this.targetMesh && this.targetMesh.material) {
            this.targetMesh.material.opacity = opacity / 100;
        }
    }

    // REG-02.4: Apply camera preset
    applyPreset(presetName) {
        if (presetName === 'fitAll') {
            this.fitCameraToObjects();
            return;
        }

        const preset = this.cameraPresets[presetName];
        if (!preset) return;

        // Use current bounding box to determine distance and target
        const box = new THREE.Box3();
        if (this.sourceMesh) box.expandByObject(this.sourceMesh);
        if (this.targetMesh) box.expandByObject(this.targetMesh);

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 10;
        const distance = maxDim * 2;

        const posDir = preset.posDir;
        this.camera.position.set(
            center.x + posDir[0] * distance,
            center.y + posDir[1] * distance,
            center.z + posDir[2] * distance
        );

        this.camera.lookAt(center);
        this.controls.target.copy(center);
        this.controls.update();
    }

    onWindowResize() {
        let width = this.canvas.clientWidth;
        let height = this.canvas.clientHeight;

        if (width === 0 || height === 0) {
            width = this.canvas.parentElement.clientWidth || 800;
            height = this.canvas.parentElement.clientHeight || 600;
        }

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    // Model Rotation Methods
    rotateSourceModel(axis, amount) {
        if (!this.sourceMesh) return;

        const rotation = amount * Math.PI / 180; // Convert to radians

        if (axis === 'x') this.sourceMesh.rotation.x += rotation;
        else if (axis === 'y') this.sourceMesh.rotation.y += rotation;
        else if (axis === 'z') this.sourceMesh.rotation.z += rotation;
    }

    rotateTargetModel(axis, amount) {
        if (!this.targetMesh) return;

        const rotation = amount * Math.PI / 180; // Convert to radians

        if (axis === 'x') this.targetMesh.rotation.x += rotation;
        else if (axis === 'y') this.targetMesh.rotation.y += rotation;
        else if (axis === 'z') this.targetMesh.rotation.z += rotation;
    }

    rotateAll(axis, amount) {
        const rotation = amount * Math.PI / 180;
        if (axis === 'x') this.rotationGroup.rotation.x += rotation;
        else if (axis === 'y') this.rotationGroup.rotation.y += rotation;
        else if (axis === 'z') this.rotationGroup.rotation.z += rotation;
    }

    resetRotation() {
        this.rotationGroup.rotation.set(0, 0, 0);
    }

    resetSourceRotation() {
        if (!this.sourceMesh) return;
        this.sourceMesh.rotation.set(0, 0, 0);
    }

    resetTargetRotation() {
        if (!this.targetMesh) return;
        this.targetMesh.rotation.set(0, 0, 0);
    }

    getSelectedModel() {
        return this.selectedModel;
    }

    setSelectedModel(modelName) {
        this.selectedModel = modelName; // 'source', 'target', or null
        this.updateModelHighlight();
    }

    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.sourceMesh) {
            this.sourceMesh.geometry.dispose();
            this.sourceMesh.material.dispose();
        }
        if (this.targetMesh) {
            this.targetMesh.geometry.dispose();
            this.targetMesh.material.dispose();
        }
    }
}

// ===== Individual Model Preview Viewer =====
class PreviewViewer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.mesh = null;
        this.animationId = null;

        this.init();
    }

    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a14);

        // Get canvas dimensions
        let width = this.canvas.clientWidth || this.canvas.parentElement.clientWidth || 400;
        let height = this.canvas.clientHeight || this.canvas.parentElement.clientHeight || 400;

        if (width === 0) width = 400;
        if (height === 0) height = 400;

        console.log('PreviewViewer init - Canvas:', width, 'x', height);

        // Create camera
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(3, 3, 3);
        this.camera.lookAt(0, 0, 0);

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        console.log('PreviewViewer renderer created');

        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);

        // Add controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 3;
        this.controls.enableZoom = true;

        console.log('PreviewViewer init complete');

        // Start animation loop
        this.animate();

        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
    }

    loadModel(modelUrl, modelType) {
        // Remove previous mesh
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.mesh = null;
        }

        console.log('PreviewViewer: Loading model', modelUrl, 'Type:', modelType);

        // Load model based on type
        if (modelType === 'ply') {
            this.loadPLY(modelUrl);
        } else if (modelType === 'stl') {
            this.loadSTL(modelUrl);
        } else {
            console.error('Unknown model type:', modelType);
        }
    }

    loadPLY(url) {
        const loader = new PLYLoader();
        loader.load(
            url,
            (geometry) => {
                console.log('PLY loaded successfully');
                geometry.computeVertexNormals();
                geometry.center();

                // Try vertex colors, otherwise gradient
                let material;
                if (geometry.attributes.color) {
                    material = new THREE.MeshPhongMaterial({
                        vertexColors: true,
                        shininess: 100
                    });
                } else {
                    // Create gradient coloring
                    const colors = new Float32Array(geometry.attributes.position.array.length);
                    const posAttr = geometry.attributes.position;
                    const posArray = posAttr.array;

                    for (let i = 0; i < posArray.length; i += 3) {
                        const y = posArray[i + 1];
                        const hue = (y + 2) / 4; // Normalize Y to [0, 1]
                        const color = new THREE.Color().setHSL(hue, 0.7, 0.5);
                        colors[i] = color.r;
                        colors[i + 1] = color.g;
                        colors[i + 2] = color.b;
                    }

                    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                    material = new THREE.MeshPhongMaterial({
                        vertexColors: true,
                        shininess: 100
                    });
                }

                this.mesh = new THREE.Mesh(geometry, material);
                this.scene.add(this.mesh);
                console.log('PLY mesh added to scene');
                this.fitCameraToObject();
            },
            undefined,
            (error) => {
                console.error('PLY loading error:', error);
                alert('Error loading PLY file: ' + error.message);
            }
        );
    }

    loadSTL(url) {
        const loader = new STLLoader();
        loader.load(
            url,
            (geometry) => {
                console.log('STL loaded successfully');
                geometry.computeVertexNormals();
                geometry.center();

                // Create gradient coloring for STL
                const colors = new Float32Array(geometry.attributes.position.array.length);
                const posAttr = geometry.attributes.position;
                const posArray = posAttr.array;

                for (let i = 0; i < posArray.length; i += 3) {
                    const y = posArray[i + 1];
                    const hue = (y + 2) / 4;
                    const color = new THREE.Color().setHSL(hue, 0.7, 0.5);
                    colors[i] = color.r;
                    colors[i + 1] = color.g;
                    colors[i + 2] = color.b;
                }

                geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

                const material = new THREE.MeshPhongMaterial({
                    vertexColors: true,
                    shininess: 100
                });

                this.mesh = new THREE.Mesh(geometry, material);
                this.scene.add(this.mesh);
                console.log('STL mesh added to scene');
                this.fitCameraToObject();
            },
            undefined,
            (error) => {
                console.error('STL loading error:', error);
                alert('Error loading STL file: ' + error.message);
            }
        );
    }

    fitCameraToObject() {
        if (!this.mesh) return;

        const box = new THREE.Box3().setFromObject(this.mesh);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5; // Add margin

        this.camera.position.set(cameraZ, cameraZ * 0.7, cameraZ);
        this.camera.lookAt(box.getCenter(new THREE.Vector3()));
        this.controls.target.copy(box.getCenter(new THREE.Vector3()));
        this.controls.update();
    }

    handleResize() {
        let width = this.canvas.clientWidth;
        let height = this.canvas.clientHeight;

        if (width === 0) width = 400;
        if (height === 0) height = 400;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }

    dispose() {
        this.stopAnimation();
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    }
}

