# Story Group 1 - Registration Feature Update

## Feature: Individual Model Preview on Selection

### Objective
When users select a Source model or Target model in the Registration page, the selected model is displayed individually in a 3D preview (not registered/overlaid together yet). This provides visual confirmation before clicking "Proceed to Overlay Viewer" to see both models registered together.

### Changes Made

#### 1. HTML Structure (registration.html)
- **Added Preview Grid**: Two-column grid layout showing Source and Target model previews side-by-side
- **Preview Panels**: Each panel has:
  - Title bar with color indicator (🔵 Source, ⚫ Target)
  - Canvas element for 3D rendering
  - Placeholder with instructions when no model is selected
- **Location**: Main viewer area, displayed before overlay viewer

#### 2. CSS Styling (registration.css)
- **Preview Grid**: `display: grid; grid-template-columns: 1fr 1fr;` for side-by-side layout
- **Preview Panel**: 400px height, dark theme matching existing UI
- **Preview Container**: Flex container for canvas
- **Preview Placeholder**: Centered instruction text with emoji icons
- **Responsive**: Both source and target visible simultaneously

#### 3. JavaScript - Preview Viewer Class (registration-viewer.js)

**New Class: `PreviewViewer`**
```javascript
class PreviewViewer {
    constructor(canvasId)      // Initialize viewer with canvas ID
    init()                      // Setup Three.js scene, camera, renderer, controls
    loadModel(url, type)        // Load PLY or STL model
    loadPLY(url)               // Parse PLY files with vertex colors
    loadSTL(url)               // Parse STL files with gradient colors
    fitCameraToObject()         // Auto-fit camera to model bounds
    handleResize()             // Responsive canvas resizing
    animate()                  // Render loop with auto-rotation
    stopAnimation()            // Cleanup animation frame
    dispose()                  // Free Three.js resources
}
```

**Key Features:**
- Auto-rotating models (smooth visualization)
- Orbit controls for user interaction
- Color preservation (vertex colors from PLY, gradient fallback)
- Automatic zoom-to-fit
- Lightweight (single model per viewer)

#### 4. JavaScript - Registration Controller (registration.js)

**New Global Variables:**
```javascript
let sourcePreviewViewer = null;    // Preview viewer for source model
let targetPreviewViewer = null;    // Preview viewer for target model
```

**New Functions:**
```javascript
async function previewSourceModel()
    - Triggered when source model dropdown changes
    - Creates/updates sourcePreviewViewer
    - Shows canvas, hides placeholder when model selected
    - Disposes viewer when no model selected

async function previewTargetModel()
    - Triggered when target model dropdown changes
    - Creates/updates targetPreviewViewer
    - Shows canvas, hides placeholder when model selected
    - Disposes viewer when no model selected
```

**Updated Event Listeners:**
- Source/Target dropdown `change` events now call preview functions
- Validation still works independently

### User Workflow

1. **Initial State**: Two preview panels visible with placeholders
2. **Select Source Model**:
   - Source preview canvas appears with 3D model
   - Auto-rotating visualization
   - Can interact with orbits/zoom
3. **Select Target Model**:
   - Target preview canvas appears with 3D model
   - Auto-rotating visualization
   - Can interact with orbits/zoom
4. **Both Models Visible**: Side-by-side comparison before overlay
5. **Click "Proceed to Overlay Viewer"**:
   - Previews hidden
   - Overlay registration viewer shown
   - Both models overlaid with opacity/visibility controls

### Technical Details

**Canvas Sizing:**
- Preview panels: 400px height, 1fr width each
- Aspect ratio: Responsive to grid layout
- Minimum: 400×400px per preview

**Color Handling:**
- PLY: Uses vertex colors if available
- Fallback: Generates gradient colors based on Y-axis (hue variation)
- STL: Generates gradient colors (no vertex color support)

**Memory Management:**
- Preview viewers created on-demand
- Disposed when model deselected
- Single animation loop per viewer (not global)
- Canvas cleaned up on disposal

**Three.js Libraries Used:**
- PLYLoader: For PLY mesh loading
- STLLoader: For STL mesh loading
- OrbitControls: For user interaction (zoom/pan/rotate)
- Core: Scene, Camera, WebGLRenderer, Mesh, Material, Lighting

### Files Modified
1. `/static/html/registration.html` - Added preview grid and canvas elements
2. `/static/css/registration.css` - Added preview styling (21 CSS rules)
3. `/static/js/registration-viewer.js` - Added PreviewViewer class (220 lines)
4. `/static/js/registration.js` - Added preview functions (61 lines)

### Testing Checklist
- [ ] Page loads without errors
- [ ] Patient dropdown populates correctly
- [ ] Select Source model → preview appears with auto-rotation
- [ ] Select Target model → preview appears with auto-rotation
- [ ] Both models visible simultaneously
- [ ] Can interact with previews (orbit, zoom, pan)
- [ ] Deselect model → placeholder reappears
- [ ] Swap models → previews update
- [ ] Click Proceed → transitions to overlay viewer
- [ ] Overlay viewer shows both models
- [ ] Model controls work (visibility, opacity, presets)

### Future Enhancements
- Save preview camera state when switching to overlay
- Add measurement tools to previews
- Allow export of preview image
- Add comparison metrics (size, volume, surface area)
- Add animation to preview transitions

### Notes
- Previews are independent viewers, not linked to overlay viewer
- Each preview has its own Three.js context
- Auto-rotation helps identify model features without user interaction
- Placeholders provide clear UX feedback

## Status: ✅ COMPLETED
Implementation adds individual model preview functionality as requested by user.
