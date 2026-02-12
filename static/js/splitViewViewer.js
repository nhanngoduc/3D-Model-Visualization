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
        this._labelSprites = [];
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

    // Markers for picked points (use camera-facing sprites like MeshLab)
    addMarker(worldPosition, color = 0xff0000, label = null) {
        if (!this.mesh) return null;

        // Convert Real World Position -> Mesh Local Position (Geometry Space)
        // because we will attach the marker to the mesh itself.
        const localPos = worldPosition.clone();
        if (this.modelCenter) {
            localPos.sub(this.modelCenter);
        }

        // Create a canvas-based sprite so the marker looks like MeshLab's 2D pick icons
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Clear
        ctx.clearRect(0, 0, size, size);

        // Draw outer ring and filled center (MeshLab-like)
        const cx = size / 2;
        const cy = size / 2;
        const radius = size * 0.14;

        // thin white ring
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Fill inner circle with chosen color
        ctx.fillStyle = (typeof color === 'number') ? `#${('000000' + color.toString(16)).slice(-6)}` : color;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
        ctx.fill();

        // Create texture and sprite
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        const spriteMaterial = new THREE.SpriteMaterial({
            map: tex,
            depthTest: false,
            depthWrite: false,
            transparent: true
        });
        const marker = new THREE.Sprite(spriteMaterial);

        // Convert local mesh-space position to world-space and add marker to scene (not parented to mesh)
        const worldPos = localPos.clone();
        this.mesh.localToWorld(worldPos);
        marker.position.copy(worldPos);
        // keep local mesh-space position so we can update marker if mesh moves (e.g., after registration)
        marker.userData.localPos = localPos.clone();
        marker.userData.attachedMesh = this.mesh;
        marker.renderOrder = 999;

        // Desired on-screen radius in pixels (used by scaling routine)
        // Make marker slightly smaller on screen to match MeshLab
        marker.userData.pixelRadius = 6;
        // Base scale in world units per pixel; used as a vector for sprites
        marker.userData.baseSpriteScale = new THREE.Vector3(1, 1, 1);
        // default label pixel height
        marker.userData.labelPixelSize = 18;

        // Add marker to scene (keeps consistent screen sizing and independent of parent scale)
        this.scene.add(marker);

        // Add numeric label as a separate sprite if provided
        if (label) {
            const sprite = this.createTextSprite(label);
                if (sprite) {
                    // We'll keep label sprites in the scene (not as children) and update their world
                    // position every frame so they remain readable and visible.
                    sprite.userData.baseSpriteScale = new THREE.Vector3(0.35, 0.18, 1.0);
                    sprite.userData.pixelSize = sprite.userData.pixelSize || 18;
                    // store association for updates
                    this._labelSprites.push({ marker: marker, sprite: sprite, offsetLocalY: radius * 0.9 });
                    this.scene.add(sprite);
                }
        }

        this.markers.push(marker);
        return marker;
    }

    createTextSprite(message) {
        const fontface = "Arial";
        const fontsize = 36;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        // Keep a small texture for crisp numbers
        canvas.width = 128;
        canvas.height = 128;

        context.font = "bold " + fontsize + "px " + fontface;
        context.textAlign = "center";
        context.textBaseline = "middle";

        // Transparent background
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Draw stroke for readability
        context.lineWidth = 6;
        context.strokeStyle = 'rgba(0,0,0,0.9)';
        context.strokeText(message, canvas.width / 2, canvas.height / 2);

        // Draw fill
        context.fillStyle = 'rgba(255,255,255,1.0)';
        context.fillText(message, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            depthTest: false,
            depthWrite: false,
            transparent: true
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.renderOrder = 1000; // Render on top of marker
        sprite.userData.baseSpriteScale = new THREE.Vector3(0.4, 0.2, 1.0);
        sprite.userData.isLabel = true;
        sprite.userData.pixelSize = 18; // desired on-screen pixel height for label
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
        // remove label sprites
        for (const rec of this._labelSprites) {
            const s = rec.sprite;
            if (s.parent) s.parent.remove(s);
            else this.scene.remove(s);
            if (s.material) s.material.dispose();
            if (s.geometry) s.geometry.dispose();
        }
        this._labelSprites = [];
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
            // If this marker is attached to a mesh, update its world position in case the mesh moved
            if (marker.userData && marker.userData.attachedMesh && marker.userData.localPos) {
                const lp = marker.userData.localPos.clone();
                marker.userData.attachedMesh.localToWorld(lp);
                marker.position.copy(lp);
            }
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

            // If marker is sprite, use baseSpriteScale; otherwise set scalar (legacy support)
            if (marker.isSprite) {
                const base = marker.userData.baseSpriteScale || new THREE.Vector3(1, 1, 1);
                marker.scale.copy(base).multiplyScalar(localRadius);
            } else {
                marker.scale.setScalar(localRadius);
            }

            if (marker.children && marker.children.length > 0) {
                for (const child of marker.children) {
                        if (child.isSprite) {
                            // If this child is a label sprite, keep it at a readable on-screen pixel size
                            const labelPixelSize = child.userData.pixelSize || marker.userData.labelPixelSize || 18;
                            const desiredWorldLabel = labelPixelSize * worldPerPixel;
                            child.scale.set(desiredWorldLabel, desiredWorldLabel, 1.0);
                        }
                }
            }

            // Update any separate label sprites attached to this marker (kept in scene)
            if (this._labelSprites && this._labelSprites.length > 0) {
                const cameraUpWorld = this.camera.up.clone().applyQuaternion(this.camera.quaternion).normalize();
                for (const rec of this._labelSprites) {
                    if (rec.marker !== marker) continue;
                    const worldPos = new THREE.Vector3();
                    marker.getWorldPosition(worldPos);
                    // position label a bit above in camera up direction
                    const labelPixelSize = rec.sprite.userData.pixelSize || rec.marker.userData.labelPixelSize || 18;
                    const desiredWorldLabel = labelPixelSize * worldPerPixel;
                    // use desiredWorldRadius (computed above) which represents marker radius in world units
                    const markerWorldRadius = desiredWorldRadius;
                    const gap = desiredWorldLabel * 0.15;
                    // place label just above the marker surface
                    const offsetDist = markerWorldRadius + gap;
                    const offset = cameraUpWorld.clone().multiplyScalar(offsetDist);
                    rec.sprite.position.copy(worldPos).add(offset);
                    rec.sprite.renderOrder = 1000;
                    // set label world scale so text height matches pixel size
                    rec.sprite.scale.set(desiredWorldLabel, desiredWorldLabel, 1.0);
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
