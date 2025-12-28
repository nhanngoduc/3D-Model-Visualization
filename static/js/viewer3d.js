// 3D Viewer using Three.js
class Viewer3D {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.currentMesh = null;
        this.wireframeMode = false;

        this.init();
    }

    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        // Get canvas dimensions (use parent if canvas is hidden)
        let width = this.canvas.clientWidth || this.canvas.parentElement.clientWidth || 800;
        let height = this.canvas.clientHeight || this.canvas.parentElement.clientHeight || 600;

        // Ensure minimum dimensions
        if (width === 0) width = 800;
        if (height === 0) height = 600;

        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            width / height,
            0.1,
            1000
        );
        this.camera.position.z = 5;

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
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
        this.controls.minDistance = 1;
        this.controls.maxDistance = 100;

        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());

        // Start animation loop
        this.animate();
    }

    async loadMesh(url, type) {
        // Remove existing mesh
        if (this.currentMesh) {
            this.scene.remove(this.currentMesh);
            this.currentMesh = null;
        }

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

            // Compute normals for proper lighting
            geometry.computeVertexNormals();

            // Create material with gradient color
            const material = new THREE.MeshPhongMaterial({
                color: 0x667eea,
                specular: 0x111111,
                shininess: 200,
                flatShading: false,
                side: THREE.DoubleSide
            });

            // Create mesh
            this.currentMesh = new THREE.Mesh(geometry, material);

            // Center and scale the mesh
            this.centerAndScaleMesh();

            // Add to scene
            this.scene.add(this.currentMesh);

            // Reset camera
            this.resetCamera();

            console.log('Mesh loaded successfully');
        } catch (error) {
            console.error('Error loading mesh:', error);
            throw error;
        }
    }

    centerAndScaleMesh() {
        if (!this.currentMesh) return;

        // Compute bounding box in world space
        this.currentMesh.geometry.computeBoundingBox();
        const box = this.currentMesh.geometry.boundingBox;
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);

        // Move mesh so its center is at origin
        this.currentMesh.geometry.translate(-center.x, -center.y, -center.z);

        // Scale to fit in view (target size of 3 units)
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 3 / maxDim;
        this.currentMesh.scale.setScalar(scale);

        // Recompute bounding box after transformations
        this.currentMesh.geometry.computeBoundingBox();
    }

    resetCamera() {
        if (!this.currentMesh) return;

        // Get the scaled size of the mesh
        const box = new THREE.Box3().setFromObject(this.currentMesh);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        // Position camera to view the mesh
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

    toggleWireframe() {
        if (!this.currentMesh) return;

        this.wireframeMode = !this.wireframeMode;
        this.currentMesh.material.wireframe = this.wireframeMode;
    }

    onWindowResize() {
        let width = this.canvas.clientWidth;
        let height = this.canvas.clientHeight;

        // Fallback to parent dimensions if canvas is hidden
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
}
