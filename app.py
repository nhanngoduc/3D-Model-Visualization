from flask import Flask, jsonify, send_file, send_from_directory, request
from flask_cors import CORS
import os
import json
import numpy as np
import trimesh
from urllib.parse import quote


PROFILE_THRESHOLDS = {
    "default": {"rmse_max": 3.0, "fitness_min": 0.20, "overlap_min": 0.20, "center_dist_max": 40.0},
    "intraoral_face_strict": {"rmse_max": 2.6, "fitness_min": 0.24, "overlap_min": 0.24, "center_dist_max": 35.0},
    "intraoral_face_relaxed": {"rmse_max": 3.8, "fitness_min": 0.16, "overlap_min": 0.16, "center_dist_max": 50.0},
    "face_face": {"rmse_max": 2.2, "fitness_min": 0.28, "overlap_min": 0.30, "center_dist_max": 30.0}
}
DEVICE_PROFILE_ADJUST = {
    "standard": {"rmse_mul": 1.0, "fitness_mul": 1.0, "overlap_mul": 1.0, "center_mul": 1.0},
    "high_noise_mobile": {"rmse_mul": 1.18, "fitness_mul": 0.90, "overlap_mul": 0.85, "center_mul": 1.12},
    "lab_scanner": {"rmse_mul": 0.90, "fitness_mul": 1.06, "overlap_mul": 1.08, "center_mul": 0.92}
}


def infer_profile_from_paths(source_path, target_path):
    s = str(source_path or "").lower()
    t = str(target_path or "").lower()
    if "intraoral" in s or "intraoral" in t:
        if "face" in s or "face" in t:
            return "intraoral_face_strict"
        return "default"
    if "face" in s and "face" in t:
        return "face_face"
    return "default"


def get_profile_thresholds(profile_name, relaxed=False):
    if profile_name and profile_name in PROFILE_THRESHOLDS:
        p = profile_name
    elif relaxed:
        p = "intraoral_face_relaxed"
    else:
        p = "default"
    cfg = PROFILE_THRESHOLDS.get(p, PROFILE_THRESHOLDS["default"])
    return p, dict(cfg)


def apply_device_adjustments(thresholds, device_profile):
    adj = DEVICE_PROFILE_ADJUST.get(str(device_profile or "standard"), DEVICE_PROFILE_ADJUST["standard"])
    out = dict(thresholds)
    out["rmse_max"] = float(out["rmse_max"] * adj["rmse_mul"])
    out["fitness_min"] = float(out["fitness_min"] * adj["fitness_mul"])
    out["overlap_min"] = float(out["overlap_min"] * adj["overlap_mul"])
    out["center_dist_max"] = float(out["center_dist_max"] * adj["center_mul"])
    return out


def sample_points_with_normals(mesh, n_points=4000, seed=42):
    """Sample mesh vertices and corresponding normals deterministically."""
    verts = np.asarray(mesh.vertices)
    if len(verts) == 0:
        return np.empty((0, 3), dtype=float), np.empty((0, 3), dtype=float), np.empty((0,), dtype=int)

    normals = np.asarray(mesh.vertex_normals) if hasattr(mesh, "vertex_normals") else np.zeros_like(verts)
    if len(normals) != len(verts):
        normals = np.zeros_like(verts)

    rng = np.random.default_rng(seed)
    count = min(int(n_points), len(verts))
    idx = rng.choice(len(verts), size=count, replace=False)
    return verts[idx], normals[idx], idx


def sample_curvature(mesh, sampled_vertex_idx):
    """
    Curvature proxy from vertex defects when available.
    Returns normalized [0,1] values for sampled vertices.
    """
    n = len(sampled_vertex_idx)
    if n == 0:
        return np.empty((0,), dtype=float)
    try:
        defects = np.asarray(mesh.vertex_defects)
        if len(defects) != len(mesh.vertices):
            return np.zeros((n,), dtype=float)
        c = np.abs(defects[sampled_vertex_idx])
        lo = np.percentile(c, 5)
        hi = np.percentile(c, 95)
        denom = max(hi - lo, 1e-9)
        c = np.clip((c - lo) / denom, 0.0, 1.0)
        return c.astype(float)
    except Exception:
        return np.zeros((n,), dtype=float)


def nearest_on_target(dst_mesh, query_points, target_sample_n=18000):
    """
    Find nearest target points for query_points.
    Prefers mesh closest-point query; falls back to sampled-vertex NN to avoid hard dependency failures.
    """
    try:
        cp, d, tri = trimesh.proximity.closest_point(dst_mesh, query_points)
        return np.asarray(cp, dtype=float), np.asarray(d, dtype=float), np.asarray(tri, dtype=int), "surface"
    except Exception:
        target_pts, _, _ = sample_points_with_normals(dst_mesh, n_points=target_sample_n, seed=19)
        if len(target_pts) == 0:
            return np.zeros_like(query_points), np.full((len(query_points),), 1e9), np.full((len(query_points),), -1), "empty"
        cp = np.zeros_like(query_points, dtype=float)
        dd = np.zeros((len(query_points),), dtype=float)
        tri = np.full((len(query_points),), -1, dtype=int)
        # Chunked brute force for memory safety.
        chunk = 512
        for i in range(0, len(query_points), chunk):
            q = query_points[i:i + chunk]
            diff = q[:, None, :] - target_pts[None, :, :]
            d2 = np.sum(diff * diff, axis=2)
            idx = np.argmin(d2, axis=1)
            cp[i:i + chunk] = target_pts[idx]
            dd[i:i + chunk] = np.sqrt(np.take_along_axis(d2, idx[:, None], axis=1).reshape(-1))
        return cp, dd, tri, "vertex_fallback"


def append_registration_log(patient_id, payload):
    """Append telemetry as JSONL for offline analysis."""
    try:
        out_dir = os.path.join(ROOT_FOLDER, 'processed', patient_id)
        os.makedirs(out_dir, exist_ok=True)
        log_path = os.path.join(out_dir, 'registration_logs.jsonl')
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(payload, ensure_ascii=True) + '\n')
    except Exception as e:
        print(f"Telemetry log write warning: {e}")


def estimate_rigid_kabsch(src, dst):
    """Estimate rigid transform mapping src -> dst using SVD."""
    c_src = src.mean(axis=0)
    c_dst = dst.mean(axis=0)
    src_c = src - c_src
    dst_c = dst - c_dst

    H = src_c.T @ dst_c
    U, _, Vt = np.linalg.svd(H)
    R = Vt.T @ U.T
    if np.linalg.det(R) < 0:
        Vt[-1, :] *= -1
        R = Vt.T @ U.T
    t = c_dst - R @ c_src

    M = np.eye(4)
    M[:3, :3] = R
    M[:3, 3] = t
    return M


def compute_alignment_metrics(src_mesh, dst_mesh, M, sample_n=5000):
    """Compute simple quality metrics after applying M to source."""
    src_pts, _, _ = sample_points_with_normals(src_mesh, n_points=sample_n, seed=11)
    dst_pts, _, _ = sample_points_with_normals(dst_mesh, n_points=max(sample_n, 8000), seed=13)
    if len(src_pts) == 0 or len(dst_pts) == 0:
        return {
            "rmse": 1e9,
            "fitness": 0.0,
            "overlap": 0.0,
            "center_dist": 1e9
        }

    src_t = (M[:3, :3] @ src_pts.T).T + M[:3, 3]
    _, dists, _, _ = nearest_on_target(dst_mesh, src_t, target_sample_n=max(sample_n, 12000))
    dists = np.asarray(dists, dtype=float)
    rmse = float(np.sqrt(np.mean(dists * dists)))

    # In this codebase, units are mm for most cases; 3.5mm is a practical overlap threshold.
    overlap = float(np.mean(dists < 3.5))
    fitness = overlap

    src_center = src_t.mean(axis=0)
    dst_center = dst_pts.mean(axis=0)
    center_dist = float(np.linalg.norm(src_center - dst_center))

    return {
        "rmse": rmse,
        "fitness": fitness,
        "overlap": overlap,
        "center_dist": center_dist
    }


def build_anchor_pairs(src_mesh, dst_mesh, M0):
    """
    Model-assisted landmark suggestions from robust geometric anchors (bbox extremes).
    """
    src_v = np.asarray(src_mesh.vertices)
    if len(src_v) == 0:
        return []
    # Axes extremes in source.
    anchor_indices = {
        "x_min": int(np.argmin(src_v[:, 0])),
        "x_max": int(np.argmax(src_v[:, 0])),
        "y_min": int(np.argmin(src_v[:, 1])),
        "y_max": int(np.argmax(src_v[:, 1])),
        "z_min": int(np.argmin(src_v[:, 2])),
        "z_max": int(np.argmax(src_v[:, 2]))
    }
    anchors = []
    for name, idx in anchor_indices.items():
        p_src = src_v[idx]
        p_src_t = (M0[:3, :3] @ p_src) + M0[:3, 3]
        p_tgt, d, _, _ = nearest_on_target(dst_mesh, p_src_t.reshape(1, 3), target_sample_n=18000)
        anchors.append({
            "name": name,
            "source_point": p_src.astype(float).tolist(),
            "target_point": p_tgt[0].astype(float).tolist(),
            "distance": float(d[0])
        })
    anchors = sorted(anchors, key=lambda a: a["distance"])
    return anchors[:4]


def nearest_neighbors_bruteforce(query_pts, ref_pts, chunk=1024):
    """
    For each query point, find nearest ref point index and distance using chunked brute force.
    """
    if len(query_pts) == 0 or len(ref_pts) == 0:
        return np.zeros((len(query_pts),), dtype=int), np.full((len(query_pts),), 1e9, dtype=float)
    nn_idx = np.zeros((len(query_pts),), dtype=int)
    nn_d = np.zeros((len(query_pts),), dtype=float)
    for i in range(0, len(query_pts), chunk):
        q = query_pts[i:i + chunk]
        diff = q[:, None, :] - ref_pts[None, :, :]
        d2 = np.sum(diff * diff, axis=2)
        idx = np.argmin(d2, axis=1)
        nn_idx[i:i + chunk] = idx
        nn_d[i:i + chunk] = np.sqrt(np.take_along_axis(d2, idx[:, None], axis=1).reshape(-1))
    return nn_idx, nn_d


def build_semi_auto_suggestions(src_mesh, dst_mesh, force_mouth_roi=True, num_pairs=3, suggestion_mode="correspondence_v3"):
    """
    Build suggested point pairs with strong geometric filtering:
    coarse init -> hard target ROI around transformed source -> mutual NN -> RANSAC verification.
    """
    src_pts, src_normals, src_idx = sample_points_with_normals(src_mesh, n_points=6500, seed=21)
    dst_pts, dst_normals, _ = sample_points_with_normals(dst_mesh, n_points=22000, seed=23)
    nearest_mode = "mutual_ransac_roi_v4"
    if len(src_pts) == 0 or len(dst_pts) == 0:
        raise RuntimeError("Empty source or target vertices")

    # Coarse init: align centroids.
    c_src = src_pts.mean(axis=0)
    c_dst = dst_pts.mean(axis=0)
    M0 = np.eye(4)
    M0[:3, 3] = c_dst - c_src

    # Lightweight ICP for better coarse alignment.
    M_icp, _, _ = trimesh.registration.icp(
        src_pts, dst_pts, initial=M0, threshold=6.0, max_iterations=25
    )
    M0 = np.array(M_icp, dtype=float)

    src_t = (M0[:3, :3] @ src_pts.T).T + M0[:3, 3]

    # Hard target ROI around transformed jaw AABB to avoid distant facial regions.
    src_lo = np.percentile(src_t, 5, axis=0)
    src_hi = np.percentile(src_t, 95, axis=0)
    ext = np.maximum(src_hi - src_lo, 1e-6)
    margin = np.clip(0.32 * np.max(ext), 8.0, 28.0)
    aabb_mask = np.all((dst_pts >= (src_lo - margin)) & (dst_pts <= (src_hi + margin)), axis=1)

    # Secondary neighborhood ROI from nearest-to-transformed-source.
    src_probe = src_t[::max(1, len(src_t) // 1400)]
    _, dst_to_src_d = nearest_neighbors_bruteforce(dst_pts, src_probe, chunk=1024)
    roi_pct = 7.0 if force_mouth_roi else 13.0
    roi_cut = float(np.percentile(dst_to_src_d, roi_pct))
    roi_cut = max(2.5, min(roi_cut, 20.0))
    near_mask = dst_to_src_d <= roi_cut

    roi_mask = aabb_mask & near_mask if np.any(aabb_mask) else near_mask
    if np.sum(roi_mask) < 900:
        k = min(3600, len(dst_pts))
        keep_idx = np.argsort(dst_to_src_d)[:k]
        dst_roi = dst_pts[keep_idx]
        dst_roi_normals = dst_normals[keep_idx]
    else:
        dst_roi = dst_pts[roi_mask]
        dst_roi_normals = dst_normals[roi_mask]

    # Mutual nearest correspondences on ROI.
    s2t_idx, s2t_d = nearest_neighbors_bruteforce(src_t, dst_roi, chunk=1024)
    t2s_idx, _ = nearest_neighbors_bruteforce(dst_roi, src_t, chunk=1024)
    mutual_mask = np.array([t2s_idx[j] == i for i, j in enumerate(s2t_idx)], dtype=bool)

    # Keep best source for each target index (one-to-one).
    best_by_target = {}
    for i, (j, d, is_mutual) in enumerate(zip(s2t_idx, s2t_d, mutual_mask)):
        if force_mouth_roi and (not is_mutual):
            continue
        prev = best_by_target.get(int(j))
        if (prev is None) or (d < prev[1]):
            best_by_target[int(j)] = (i, float(d))
    cand_idx = np.array([v[0] for v in best_by_target.values()], dtype=int)
    if len(cand_idx) < 3:
        pick_n = max(20, int(num_pairs) * 8)
        cand_idx = np.argsort(s2t_d)[:pick_n]

    # Distance gate.
    d_sel = s2t_d[cand_idx]
    d_gate = float(np.percentile(d_sel, 60))
    d_gate = max(1.8, min(d_gate, 9.5))
    cand_idx = cand_idx[d_sel <= d_gate]
    if len(cand_idx) < 3:
        pick_n = max(20, int(num_pairs) * 8)
        cand_idx = np.argsort(s2t_d)[:pick_n]

    tgt_idx = s2t_idx[cand_idx]
    closest_pts = dst_roi[tgt_idx]

    # RANSAC verify geometric consistency on candidate correspondences.
    src_cand = src_pts[cand_idx]
    dst_cand = closest_pts
    rng = np.random.default_rng(101)
    best_inliers = np.zeros((len(cand_idx),), dtype=bool)
    best_count = 0
    best_residual = 1e9
    if len(cand_idx) >= 3:
        n_iter = min(180, max(40, len(cand_idx) * 3))
        th = 3.8 if force_mouth_roi else 5.0
        for _ in range(n_iter):
            tri = rng.choice(len(cand_idx), size=3, replace=False)
            try:
                M_try = estimate_rigid_kabsch(src_cand[tri], dst_cand[tri])
            except Exception:
                continue
            src_try = (M_try[:3, :3] @ src_cand.T).T + M_try[:3, 3]
            residual = np.linalg.norm(src_try - dst_cand, axis=1)
            inliers = residual <= th
            cnt = int(np.sum(inliers))
            med = float(np.median(residual[inliers])) if cnt > 0 else 1e9
            if (cnt > best_count) or (cnt == best_count and med < best_residual):
                best_inliers = inliers
                best_count = cnt
                best_residual = med
    if np.sum(best_inliers) >= 3:
        cand_idx = cand_idx[best_inliers]
        tgt_idx = s2t_idx[cand_idx]
        closest_pts = dst_roi[tgt_idx]

    src_normals_t = (M0[:3, :3] @ src_normals[cand_idx].T).T
    tgt_normals = dst_roi_normals[tgt_idx] if len(dst_roi_normals) else np.zeros_like(src_normals_t)

    # Score v4 = distance + normal consistency + curvature + mutuality.
    dist_score = 1.0 / (1.0 + s2t_d[cand_idx])
    normal_dot = np.sum(src_normals_t * tgt_normals, axis=1)
    normal_dot = np.clip(normal_dot, -1.0, 1.0)
    normal_score = (normal_dot + 1.0) * 0.5
    src_curv = sample_curvature(src_mesh, src_idx[cand_idx])
    mutuality = mutual_mask[cand_idx].astype(float)
    score = 0.62 * dist_score + 0.20 * normal_score + 0.12 * src_curv + 0.06 * mutuality
    order = np.argsort(-score)

    min_spread = max(np.max(src_mesh.extents) * 0.10, 10.0)
    selected_pairs = []
    selected_src = []
    for jj in order:
        i_src = int(cand_idx[jj])
        s = src_pts[i_src]
        if selected_src and min(np.linalg.norm(s - q) for q in selected_src) < min_spread:
            continue
        selected_src.append(s)
        selected_pairs.append({
            "source_point": src_pts[i_src].astype(float).tolist(),
            "target_point": closest_pts[jj].astype(float).tolist(),
            "raw_score": float(score[jj]),
            "dist_mm": float(s2t_d[i_src]),
            "normal_score": float(normal_score[jj]),
            "reason": "mutual+ransac verified correspondence"
        })
        if len(selected_pairs) >= max(10, int(num_pairs) * 3):
            break

    # Optional anchors only when explicitly requested.
    if suggestion_mode == "anchors":
        anchors = build_anchor_pairs(src_mesh, dst_mesh, M0)
        for a in anchors:
            selected_pairs.append({
                "source_point": a["source_point"],
                "target_point": a["target_point"],
                "raw_score": 1.0 / (1.0 + a["distance"]),
                "dist_mm": float(a["distance"]),
                "normal_score": 0.0,
                "reason": f"model-assisted anchor ({a['name']})"
            })

    # Final rank.
    selected_pairs = sorted(selected_pairs, key=lambda x: x["raw_score"], reverse=True)

    # Fallback augmentation: when strict mutual+RANSAC is too sparse (common in intraoral<->face),
    # backfill additional pairs from relaxed nearest neighbors inside ROI.
    min_required = max(3, int(num_pairs))
    if len(selected_pairs) < min_required:
        relaxed_order = np.argsort(s2t_d)
        seen_src = []
        seen_tgt = []
        # keep already-selected points in dedupe buffers
        for p in selected_pairs:
            seen_src.append(np.array(p["source_point"], dtype=float))
            seen_tgt.append(np.array(p["target_point"], dtype=float))
        for i_src in relaxed_order:
            s = src_pts[int(i_src)]
            t = dst_roi[int(s2t_idx[int(i_src)])]
            if seen_src and min(np.linalg.norm(s - q) for q in seen_src) < min_spread:
                continue
            if seen_tgt and min(np.linalg.norm(t - q) for q in seen_tgt) < max(6.0, min_spread * 0.65):
                continue
            dmm = float(s2t_d[int(i_src)])
            # relaxed candidates are lower confidence by construction
            relaxed_score = float(0.22 / (1.0 + dmm))
            selected_pairs.append({
                "source_point": s.astype(float).tolist(),
                "target_point": t.astype(float).tolist(),
                "raw_score": relaxed_score,
                "dist_mm": dmm,
                "normal_score": 0.0,
                "reason": "relaxed roi fallback correspondence"
            })
            seen_src.append(s)
            seen_tgt.append(t)
            if len(selected_pairs) >= min_required:
                break

    top_candidates = [{
        "score": float(p["raw_score"]),
        "reason": p["reason"],
        "dist_mm": float(p.get("dist_mm", 0.0)),
        "normal_score": float(p.get("normal_score", 0.0))
    } for p in selected_pairs[:6]]
    final_pairs = []
    final_src = []
    final_tgt = []
    min_tgt_spread = max(np.max(src_mesh.extents) * 0.08, 7.5)
    for p in selected_pairs:
        s = np.array(p["source_point"], dtype=float)
        t = np.array(p["target_point"], dtype=float)
        if final_src and min(np.linalg.norm(s - q) for q in final_src) < min_spread:
            continue
        if final_tgt and min(np.linalg.norm(t - q) for q in final_tgt) < min_tgt_spread:
            continue
        final_pairs.append(p)
        final_src.append(s)
        final_tgt.append(t)
        if len(final_pairs) >= min_required:
            break
    if len(final_pairs) < min_required:
        final_pairs = selected_pairs[:min_required]

    raw_scores = np.array([p["raw_score"] for p in final_pairs], dtype=float) if len(final_pairs) else np.array([0.1], dtype=float)
    selected = final_pairs[:min_required]
    min_s = float(np.min(raw_scores))
    max_s = float(np.max(raw_scores))
    denom = max(max_s - min_s, 1e-6)

    pairs = []
    for k, p in enumerate(selected, start=1):
        conf = 0.55 + 0.4 * float((p["raw_score"] - min_s) / denom)
        pairs.append({
            "id": int(k),
            "source_point": p["source_point"],
            "target_point": p["target_point"],
            "confidence": float(np.clip(conf, 0.0, 0.99)),
            "reason": p["reason"]
        })

    return M0, pairs, {
        "roi_mode": "mouth_only" if force_mouth_roi else "full_face",
        "attempt_count": 1,
        "nearest_mode": nearest_mode,
        "suggestion_mode": suggestion_mode,
        "top_candidates": top_candidates
    }

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)  # Enable CORS for all routes

# Đường dẫn đến thư mục gốc chứa các thư mục dữ liệu
ROOT_FOLDER = r"D:\Lab\3D Model Visualization\Cases for AI Fernando Polanco\Cases for AI Fernando Polanco"

print(f"Starting Flask server...")
print(f"Root folder: {ROOT_FOLDER}")
print(f"Root folder exists: {os.path.exists(ROOT_FOLDER)}")
print(f"Root folder contents: {os.listdir(ROOT_FOLDER) if os.path.exists(ROOT_FOLDER) else 'N/A'}")

@app.route('/')
def index():
    """Serve the main HTML page"""
    return send_from_directory('static', 'index.html')

@app.route('/api/patients', methods=['GET'])
def get_patients():
    """Get list of all patients"""
    try:
        if not os.path.exists(ROOT_FOLDER):
            return jsonify({"error": "Root folder not found"}), 404
        
        patients = []
        for folder in os.listdir(ROOT_FOLDER):
            folder_path = os.path.join(ROOT_FOLDER, folder)
            if os.path.isdir(folder_path) and folder.lower().startswith('patient'):
                patients.append({
                    "id": folder,
                    "name": folder,
                    "path": folder_path
                })
        
        return jsonify({"patients": patients})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/patient/<patient_id>/data', methods=['GET'])
def get_patient_data(patient_id):
    """Get data structure for a specific patient"""
    try:
        patient_path = os.path.join(ROOT_FOLDER, patient_id)
        
        if not os.path.exists(patient_path):
            return jsonify({"error": "Patient not found"}), 404
        
        data_types = {
            "Face scans": [],
            "Intraoral scans": [],
            "Pre-Op CBCT": []
        }
        
        # Scan each data type folder
        for scan_type in data_types.keys():
            scan_folder_path = os.path.join(patient_path, scan_type)
            
            if os.path.exists(scan_folder_path):
                # Walk through all subdirectories
                for root, dirs, files in os.walk(scan_folder_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        relative_path = os.path.relpath(file_path, ROOT_FOLDER)
                        
                        file_ext = file.lower().split('.')[-1]
                        if file_ext in ['ply', 'stl', 'dcm']:
                            data_types[scan_type].append({
                                "name": file,
                                "path": relative_path,
                                "type": file_ext,
                                "size": os.path.getsize(file_path)
                            })
        
        return jsonify({
            "patient_id": patient_id,
            "data": data_types
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/file/<path:filepath>', methods=['GET'])
def get_file(filepath):
    """Serve individual files (DICOM, PLY, STL)"""
    try:
        full_path = os.path.join(ROOT_FOLDER, filepath)
        
        if not os.path.exists(full_path):
            return jsonify({"error": "File not found"}), 404
        
        # Determine mimetype based on extension
        ext = filepath.lower().split('.')[-1]
        mimetype_map = {
            'ply': 'application/octet-stream',
            'stl': 'application/octet-stream',
            'dcm': 'application/dicom'
        }
        
        mimetype = mimetype_map.get(ext, 'application/octet-stream')
        
        return send_file(full_path, mimetype=mimetype)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/cbct-series/<patient_id>', methods=['GET'])
def get_cbct_series(patient_id):
    """REG-01.5: Get CBCT series grouped by Series Instance UID"""
    try:
        patient_path = os.path.join(ROOT_FOLDER, patient_id)
        
        if not os.path.exists(patient_path):
            return jsonify({"error": "Patient not found"}), 404
        
        cbct_folder = os.path.join(patient_path, "Pre-Op CBCT")
        
        if not os.path.exists(cbct_folder):
            return jsonify({"series": []})
        
        # Group DICOM files by series
        series_map = {}
        dcm_files = []
        
        # Find all DICOM files
        for root, dirs, files in os.walk(cbct_folder):
            for file in files:
                if file.lower().endswith('.dcm'):
                    file_path = os.path.join(root, file)
                    dcm_files.append({
                        'name': file,
                        'path': os.path.relpath(file_path, ROOT_FOLDER)
                    })
        
        # For now, group all DICOM files as a single series
        # In production, parse Series Instance UID from DICOM headers
        if dcm_files:
            series_map['default_series'] = {
                "series_id": "default_series",
                "series_name": "CBCT Scan",
                "files": dcm_files
            }
        
        return jsonify({"series": list(series_map.values())})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Registration: compute rigid transform from paired landmarks (Kabsch)
@app.route('/api/patient/<patient_id>/register/manual', methods=['POST'])
def api_compute_manual_registration(patient_id):
    try:
        data = request.get_json()
        source_points = data.get('source_points')
        target_points = data.get('target_points')

        if not source_points or not target_points:
            return jsonify({"error": "Missing points"}), 400

        if len(source_points) != len(target_points):
            return jsonify({"error": "Source and Target must have same number of points"}), 400

        if len(source_points) < 3:
            return jsonify({"error": "At least 3 points are required"}), 400

        # Convert to numpy arrays
        src = np.array(source_points, dtype=float)
        dst = np.array(target_points, dtype=float)

        def kabsch(src_pts, dst_pts):
            c_src = src_pts.mean(axis=0)
            c_dst = dst_pts.mean(axis=0)
            src_c = src_pts - c_src
            dst_c = dst_pts - c_dst
            H = src_c.T @ dst_c
            U, _, Vt = np.linalg.svd(H)
            R = Vt.T @ U.T
            if np.linalg.det(R) < 0:
                Vt[-1, :] *= -1
                R = Vt.T @ U.T
            t = c_dst - R @ c_src
            return R, t

        # Robust fit for >=4 points: choose the transform with max inliers, then refit on inliers.
        n = len(src)
        inlier_threshold = 5.0  # mm
        rng = np.random.default_rng(123)
        candidate_triplets = []
        if n <= 7:
            from itertools import combinations
            candidate_triplets = list(combinations(range(n), 3))
        else:
            # Bounded random subsets for speed.
            seen = set()
            while len(candidate_triplets) < 120:
                tri = tuple(sorted(rng.choice(n, size=3, replace=False).tolist()))
                if tri in seen:
                    continue
                seen.add(tri)
                candidate_triplets.append(tri)

        best = None
        for tri in candidate_triplets:
            tri = np.array(tri, dtype=int)
            R_i, t_i = kabsch(src[tri], dst[tri])
            src_t_all = (R_i @ src.T).T + t_i
            err = np.linalg.norm(src_t_all - dst, axis=1)
            inliers = err <= inlier_threshold
            inlier_count = int(np.sum(inliers))
            score = (inlier_count, -float(np.median(err)))
            if best is None or score > best["score"]:
                best = {
                    "R": R_i,
                    "t": t_i,
                    "err": err,
                    "inliers": inliers,
                    "score": score
                }

        if best is not None and np.sum(best["inliers"]) >= 3:
            in_idx = np.where(best["inliers"])[0]
            R, t = kabsch(src[in_idx], dst[in_idx])
            inlier_count = int(len(in_idx))
        else:
            # Fallback to all points.
            R, t = kabsch(src, dst)
            inlier_count = n

        # Compute RMSE on all points and inliers
        src_transformed = (R @ src.T).T + t
        err_all = np.linalg.norm(src_transformed - dst, axis=1)
        rmse = float(np.sqrt(np.mean(err_all ** 2)))
        if inlier_count >= 3:
            # Recompute inliers from final transform
            final_inliers = err_all <= inlier_threshold
            inlier_rmse = float(np.sqrt(np.mean((err_all[final_inliers] ** 2)))) if np.any(final_inliers) else rmse
            inlier_count = int(np.sum(final_inliers))
        else:
            inlier_rmse = rmse

        return jsonify({
            "rotation": R.tolist(),
            "translation": t.tolist(),
            "rmse": rmse,
            "inlier_rmse": inlier_rmse,
            "inlier_count": int(inlier_count),
            "total_points": int(n)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/patient/<patient_id>/register/apply', methods=['POST'])
def api_apply_registration(patient_id):
    try:
        data = request.get_json()
        source_path = data.get('source_path')
        rotation = data.get('rotation')
        translation = data.get('translation')

        if not source_path or not rotation or not translation:
            return jsonify({"error": "Missing source_path, rotation, or translation"}), 400

        # Resolve full source path
        full_source = os.path.join(ROOT_FOLDER, source_path)
        if not os.path.exists(full_source):
            return jsonify({"error": "Source file not found"}), 404

        mesh = trimesh.load(full_source, process=False)

        # Build 4x4 transform
        M = np.eye(4)
        M[:3, :3] = np.array(rotation, dtype=float)
        M[:3, 3] = np.array(translation, dtype=float)

        mesh.apply_transform(M)

        # Save to processed folder
        out_dir = os.path.join(ROOT_FOLDER, 'processed', patient_id)
        os.makedirs(out_dir, exist_ok=True)

        base = os.path.basename(source_path)
        name, ext = os.path.splitext(base)
        out_name = f"registered_{name}.ply"
        out_path = os.path.join(out_dir, out_name)

        mesh.export(out_path)

        rel_path = os.path.relpath(out_path, ROOT_FOLDER)
        url_path = f"/api/file/{quote(rel_path)}"

        return jsonify({"file_path": rel_path, "file_url": url_path})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/patient/<string:patient_id>/register/icp', methods=['POST'])
def register_icp(patient_id):
    try:
        data = request.json
        full_source = os.path.join(ROOT_FOLDER, data.get('source_path', ''))
        full_target = os.path.join(ROOT_FOLDER, data.get('target_path', ''))
        source_path = data.get('source_path', '')
        target_path = data.get('target_path', '')
        init_rot = np.array(data.get('rotation', np.eye(3)))
        init_trans = np.array(data.get('translation', [0, 0, 0]))
        requested_profile = data.get('profile')
        device_profile = str(data.get('device_profile', 'standard'))
        relaxed_gate = bool(data.get('relaxed_gate', False))

        if not os.path.exists(full_source) or not os.path.exists(full_target):
            return jsonify({"error": "Source or target file not found"}), 404

        # Load meshes
        src_mesh = trimesh.load(full_source, process=False)
        dst_mesh = trimesh.load(full_target, process=False)
        src_orig = src_mesh.copy()

        # Apply initial transform to source
        init_matrix = np.eye(4)
        init_matrix[:3, :3] = init_rot
        init_matrix[:3, 3] = init_trans
        src_init = src_mesh.copy()
        src_init.apply_transform(init_matrix)
        src_pts, _, _ = sample_points_with_normals(src_init, n_points=9000, seed=31)
        dst_pts, _, _ = sample_points_with_normals(dst_mesh, n_points=14000, seed=37)
        if len(src_pts) < 3 or len(dst_pts) < 3:
            return jsonify({"error": "Not enough sampled points for ICP"}), 400

        # Run ICP
        # transform: (4, 4) float, homogeneous transformation matrix
        # cost: float, cost of alignment (RMSE usually)
        # icp returns (matrix, transformed_source, cost)
        # We start with identity as we already transformed src
        matrix, transformed_src, cost = trimesh.registration.icp(
            src_pts, dst_pts,
            initial=np.eye(4),
            threshold=1.0,    # Distance threshold for matching (adjust based on units, e.g. mm)
            max_iterations=50
        )

        # Combine transforms: M_total = M_icp * M_init
        final_matrix = matrix @ init_matrix
        final_R = final_matrix[:3, :3]
        final_t = final_matrix[:3, 3]

        metrics = compute_alignment_metrics(src_orig, dst_mesh, final_matrix, sample_n=5000)
        inferred_profile = infer_profile_from_paths(source_path, target_path)
        chosen_profile_name = str(requested_profile or inferred_profile)
        chosen_profile_name, thr = get_profile_thresholds(chosen_profile_name, relaxed=relaxed_gate)
        thr = apply_device_adjustments(thr, device_profile)
        quality_passed = (
            metrics["rmse"] <= thr["rmse_max"] and
            metrics["fitness"] >= thr["fitness_min"] and
            metrics["overlap"] >= thr["overlap_min"] and
            metrics["center_dist"] <= thr["center_dist_max"]
        )
        append_registration_log(patient_id, {
            "event": "refine_icp",
            "flow": str(data.get("flow", "default")),
            "source_path": source_path,
            "target_path": target_path,
            "profile": chosen_profile_name,
            "device_profile": device_profile,
            "relaxed_gate": relaxed_gate,
            "rmse": float(metrics["rmse"]),
            "fitness": float(metrics["fitness"]),
            "overlap": float(metrics["overlap"]),
            "center_dist": float(metrics["center_dist"]),
            "gate_passed": bool(quality_passed)
        })

        return jsonify({
            "rotation": final_R.tolist(),
            "translation": final_t.tolist(),
            "rmse": float(metrics["rmse"]),
            "fitness": float(metrics["fitness"]),
            "overlap": float(metrics["overlap"]),
            "center_dist": float(metrics["center_dist"]),
            "low_confidence": not bool(quality_passed),
            "profile": chosen_profile_name,
            "device_profile": device_profile,
            "inferred_profile": inferred_profile,
            "quality_gate": {
                "rmse_max": float(thr["rmse_max"]),
                "fitness_min": float(thr["fitness_min"]),
                "overlap_min": float(thr["overlap_min"]),
                "center_dist_max": float(thr["center_dist_max"]),
                "passed": bool(quality_passed)
            },
            "refinement_matrix": matrix.tolist()
        })
    except Exception as e:
        print(f"ICP Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/patient/<patient_id>/register/semi_auto/suggest_points', methods=['POST'])
def suggest_semi_auto_points(patient_id):
    try:
        data = request.get_json() or {}
        source_path = data.get("source_path")
        target_path = data.get("target_path")
        force_mouth_roi = bool(data.get("force_mouth_roi", True))
        num_pairs = int(data.get("num_pairs", 3))
        suggestion_mode = str(data.get("suggestion_mode", "correspondence_v3"))
        requested_profile = data.get("profile")
        device_profile = str(data.get("device_profile", "standard"))

        if not source_path or not target_path:
            return jsonify({"error": "Missing source_path or target_path"}), 400

        full_source = os.path.join(ROOT_FOLDER, source_path)
        full_target = os.path.join(ROOT_FOLDER, target_path)
        if not os.path.exists(full_source) or not os.path.exists(full_target):
            return jsonify({"error": "Source or target file not found"}), 404

        src_mesh = trimesh.load(full_source, process=False)
        dst_mesh = trimesh.load(full_target, process=False)

        inferred_profile = infer_profile_from_paths(source_path, target_path)
        chosen_profile, thresholds = get_profile_thresholds(str(requested_profile or inferred_profile), relaxed=False)
        thresholds = apply_device_adjustments(thresholds, device_profile)

        M0, pairs, diagnostics = build_semi_auto_suggestions(
            src_mesh,
            dst_mesh,
            force_mouth_roi=force_mouth_roi,
            num_pairs=max(3, num_pairs),
            suggestion_mode=suggestion_mode
        )
        append_registration_log(patient_id, {
            "event": "semi_auto_suggest",
            "source_path": source_path,
            "target_path": target_path,
            "profile": chosen_profile,
            "device_profile": device_profile,
            "suggestion_mode": suggestion_mode,
            "pair_count": int(len(pairs)),
            "avg_confidence": float(np.mean([p.get("confidence", 0.0) for p in pairs])) if pairs else 0.0,
            "diagnostics": diagnostics
        })

        return jsonify({
            "pairs": pairs,
            "profile": chosen_profile,
            "device_profile": device_profile,
            "inferred_profile": inferred_profile,
            "device_profiles": list(DEVICE_PROFILE_ADJUST.keys()),
            "thresholds": thresholds,
            "coarse_init": {
                "rotation": M0[:3, :3].tolist(),
                "translation": M0[:3, 3].tolist(),
                "strategy": f"centroid_icp_{suggestion_mode}"
            },
            "diagnostics": diagnostics
        })
    except Exception as e:
        print(f"Semi-auto suggestion error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/patient/<patient_id>/register/semi_auto/profiles', methods=['GET'])
def get_semi_auto_profiles(patient_id):
    try:
        return jsonify({
            "profiles": PROFILE_THRESHOLDS,
            "device_profiles": DEVICE_PROFILE_ADJUST,
            "default_profile": "default"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/patient/<patient_id>/register/metrics', methods=['GET'])
def get_registration_metrics(patient_id):
    """
    Simple aggregate metrics for dashboard from JSONL telemetry.
    """
    try:
        log_path = os.path.join(ROOT_FOLDER, 'processed', patient_id, 'registration_logs.jsonl')
        if not os.path.exists(log_path):
            return jsonify({
                "total_events": 0,
                "semi_auto_runs": 0,
                "gate_pass_rate": 0.0,
                "avg_rmse": None
            })

        events = []
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except Exception:
                    continue

        refine_events = [e for e in events if e.get("event") == "refine_icp"]
        semi_runs = [e for e in refine_events if e.get("flow") in ("semi_auto", "manual_refine")]
        passed = [e for e in semi_runs if bool(e.get("gate_passed"))]
        rmses = [float(e.get("rmse")) for e in semi_runs if e.get("rmse") is not None]

        return jsonify({
            "total_events": len(events),
            "semi_auto_runs": len(semi_runs),
            "gate_pass_rate": float(len(passed) / len(semi_runs)) if semi_runs else 0.0,
            "avg_rmse": float(np.mean(rmses)) if rmses else None
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/patient/<patient_id>/register/semi_auto/report', methods=['POST'])
def post_semi_auto_report(patient_id):
    """
    Client-side session telemetry: acceptance/edit/re-run/time metrics.
    """
    try:
        data = request.get_json() or {}
        payload = {
            "event": "semi_auto_session_report",
            "source_path": data.get("source_path"),
            "target_path": data.get("target_path"),
            "profile": data.get("profile"),
            "suggest_count": int(data.get("suggest_count", 0)),
            "accepted_pairs": int(data.get("accepted_pairs", 0)),
            "edited_pairs": int(data.get("edited_pairs", 0)),
            "reruns": int(data.get("reruns", 0)),
            "completed": int(data.get("completed", 0)),
            "time_to_finish_sec": data.get("time_to_finish_sec"),
            "last_gate_passed": bool(data.get("last_gate_passed", False))
        }
        append_registration_log(patient_id, payload)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print(f"Starting Flask server...")
    print(f"Root folder: {ROOT_FOLDER}")
    app.run(debug=False, port=5000, use_reloader=False)

