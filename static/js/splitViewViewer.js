// Split View Viewer - Display 2 models side-by-side with independent rotation
class SplitViewViewer {
    constructor(sourceCanvasId = 'sourceViewer', targetCanvasId = 'targetViewer') {
        this.sourceCanvasId = sourceCanvasId;
        this.targetCanvasId = targetCanvasId;
        this.sourceViewer = null;
        this.targetViewer = null;

        // Initialize viewers with provided canvas IDs
        try {
            this.sourceViewer = new IndependentModelViewer(sourceCanvasId, 'Source');
            this.targetViewer = new IndependentModelViewer(targetCanvasId, 'Target');
        } catch (error) {
            console.error('Error initializing split view viewers:', error);
            throw error;
        }
    }

    async loadModels(sourceUrl, targetUrl, sourceType, targetType) {
        try {
            console.log('Loading models in split view...');

            // Load source model
            await this.sourceViewer.loadModel(sourceUrl, sourceType);

            // Load target model
            await this.targetViewer.loadModel(targetUrl, targetType);

            console.log('Both models loaded in split view');
            return true;
        } catch (error) {
            console.error('Error loading models in split view:', error);
            throw error;
        }
    }

    // Control methods
    toggleSourceVisibility(visible) {
        if (this.sourceViewer) this.sourceViewer.toggleVisibility(visible);
    }

    toggleTargetVisibility(visible) {
        if (this.targetViewer) this.targetViewer.toggleVisibility(visible);
    }

    setSourceOpacity(opacity) {
        if (this.sourceViewer) this.sourceViewer.setOpacity(opacity);
    }

    setTargetOpacity(opacity) {
        if (this.targetViewer) this.targetViewer.setOpacity(opacity);
    }

    rotateSourceModel(axis, amount) {
        if (this.sourceViewer) this.sourceViewer.rotateModel(axis, amount);
    }

    rotateTargetModel(axis, amount) {
        if (this.targetViewer) this.targetViewer.rotateModel(axis, amount);
    }

    resetSourceRotation() {
        if (this.sourceViewer) this.sourceViewer.resetRotation();
    }

    resetTargetRotation() {
        if (this.targetViewer) this.targetViewer.resetRotation();
    }

    applyPreset(preset) {
        if (this.sourceViewer) this.sourceViewer.applyPreset(preset);
        if (this.targetViewer) this.targetViewer.applyPreset(preset);
    }

    dispose() {
        if (this.sourceViewer) this.sourceViewer.dispose();
        if (this.targetViewer) this.targetViewer.dispose();
    }
}

// Individual Model Viewer - Each model in its own canvas
class IndependentModelViewer {
    constructor(canvasId, label) {
        this.canvas = document.getElementById(canvasId);
        this.label = label;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.mesh = null;

        // Mouse interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isDragging = false;
        this.previousMousePosition = { x: 0, y: 0 };
        this.rotationSpeed = 0.01;

        // Picking/markers
        this.pickMode = false;
        this.onPointPick = null;
        this.modelCenter = null;
        this.modelScale = null;
        this.markers = [];
        this.mouseDownTime = 0;
        this.mouseDownPos = { x: 0, y: 0 };

        this.cameraPresets = {
            isometric: { pos: [5, 5, 5], target: [0, 0, 0] },
            front: { pos: [0, 0, 8], target: [0, 0, 0] },
            top: { pos: [0, 8, 0], target: [0, 0, 0] },
            left: { pos: [-8, 0, 0], target: [0, 0, 0] },
            fitAll: null
        };

        this.init();
    }

    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        // Get canvas dimensions
        let width = this.canvas.clientWidth || 400;
        let height = this.canvas.clientHeight || 400;

        // Create camera
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(5, 5, 5);
        this.camera.lookAt(0, 0, 0);

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight1.position.set(5, 5, 5);
        this.scene.add(directionalLight1);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        directionalLight2.position.set(-5, -5, -5);
        this.scene.add(directionalLight2);

        // Add orbit controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;

        // Setup mouse interaction
        this.setupMouseInteraction();

        // Handle resize
        window.addEventListener('resize', () => this.onWindowResize());

        // Start animation loop
        this.animate();
    }

    setupMouseInteraction() {
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.onMouseLeave(e));
        this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    }

    onMouseDown(event) {
        // Track mouse down for click vs drag detection
        this.mouseDownTime = Date.now();
        this.mouseDownPos = { x: event.clientX, y: event.clientY };

        // Calculate mouse position relative to this canvas
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Check if mesh was clicked
        if (this.mesh) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObject(this.mesh);

            if (intersects.length > 0) {
                // Determine if we start dragging
                // If pick mode is enabled, we still allow drag (orbit) but we also track for click
                // But typically orbit starts on background too. 
                // We'll let OrbitControls handle camera. We handle visual highlight.

                this.isDragging = true;
                this.previousMousePosition = { x: event.clientX, y: event.clientY };

                // Disable camera controls when dragging model (only if NOT in pick mode)
                // If in pick mode, we want to allow rotating the camera to find points!
                if (!this.pickMode) {
                    this.controls.enabled = false;
                }

                // Visual feedback
                if (this.mesh.material) {
                    this.mesh.material.emissive.setHex(0x334455);
                }
            }
        }
    }

    onMouseMove(event) {
        if (!this.isDragging || !this.mesh) return;

        const deltaX = event.clientX - this.previousMousePosition.x;
        const deltaY = event.clientY - this.previousMousePosition.y;

        // Rotate model
        this.mesh.rotation.y += deltaX * this.rotationSpeed;
        this.mesh.rotation.x += deltaY * this.rotationSpeed;

        this.previousMousePosition = { x: event.clientX, y: event.clientY };
    }

    onMouseUp(event) {
        // Check for click (short duration, small movement)
        const clickDuration = Date.now() - this.mouseDownTime;
        const moveDist = Math.hypot(event.clientX - this.mouseDownPos.x, event.clientY - this.mouseDownPos.y);

        // Relaxed thresholds: 1000ms and 20px - VERY forgiving
        if (this.pickMode && clickDuration < 1000 && moveDist < 20) {
            // It's a click in pick mode! Try to pick.
            this.handlePick(event);
        }

        this.isDragging = false;

        // Re-enable camera controls
        this.controls.enabled = true;

        // Remove highlight
        if (this.mesh && this.mesh.material) {
            this.mesh.material.emissive.setHex(0x000000);
        }
    }

    handlePick(event) {
        if (!this.mesh || !this.onPointPick) return;

        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.mesh);

        if (intersects.length > 0) {
            const hitPoint = intersects[0].point.clone();

            // Convert display hit point back to original model coordinates
            // Use worldToLocal to handle Inverse Rotation and Scale automatically
            const localPoint = intersects[0].point.clone();
            this.mesh.worldToLocal(localPoint);

            if (this.modelCenter) {
                // Geometry was translated by -center, so we add center back
                localPoint.add(this.modelCenter);
            }
            this.onPointPick(localPoint);
        } else {
            console.warn("Pick Click detected but no intersection found.");
        }
    }

    onDoubleClick(event) {
        if (this.pickMode) {
            this.handlePick(event);
        }
    }

    onMouseLeave(event) {
        this.isDragging = false;
        this.controls.enabled = true;

        if (this.mesh && this.mesh.material) {
            this.mesh.material.emissive.setHex(0x000000);
        }
    }

    async loadModel(url, type) {
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

            // Compute original center and scale BEFORE we modify geometry so we can map picks back to original coordinates
            geometry.computeBoundingBox();
            const _box = geometry.boundingBox;
            const _center = new THREE.Vector3();
            _box.getCenter(_center);
            const _size = new THREE.Vector3();
            _box.getSize(_size);
            const _maxDim = Math.max(_size.x, _size.y, _size.z) || 1;
            const _scale = 3 / _maxDim;

            // Store mapping info for later (used to map display points back to original model coordinates)
            this.modelCenter = _center.clone();
            this.modelScale = _scale;

            geometry.computeVertexNormals();

            // Create material
            let material;
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

            // Create mesh
            this.mesh = new THREE.Mesh(geometry, material);
            this.centerAndScaleMesh();
            this.scene.add(this.mesh);

            this.fitCameraToObject();

            console.log(`${this.label} model loaded`);
        } catch (error) {
            console.error(`Error loading ${this.label} model:`, error);
            throw error;
        }
    }

    centerAndScaleMesh() {
        if (!this.mesh) return;

        this.mesh.geometry.computeBoundingBox();
        const box = this.mesh.geometry.boundingBox;
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);

        this.mesh.geometry.translate(-center.x, -center.y, -center.z);

        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 3 / maxDim;
        this.mesh.scale.setScalar(scale);

        this.mesh.geometry.computeBoundingBox();
    }

    fitCameraToObject() {
        if (!this.mesh) return;

        const box = new THREE.Box3().setFromObject(this.mesh);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        const distance = maxDim * 2;
        this.camera.position.set(
            center.x + distance,
            center.y + distance,
            center.z + distance
        );
        this.camera.lookAt(center);
        this.controls.target.copy(center);
        this.controls.update();
    }

    // Markers for picked points
    addMarker(worldPosition, color = 0xff0000, label = null) {
        if (!this.mesh) return null;

        // Convert Real World Position -> Mesh Local Position (Geometry Space)
        // because we will attach the marker to the mesh itself.
        const localPos = worldPosition.clone();
        if (this.modelCenter) {
            localPos.sub(this.modelCenter);
        }

        const geometry = new THREE.SphereGeometry(1, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            depthTest: false, // Always show on top
            transparent: true
        });
        const marker = new THREE.Mesh(geometry, material);

        marker.position.copy(localPos);
        marker.renderOrder = 999;
        marker.userData.pixelRadius = 6; // desired on-screen radius in pixels
        marker.userData.baseSpriteScale = new THREE.Vector3(0.4, 0.2, 1.0);

        // Attach to mesh so it rotates with the model!
        this.mesh.add(marker);

        // Add label if provided
        if (label) {
            const sprite = this.createTextSprite(label);
            if (sprite) {
                sprite.position.set(0, 0.1, 0); // Offset above the point
                marker.add(sprite); // Attach to marker so it moves with it
            }
        }

        this.markers.push(marker);
        return marker;
    }

    createTextSprite(message) {
        const fontface = "Arial";
        const fontsize = 24;
        const borderThickness = 2;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 128; // Power of 2
        canvas.height = 64;

        context.font = "bold " + fontsize + "px " + fontface;

        // Background
        context.fillStyle = "rgba(0, 0, 0, 0.7)";
        context.strokeStyle = "rgba(255, 255, 255, 0.8)";
        context.lineWidth = borderThickness;

        // Measure text
        const metrics = context.measureText(message);
        const textWidth = metrics.width;

        // Draw background rounded rect
        this.roundRect(context, 64 - textWidth / 2 - 10, 32 - fontsize / 2 - 5, textWidth + 20, fontsize + 10, 6);

        // Text
        context.fillStyle = "rgba(255, 255, 255, 1.0)";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(message, 64, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            depthTest: false, // Always show on top
            transparent: true
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.renderOrder = 1000; // Render on top of marker
        sprite.scale.set(0.4, 0.2, 1.0); // Slightly larger
        return sprite;
    }

    roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    clearMarkers() {
        for (const m of this.markers) {
            if (m.parent) {
                m.parent.remove(m);
            } else {
                this.scene.remove(m);
            }
            if (m.geometry) m.geometry.dispose();
            if (m.material) m.material.dispose();
        }
        this.markers = [];
    }

    rotateModel(axis, amount) {
        if (!this.mesh) return;

        const rotation = amount * Math.PI / 180;

        if (axis === 'x') this.mesh.rotation.x += rotation;
        else if (axis === 'y') this.mesh.rotation.y += rotation;
        else if (axis === 'z') this.mesh.rotation.z += rotation;
    }

    resetRotation() {
        if (this.mesh) {
            this.mesh.rotation.set(0, 0, 0);
        }
    }

    toggleVisibility(visible) {
        if (this.mesh) {
            this.mesh.visible = visible;
        }
    }

    setPickMode(enabled) {
        this.pickMode = !!enabled;
        if (this.canvas) {
            this.canvas.style.cursor = this.pickMode ? 'crosshair' : 'default';
        }
    }

    setOnPointPick(cb) {
        this.onPointPick = cb;
    }

    setOpacity(opacity) {
        if (this.mesh && this.mesh.material) {
            this.mesh.material.opacity = opacity / 100;
        }
    }

    applyPreset(preset) {
        if (!this.cameraPresets[preset]) return;

        const presetData = this.cameraPresets[preset];
        const box = new THREE.Box3().setFromObject(this.mesh);
        const center = box.getCenter(new THREE.Vector3());

        this.camera.position.set(
            center.x + presetData.pos[0],
            center.y + presetData.pos[1],
            center.z + presetData.pos[2]
        );
        this.camera.lookAt(
            center.x + presetData.target[0],
            center.y + presetData.target[1],
            center.z + presetData.target[2]
        );
        this.controls.target.copy(center);
        this.controls.update();
    }

    onWindowResize() {
        let width = this.canvas.clientWidth;
        let height = this.canvas.clientHeight;

        if (width === 0) width = 400;
        if (height === 0) height = 400;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.updateMarkerScales();
        this.renderer.render(this.scene, this.camera);
    }

    updateMarkerScales() {
        if (!this.camera || !this.renderer || this.markers.length === 0) return;

        const height = this.renderer.domElement.clientHeight || this.renderer.domElement.height;
        if (!height) return;

        const vFov = THREE.MathUtils.degToRad(this.camera.fov);
        for (const marker of this.markers) {
            const worldPos = new THREE.Vector3();
            marker.getWorldPosition(worldPos);
            const distance = this.camera.position.distanceTo(worldPos);
            const worldPerPixel = (2 * Math.tan(vFov / 2) * distance) / height;
            const desiredWorldRadius = (marker.userData.pixelRadius || 6) * worldPerPixel;

            // If marker is parented under a scaled mesh, compensate for parent scale
            let parentScale = 1;
            if (marker.parent) {
                const s = new THREE.Vector3();
                marker.parent.getWorldScale(s);
                parentScale = (s.x + s.y + s.z) / 3 || 1;
            }
            const localRadius = desiredWorldRadius / parentScale;
            marker.scale.setScalar(localRadius);

            if (marker.children && marker.children.length > 0) {
                for (const child of marker.children) {
                    if (child.isSprite && marker.userData.baseSpriteScale) {
                        child.scale.copy(marker.userData.baseSpriteScale).multiplyScalar(localRadius);
                    }
                }
            }
        }
    }

    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    }
}
