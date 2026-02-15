"""Test ROI extraction and registration with full debug output."""
import sys
sys.path.insert(0, r"d:\Lab\3D Model Visualization")

from app import extract_mouth_roi
import trimesh
import numpy as np
import os

ROOT = r"D:\Lab\3D Model Visualization\Cases for AI Fernando Polanco\Cases for AI Fernando Polanco"

source_file = os.path.join(ROOT, "patient 1", "Intraoral scans", "IOS trios UpperJawScan.ply")
target_file = os.path.join(ROOT, "patient 1", "Face scans", "FaceWithRetractors_refine.ply")

print("Loading meshes...")
jaw = trimesh.load(source_file, process=False)
face = trimesh.load(target_file, process=False)

print(f"\nJaw: {len(jaw.vertices)} vertices, extent={jaw.extents}")
print(f"Face: {len(face.vertices)} vertices, extent={face.extents}")

print("\n" + "="*60)
print("EXTRACTING ROI...")
print("="*60)
face_roi = extract_mouth_roi(face, jaw)

print(f"\nFace ROI: {len(face_roi.vertices)} vertices")
print(f"Reduction: {100*(1 - len(face_roi.vertices)/len(face.vertices)):.1f}%")

# Check if ROI is reasonable
if len(face_roi.vertices) < 1000:
    print("\n⚠️  ROI TOO SMALL - may not have enough points for good alignment")
elif len(face_roi.vertices) > len(face.vertices) * 0.5:
    print("\n⚠️  ROI TOO LARGE - not focused enough on mouth region")
else:
    print("\n✅ ROI size looks reasonable")

# Compute overlap
jaw_bounds = jaw.bounds
roi_bounds = face_roi.bounds if hasattr(face_roi, 'bounds') else (np.min(face_roi.vertices, axis=0), np.max(face_roi.vertices, axis=0))

print(f"\nJaw bounds: {jaw_bounds}")
print(f"ROI bounds: {roi_bounds}")

# Check bounding box overlap
overlap_min = np.maximum(jaw_bounds[0], roi_bounds[0])
overlap_max = np.minimum(jaw_bounds[1], roi_bounds[1])
has_overlap = np.all(overlap_min < overlap_max)

print(f"\nBounding box overlap: {has_overlap}")
if has_overlap:
    overlap_size = overlap_max - overlap_min
    print(f"Overlap extent: {overlap_size}")
