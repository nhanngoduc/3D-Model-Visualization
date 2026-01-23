# 📘 STORY GROUP 1 — Registration Setup & Viewer
**Implementation Plan**

---

## 🎯 Overview
Story Group 1 thiết lập giai đoạn đầu của Registration:
- **REG-01**: Chọn Source & Target models
- **REG-02**: Tạo Single Overlay Viewer để hiển thị cả 2 model

---

## 📋 Detailed Tasks

### ✅ REG-01: Select Source and Target Models

#### REG-01.1: Source Model Selector
- **File**: `static/js/registration.js`
- **Component**: Source model dropdown
- Load từ cùng data source như current viewer
- Exclude DICOM files (chỉ PLY, STL)
- Display: `[Patient Name] - [Type] - [File Name]`

#### REG-01.2: Target Model Selector  
- **File**: `static/js/registration.js`
- **Component**: Target model dropdown
- Same logic như REG-01.1
- Populated từ API `/api/patient/<id>/data`

#### REG-01.3: Swap Source/Target
- **File**: `static/js/registration.js`
- **Component**: Swap button
- Thay đổi giá trị Source và Target
- Trigger validation

#### REG-01.4: Validate Source ≠ Target
- **File**: `static/js/registration.js`
- **Function**: `validateSelection()`
- Throw error nếu Source === Target
- Disable "Next" button nếu invalid

#### REG-01.5: Group DICOM into CBCT Series
- **File**: `app.py` (new endpoint)
- **Endpoint**: `/api/cbct-series/<patient_id>`
- Group .dcm files theo Series Instance UID
- Return: `{ series_id: [dcm files] }`

#### REG-01.6: Load Both Models into Viewer
- **File**: `static/js/registration-viewer.js` (NEW)
- **Function**: `loadSourceAndTarget(sourceUrl, targetUrl, sourceType, targetType)`
- Create overlay renderer
- Source: render with color
- Target: render gray, fixed position
- Both in single canvas

---

### ✅ REG-02: Initialize Single Overlay Viewer

#### REG-02.1: Overlay Rendering
- **File**: `static/js/registration-viewer.js`
- Render cả 2 mesh trong 1 scene
- Source mesh: color (blue/highlight)
- Target mesh: gray (fixed reference)
- Same lighting setup

#### REG-02.2: Visibility Toggle
- **File**: `static/js/registration-viewer.js`
- **UI**: 2 checkboxes (Show Source, Show Target)
- Toggle mesh visibility: `mesh.visible = true/false`

#### REG-02.3: Opacity Slider
- **File**: `static/js/registration-viewer.js`
- **UI**: 2 sliders (Source Opacity, Target Opacity)
- Update: `mesh.material.opacity = value`
- Require `transparent: true` in material

#### REG-02.4: Camera Presets
- **File**: `static/js/registration-viewer.js`
- **Presets**:
  - Front View
  - Top View
  - Left View
  - Isometric View
  - Fit All
- Each preset adjusts camera position & target

---

## 📁 File Structure

```
static/
├── html/
│   └── registration.html (NEW)
├── js/
│   ├── registration.js (NEW) - Controller
│   ├── registration-viewer.js (NEW) - Viewer class
│   └── app.js (UPDATED) - Add registration link
└── css/
    └── registration.css (NEW) - Styling

app.py (UPDATED)
├── /api/cbct-series/<patient_id> (NEW endpoint)
└── Keep existing /api/patients, /api/patient/<id>/data
```

---

## 🔄 API Changes

### New Endpoint: GET `/api/cbct-series/<patient_id>`
```json
{
  "series": [
    {
      "series_id": "1.2.840.113619...",
      "series_name": "CBCT Scan",
      "files": ["0000.dcm", "0001.dcm", ...]
    }
  ]
}
```

---

## 🎨 UI/UX Flow

```
1. User clicks "Registration" tab
   ↓
2. REG-01 Panel: Select Source & Target
   - Source dropdown
   - Target dropdown  
   - Swap button
   - Validate & Next button
   ↓
3. REG-02 Panel: Overlay Viewer
   - Single 3D canvas (overlay)
   - Source visible + color
   - Target visible + gray
   - Visibility toggles (2x)
   - Opacity sliders (2x)
   - Camera presets dropdown
   - "Ready for Registration" → Next story group
```

---

## 🛠️ Implementation Order

1. ✅ Create `registration.html` structure
2. ✅ Create `registration-viewer.js` (overlay viewer class)
3. ✅ Create `registration.js` (controller + handlers)
4. ✅ Update `app.py` with `/api/cbct-series/` endpoint
5. ✅ Create `registration.css` (styling)
6. ✅ Update `index.html` navigation (add Registration tab)
7. ✅ Test end-to-end

---

## ✨ Key Features (Story Group 1)

| Feature | REG-01 | REG-02 | Status |
|---------|--------|--------|--------|
| Source selector | ✅ | - | TODO |
| Target selector | ✅ | - | TODO |
| Swap button | ✅ | - | TODO |
| Validation | ✅ | - | TODO |
| CBCT grouping | ✅ | - | TODO |
| Load 2 models | ✅ | ✅ | TODO |
| Overlay viewer | - | ✅ | TODO |
| Visibility toggle | - | ✅ | TODO |
| Opacity control | - | ✅ | TODO |
| Camera presets | - | ✅ | TODO |

---

## 🚀 Definition of Done (Story Group 1)

- [ ] User can select Source & Target models
- [ ] Source ≠ Target validation works
- [ ] DICOM series grouped correctly
- [ ] Single overlay viewer displays both models
- [ ] Target rendered gray, Source rendered colored
- [ ] Visibility toggles work
- [ ] Opacity sliders work independently
- [ ] Camera presets navigate correctly
- [ ] No existing viewer functionality affected
- [ ] Registration tab accessible from main UI
