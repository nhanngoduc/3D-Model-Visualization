// DICOM Viewer
class DicomViewer {
    constructor(canvasId) {
        // The canvasId in the original code pointed to a <canvas> element.
        // Cornerstone requires a container DIV, not a canvas directly (it creates its own canvas).
        // However, looking at index.html, we have:
        // <div id="dicomViewer" style="display: none;">
        //    <canvas id="dicomCanvas"></canvas>
        //    ...
        // </div>
        // We should target a div wrapper. Let's see if we can use the canvas or need to wrap it.
        // Usually cornerstone.enable(element) expects a DOM element (div).
        // Let's change the constructor to accept the container ID or use the parent of the canvas.

        this.canvas = document.getElementById(canvasId);
        this.element = this.canvas.parentElement; // The container div

        // Remove the canvas strictly if cornerstone adds its own, but cornerstone might usage the element we give it.
        // Actually cornerstone.enable(element) makes that element the viewer.
        // Let's use a specific container for cornerstone in the element.
        // But for now, let's try to enable the canvas's parent container or create a new one.
        // Note: The original generic viewer had a canvas `dicomCanvas`. 
        // We should probably hide or remove that canvas and append a div for cornerstone,
        // OR just enable cornerstone on a div.
        // Let's assume we can use the 'dicomViewer' div directly or a dedicated inner div.
        // The `dicomViewer` div contains controls too. We need a container strictly for the image.

        // Let's create a dedicated container dynamically if it doesn't exist, replacing the canvas.
        if (this.canvas && this.canvas.tagName === 'CANVAS') {
            this.container = document.createElement('div');
            this.container.style.width = '100%';
            this.container.style.height = '500px'; // Set a fixed height or match style
            this.container.style.position = 'relative';
            this.container.style.backgroundColor = '#000';

            this.canvas.replaceWith(this.container);
            this.element = this.container;
        } else {
            this.element = this.canvas;
        }

        this.dicomData = null;
        this.currentSlice = 0;
        this.totalSlices = 1;

        this.initCornerstone();
        this.setupControls();
    }

    initCornerstone() {
        // Initialize Cornerstone WADO Image Loader
        cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
        cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

        // Register the "wadouri" image loader scheme
        cornerstone.registerImageLoader('wadouri', cornerstoneWADOImageLoader.wadouri.loadImage);

        // Configure WADO Image Loader
        // Using version 3.3.1 which has verified unpkg paths
        const config = {
            webWorkerPath: 'https://unpkg.com/cornerstone-wado-image-loader@3.3.1/dist/cornerstoneWADOImageLoaderWebWorker.min.js',
            taskConfiguration: {
                decodeTask: {
                    codecsPath: 'https://unpkg.com/cornerstone-wado-image-loader@3.3.1/dist/cornerstoneWADOImageLoaderCodecs.min.js'
                }
            }
        };
        cornerstoneWADOImageLoader.webWorkerManager.initialize(config);
    }

    setupControls() {
        const prevBtn = document.getElementById('prevSlice');
        const nextBtn = document.getElementById('nextSlice');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.previousSlice());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextSlice());
        }

        // Window resize handling
        window.addEventListener('resize', () => {
            if (this.element) {
                cornerstone.resize(this.element);
            }
        });
    }

    async loadDicom(url) {
        try {
            // Enable cornerstone for this element
            cornerstone.enable(this.element);

            // Create a specialized stack for loading
            // Since we receive a single URL here, we'll treat it as a single image for now.
            // But we can support wadouri scheme.

            // If the URL is relative or absolute http, prefix with wadouri:
            const imageId = 'wadouri:' + url;

            const image = await cornerstone.loadImage(imageId);

            cornerstone.displayImage(this.element, image);

            // Enable mouse tools
            this.initTools();

            console.log('DICOM loaded via Cornerstone');

            // Show some metadata if possible
            this.updateSliceInfo();

        } catch (error) {
            console.error('Error loading DICOM:', error);
            this.displayError();
        }
    }

    initTools() {
        // Initialize tools
        cornerstoneTools.init();

        // Add tools
        const WwwcTool = cornerstoneTools.WwwcTool;
        const PanTool = cornerstoneTools.PanTool;
        const ZoomTool = cornerstoneTools.ZoomTool;

        cornerstoneTools.addTool(WwwcTool);
        cornerstoneTools.addTool(PanTool);
        cornerstoneTools.addTool(ZoomTool);

        // Activate tools
        cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 }); // Left click
        cornerstoneTools.setToolActive('Pan', { mouseButtonMask: 2 });  // Middle click
        cornerstoneTools.setToolActive('Zoom', { mouseButtonMask: 4 }); // Right click
    }

    displayError() {
        this.element.innerHTML = '<div style="color: red; padding: 20px; text-align: center;">Error loading DICOM file</div>';
    }

    previousSlice() {
        // Implement stack scrolling if needed later
        console.log('Previous slice - Not implemented for single file view');
    }

    nextSlice() {
        // Implement stack scrolling if needed later
        console.log('Next slice - Not implemented for single file view');
    }

    updateSliceInfo() {
        const sliceInfo = document.getElementById('sliceInfo');
        if (sliceInfo) {
            // For single image
            sliceInfo.textContent = `Image 1 / 1`;
        }
    }
}
