// DICOM Viewer
class DicomViewer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.dicomData = null;
        this.currentSlice = 0;
        this.totalSlices = 1;

        this.setupControls();
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
    }

    async loadDicom(url) {
        try {
            // Fetch DICOM file
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();

            // Parse DICOM using pydicom-like approach
            // For simplicity, we'll display a placeholder
            // In production, use cornerstone.js or similar library

            this.displayPlaceholder();

            console.log('DICOM loaded (placeholder display)');
        } catch (error) {
            console.error('Error loading DICOM:', error);
            this.displayError();
        }
    }

    displayPlaceholder() {
        // Set canvas size
        this.canvas.width = 512;
        this.canvas.height = 512;

        // Draw placeholder
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw text
        this.ctx.fillStyle = '#667eea';
        this.ctx.font = '24px Inter';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('DICOM Viewer', this.canvas.width / 2, this.canvas.height / 2 - 40);

        this.ctx.fillStyle = '#a0a0b8';
        this.ctx.font = '16px Inter';
        this.ctx.fillText('DICOM file loaded', this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.fillText('(Full DICOM rendering requires cornerstone.js)', this.canvas.width / 2, this.canvas.height / 2 + 30);

        // Draw grid pattern to show it's medical imaging
        this.ctx.strokeStyle = 'rgba(102, 126, 234, 0.2)';
        this.ctx.lineWidth = 1;

        for (let i = 0; i < this.canvas.width; i += 32) {
            this.ctx.beginPath();
            this.ctx.moveTo(i, 0);
            this.ctx.lineTo(i, this.canvas.height);
            this.ctx.stroke();
        }

        for (let i = 0; i < this.canvas.height; i += 32) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, i);
            this.ctx.lineTo(this.canvas.width, i);
            this.ctx.stroke();
        }

        this.updateSliceInfo();
    }

    displayError() {
        this.canvas.width = 512;
        this.canvas.height = 512;

        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = '#ef4444';
        this.ctx.font = '20px Inter';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('Error loading DICOM file', this.canvas.width / 2, this.canvas.height / 2);
    }

    previousSlice() {
        if (this.currentSlice > 0) {
            this.currentSlice--;
            this.updateSliceInfo();
            // In full implementation, would render the previous slice
        }
    }

    nextSlice() {
        if (this.currentSlice < this.totalSlices - 1) {
            this.currentSlice++;
            this.updateSliceInfo();
            // In full implementation, would render the next slice
        }
    }

    updateSliceInfo() {
        const sliceInfo = document.getElementById('sliceInfo');
        if (sliceInfo) {
            sliceInfo.textContent = `Slice ${this.currentSlice + 1} / ${this.totalSlices}`;
        }
    }
}
