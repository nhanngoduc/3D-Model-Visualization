// DICOM 2D Viewer using Cornerstone.js
// Handles display of DICOM series (CBCT slices)

class DicomViewer2D {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.dicomFiles = [];
        this.currentIndex = 0;
        this.imageIds = [];
        this.isInitialized = false;
    }

    async init() {
        try {
            // Initialize Cornerstone if available
            if (typeof cornerstone === 'undefined') {
                console.warn('Cornerstone.js not loaded, using fallback viewer');
                return;
            }
            
            cornerstone.registerImageLoader('dicom', this.loadDicomImage.bind(this));
            this.isInitialized = true;
            console.log('Cornerstone initialized');
        } catch (error) {
            console.error('Error initializing Cornerstone:', error);
        }
    }

    async loadDicomSeries(dicomFiles) {
        try {
            if (!dicomFiles || dicomFiles.length === 0) {
                throw new Error('No DICOM files provided');
            }

            this.dicomFiles = dicomFiles;
            this.currentIndex = 0;

            // Create image IDs for each DICOM file
            this.imageIds = dicomFiles.map((file, index) => ({
                index: index,
                path: file.path,
                name: file.name
            }));

            console.log(`Loaded ${this.imageIds.length} DICOM files`);

            // Display first slice
            await this.displaySlice(0);

            return true;
        } catch (error) {
            console.error('Error loading DICOM series:', error);
            throw error;
        }
    }

    async displaySlice(index) {
        try {
            if (index < 0 || index >= this.dicomFiles.length) {
                console.warn('Invalid slice index');
                return;
            }

            this.currentIndex = index;
            const file = this.dicomFiles[index];

            if (!this.isInitialized || typeof cornerstone === 'undefined') {
                // Fallback: show info text
                console.log(`Displaying slice ${index + 1}/${this.dicomFiles.length}: ${file.name}`);
                this.displayFallback(index);
                return;
            }

            try {
                const imageId = `dicom://${file.path}`;
                
                // Load and display image
                const image = await cornerstone.loadImage(imageId);
                cornerstone.displayImage(this.canvas, image);

                // Update UI
                this.updateSliceInfo(index);
            } catch (error) {
                console.error('Error displaying DICOM slice with Cornerstone:', error);
                this.displayFallback(index);
            }
        } catch (error) {
            console.error('Error in displaySlice:', error);
        }
    }

    displayFallback(index) {
        // Fallback display when Cornerstone is not available
        const ctx = this.canvas.getContext('2d');
        const file = this.dicomFiles[index];

        // Clear canvas
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw text
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`DICOM Slice ${index + 1}/${this.dicomFiles.length}`, 
            this.canvas.width / 2, this.canvas.height / 2 - 30);
        ctx.font = '12px Arial';
        ctx.fillText(`File: ${file.name}`, 
            this.canvas.width / 2, this.canvas.height / 2 + 10);
        ctx.fillText('(Install Cornerstone.js for full viewing)', 
            this.canvas.width / 2, this.canvas.height / 2 + 35);
    }

    updateSliceInfo(index) {
        const infoElement = document.getElementById('dicomSliceInfo');
        if (infoElement) {
            const file = this.dicomFiles[index];
            infoElement.textContent = `Slice ${index + 1}/${this.dicomFiles.length} - ${file.name}`;
        }
    }

    nextSlice() {
        if (this.currentIndex < this.dicomFiles.length - 1) {
            this.displaySlice(this.currentIndex + 1);
        }
    }

    previousSlice() {
        if (this.currentIndex > 0) {
            this.displaySlice(this.currentIndex - 1);
        }
    }

    goToSlice(index) {
        this.displaySlice(index);
    }

    async loadDicomImage(imageId) {
        // Placeholder for Cornerstone image loader
        // In production, this would parse actual DICOM files
        return {
            imageId: imageId,
            minPixelValue: 0,
            maxPixelValue: 255,
            rows: 512,
            columns: 512,
            getPixelData: () => new Uint16Array(512 * 512)
        };
    }

    getCurrentIndex() {
        return this.currentIndex;
    }

    getFileCount() {
        return this.dicomFiles.length;
    }
}