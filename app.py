from flask import Flask, jsonify, send_file, send_from_directory, request
from flask_cors import CORS
import os
import json
import numpy as np
import trimesh
from urllib.parse import quote

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

        # Compute centroids
        centroid_src = src.mean(axis=0)
        centroid_dst = dst.mean(axis=0)

        src_centered = src - centroid_src
        dst_centered = dst - centroid_dst

        # Covariance
        H = src_centered.T @ dst_centered

        # SVD
        U, S, Vt = np.linalg.svd(H)
        R = Vt.T @ U.T

        # Reflection correction
        if np.linalg.det(R) < 0:
            Vt[-1, :] *= -1
            R = Vt.T @ U.T

        t = centroid_dst - R @ centroid_src

        # Compute RMSE
        src_transformed = (R @ src.T).T + t
        rmse = float(np.sqrt(np.mean(np.sum((src_transformed - dst) ** 2, axis=1))))

        return jsonify({
            "rotation": R.tolist(),
            "translation": t.tolist(),
            "rmse": rmse
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


@app.route('/api/patient/<string:patient_id>/register/icp_trimesh_legacy', methods=['POST'])
def register_icp_legacy(patient_id):
    try:
        data = request.json
        full_source = os.path.join(ROOT_FOLDER, data.get('source_path', ''))
        full_target = os.path.join(ROOT_FOLDER, data.get('target_path', ''))
        init_rot = np.array(data.get('rotation', np.eye(3)))
        init_trans = np.array(data.get('translation', [0, 0, 0]))

        if not os.path.exists(full_source) or not os.path.exists(full_target):
            return jsonify({"error": "Source or target file not found"}), 404

        # Load meshes
        src = trimesh.load(full_source, process=False)
        dst = trimesh.load(full_target, process=False)

        # Apply initial transform to source
        init_matrix = np.eye(4)
        init_matrix[:3, :3] = init_rot
        init_matrix[:3, 3] = init_trans
        src.apply_transform(init_matrix)

        # Run ICP
        # transform: (4, 4) float, homogeneous transformation matrix
        # cost: float, cost of alignment (RMSE usually)
        # icp returns (matrix, transformed_source, cost)
        # We start with identity as we already transformed src
        matrix, transformed_src, cost = trimesh.registration.icp(
            src, dst,
            initial=np.eye(4),
            threshold=1.0,    # Distance threshold for matching (adjust based on units, e.g. mm)
            max_iterations=50
        )

        # Combine transforms: M_total = M_icp * M_init
        final_matrix = matrix @ init_matrix
        final_R = final_matrix[:3, :3]
        final_t = final_matrix[:3, 3]

        return jsonify({
            "rotation": final_R.tolist(),
            "translation": final_t.tolist(),
            "rmse": float(cost),
            "refinement_matrix": matrix.tolist()
        })
    except Exception as e:
        print(f"ICP Error: {e}")
        return jsonify({"error": str(e)}), 500

def extract_mouth_roi(face_mesh, jaw_mesh, distance_threshold=60.0):
    """
    Robust ROI extraction: Find all face points within X mm of the pre-aligned mouth scan.
    This works even if models are rotated or have large scales.
    """
    import open3d as o3d
    
    # 1. Convert to Open3D for fast neighborhood search
    face_pcd = o3d.geometry.PointCloud()
    face_pcd.points = o3d.utility.Vector3dVector(np.array(face_mesh.vertices))
    
    jaw_pcd = o3d.geometry.PointCloud()
    jaw_pcd.points = o3d.utility.Vector3dVector(np.array(jaw_mesh.vertices))
    
    # 2. Build KDTree for Face Scan
    kdtree = o3d.geometry.KDTreeFlann(face_pcd)
    
    # 3. Find face points near any jaw point
    roi_indices = set()
    
    # Strategy: Sample jaw points to speed up search
    sample_size = min(len(jaw_pcd.points), 1000)
    rng = np.random.default_rng(42)
    jaw_indices = rng.choice(len(jaw_pcd.points), sample_size, replace=False)
    
    for idx in jaw_indices:
        query_point = jaw_pcd.points[idx]
        [_, idx_found, _] = kdtree.search_radius_vector_3d(query_point, distance_threshold)
        roi_indices.update(idx_found)
    
    if len(roi_indices) < 200:
        print(f"WARNING: Neighborhood ROI too small ({len(roi_indices)} pts), using full face")
        return face_mesh
        
    print(f"Neighborhood ROI: {len(roi_indices)} points within {distance_threshold}mm of jaw")
    
    # 4. Extract points and create ROI mesh
    roi_vertices = np.asarray(face_pcd.points)[list(roi_indices)]
    roi_mesh = trimesh.points.PointCloud(roi_vertices)
    
    return roi_mesh

def get_aabb_center(mesh):
    """Get the center of the Axis-Aligned Bounding Box (AABB) to match Three.js logic."""
    bounds = mesh.bounds
    return (bounds[0] + bounds[1]) / 2.0


def _transform_from_rt(R, t):
    M = np.eye(4)
    M[:3, :3] = R
    M[:3, 3] = t
    return M


def _euler_xyz_to_matrix(ax_deg, ay_deg, az_deg):
    ax = np.deg2rad(ax_deg)
    ay = np.deg2rad(ay_deg)
    az = np.deg2rad(az_deg)
    cx, sx = np.cos(ax), np.sin(ax)
    cy, sy = np.cos(ay), np.sin(ay)
    cz, sz = np.cos(az), np.sin(az)

    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def _pca_frame(points):
    c = points.mean(axis=0)
    X = points - c
    cov = (X.T @ X) / max(1, len(points))
    eigvals, eigvecs = np.linalg.eigh(cov)
    order = np.argsort(eigvals)[::-1]
    V = eigvecs[:, order]
    if np.linalg.det(V) < 0:
        V[:, -1] *= -1
    return c, V


def build_coarse_init_candidates(source_pcd, target_pcd):
    src_pts = np.asarray(source_pcd.points)
    dst_pts = np.asarray(target_pcd.points)

    c_src, V_src = _pca_frame(src_pts)
    c_dst, V_dst = _pca_frame(dst_pts)

    # PCA sign ambiguity handling (4 right-handed variants)
    flip_variants = [
        np.diag([1, 1, 1]),
        np.diag([1, -1, -1]),
        np.diag([-1, 1, -1]),
        np.diag([-1, -1, 1]),
    ]

    # Multi-start small set of seed rotations
    seed_eulers = [
        (0, 0, 0),
        (0, 0, 90),
        (0, 0, 180),
        (0, 0, 270),
        (0, 180, 0),
        (180, 0, 0),
    ]

    candidates = []
    for F in flip_variants:
        R_pca = V_dst @ F @ V_src.T
        for ax, ay, az in seed_eulers:
            R_seed = _euler_xyz_to_matrix(ax, ay, az)
            R = R_seed @ R_pca
            t = c_dst - R @ c_src
            candidates.append(_transform_from_rt(R, t))

    return candidates

def trimesh_to_open3d(mesh):
    """Convert a trimesh mesh to an Open3D TriangleMesh, then to PointCloud."""
    import open3d as o3d
    
    o3d_mesh = o3d.geometry.TriangleMesh()
    o3d_mesh.vertices = o3d.utility.Vector3dVector(np.array(mesh.vertices))
    
    # Check if mesh has faces (TriangleMesh) or is a PointCloud
    if hasattr(mesh, 'faces') and len(mesh.faces) > 0:
        o3d_mesh.triangles = o3d.utility.Vector3iVector(np.array(mesh.faces))
        o3d_mesh.compute_vertex_normals()
        # Sample points from the mesh for registration
        pcd = o3d_mesh.sample_points_uniformly(number_of_points=30000)
    else:
        # Already a point cloud, just convert
        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(np.array(mesh.vertices))
    
    return pcd, o3d_mesh


def preprocess_point_cloud(pcd, voxel_size):
    """Downsample point cloud, estimate normals, compute FPFH features."""
    import open3d as o3d
    
    # Downsample
    pcd_down = pcd.voxel_down_sample(voxel_size)
    
    # Estimate normals
    radius_normal = voxel_size * 2.0
    pcd_down.estimate_normals(
        o3d.geometry.KDTreeSearchParamHybrid(radius=radius_normal, max_nn=30)
    )
    
    # Compute FPFH features
    radius_feature = voxel_size * 5.0
    fpfh = o3d.pipelines.registration.compute_fpfh_feature(
        pcd_down,
        o3d.geometry.KDTreeSearchParamHybrid(radius=radius_feature, max_nn=100)
    )
    
    return pcd_down, fpfh

def execute_global_registration(source_down, target_down, source_fpfh, target_fpfh, voxel_size):
    """Run RANSAC-based global registration using FPFH features."""
    import open3d as o3d
    
    distance_threshold = voxel_size * 1.5
    
    result = o3d.pipelines.registration.registration_ransac_based_on_feature_matching(
        source_down, target_down, source_fpfh, target_fpfh,
        mutual_filter=False,
        max_correspondence_distance=distance_threshold,
        estimation_method=o3d.pipelines.registration.TransformationEstimationPointToPoint(False),
        ransac_n=4,
        checkers=[
            o3d.pipelines.registration.CorrespondenceCheckerBasedOnEdgeLength(0.9),
            o3d.pipelines.registration.CorrespondenceCheckerBasedOnDistance(distance_threshold)
        ],
        criteria=o3d.pipelines.registration.RANSACConvergenceCriteria(4000000, 500)
    )
    
    return result

def refine_registration(source, target, voxel_size, init_transform):
    """Refine alignment using Point-to-Plane ICP."""
    import open3d as o3d
    
    # Use 1x voxel_size for partial overlap (0.4x is too tight)
    distance_threshold = voxel_size * 1.0
    
    # Estimate normals for Point-to-Plane
    source.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=voxel_size * 2.0, max_nn=30))
    target.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=voxel_size * 2.0, max_nn=30))
    
    result = o3d.pipelines.registration.registration_icp(
        source, target,
        distance_threshold,
        init_transform,
        o3d.pipelines.registration.TransformationEstimationPointToPlane(),
        o3d.pipelines.registration.ICPConvergenceCriteria(max_iteration=200)
    )
    
    return result


def refine_registration_multiscale(source, target, voxel_size, init_transform):
    import open3d as o3d

    # Coarse-to-fine with wider capture range to avoid zero-correspondence local minima.
    thresholds = [voxel_size * 6.0, voxel_size * 3.0, voxel_size * 1.5]
    iterations = [120, 160, 220]

    M = np.array(init_transform, dtype=float)
    final_result = None
    for stage_idx, (dist_th, max_iter) in enumerate(zip(thresholds, iterations)):
        # First two stages: point-to-point (more robust capture).
        # Final stage: point-to-plane (higher local accuracy).
        if stage_idx < 2:
            est = o3d.pipelines.registration.TransformationEstimationPointToPoint(False)
        else:
            est = o3d.pipelines.registration.TransformationEstimationPointToPlane()
        final_result = o3d.pipelines.registration.registration_icp(
            source, target,
            dist_th,
            M,
            est,
            o3d.pipelines.registration.ICPConvergenceCriteria(max_iteration=max_iter)
        )
        M = np.array(final_result.transformation)

    return final_result


def evaluate_alignment_quality(source_pcd, target_pcd, transform, voxel_size):
    """
    Symmetric quality metrics for partial-overlap registration.
    Lower score is better.
    """
    import open3d as o3d

    src_t = o3d.geometry.PointCloud(source_pcd)
    src_t.transform(np.array(transform))

    d_st = np.asarray(src_t.compute_point_cloud_distance(target_pcd))
    d_ts = np.asarray(target_pcd.compute_point_cloud_distance(src_t))

    if len(d_st) == 0 or len(d_ts) == 0:
        return {
            "score": float("inf"),
            "median_sym": float("inf"),
            "p90_sym": float("inf"),
            "overlap": 0.0
        }

    median_sym = 0.5 * (float(np.median(d_st)) + float(np.median(d_ts)))
    p90_sym = 0.5 * (float(np.percentile(d_st, 90)) + float(np.percentile(d_ts, 90)))
    mean_sym = 0.5 * (float(np.mean(d_st)) + float(np.mean(d_ts)))

    inlier_th = max(voxel_size * 1.5, 1.0)
    overlap = 0.5 * (
        float(np.mean(d_st < inlier_th)) +
        float(np.mean(d_ts < inlier_th))
    )

    # Penalize low-overlap local minima.
    score = (0.45 * median_sym + 0.35 * p90_sym + 0.20 * mean_sym) / max(overlap, 1e-3)

    return {
        "score": float(score),
        "median_sym": float(median_sym),
        "p90_sym": float(p90_sym),
        "mean_sym": float(mean_sym),
        "overlap": float(overlap)
    }


def build_local_init_candidates_around_centroid(source_pcd, angle_deg_list, z_offsets):
    """
    Build conservative local seeds around source centroid (for jaw-face partial overlap).
    """
    src_pts = np.asarray(source_pcd.points)
    c = src_pts.mean(axis=0)

    candidates = []
    I = np.eye(4)
    candidates.append(I.copy())
    for ax in angle_deg_list:
        for ay in angle_deg_list:
            for az in angle_deg_list:
                R = _euler_xyz_to_matrix(ax, ay, az)
                M = np.eye(4)
                # rotate around centroid: T(c) * R * T(-c)
                M[:3, :3] = R
                M[:3, 3] = c - R @ c
                for dz in z_offsets:
                    Mz = np.array(M, copy=True)
                    Mz[2, 3] += dz
                    candidates.append(Mz)
    return candidates


def build_refine_seed_transforms(base_M):
    """
    Small perturbations around current transform to escape local minima.
    """
    seeds = [np.array(base_M, dtype=float)]

    rot_perturbs = [
        (8.0, 0.0, 0.0), (-8.0, 0.0, 0.0),
        (0.0, 8.0, 0.0), (0.0, -8.0, 0.0),
        (0.0, 0.0, 12.0), (0.0, 0.0, -12.0),
    ]
    trans_perturbs = [
        (0.0, 0.0, 8.0), (0.0, 0.0, -8.0),
        (5.0, 0.0, 0.0), (-5.0, 0.0, 0.0),
        (0.0, 5.0, 0.0), (0.0, -5.0, 0.0),
    ]

    for ax, ay, az in rot_perturbs:
        P = np.eye(4)
        P[:3, :3] = _euler_xyz_to_matrix(ax, ay, az)
        seeds.append(P @ base_M)

    for tx, ty, tz in trans_perturbs:
        P = np.eye(4)
        P[:3, 3] = np.array([tx, ty, tz], dtype=float)
        seeds.append(P @ base_M)

    return seeds


def estimate_similarity_umeyama(X, Y):
    """
    Estimate similarity transform Y ~= s * R * X + t for paired points.
    Returns (s, R, t).
    """
    X = np.asarray(X, dtype=float)
    Y = np.asarray(Y, dtype=float)
    if len(X) < 3 or len(Y) < 3:
        return 1.0, np.eye(3), np.zeros(3)

    mx = X.mean(axis=0)
    my = Y.mean(axis=0)
    Xc = X - mx
    Yc = Y - my
    cov = (Yc.T @ Xc) / len(X)
    U, D, Vt = np.linalg.svd(cov)
    S = np.eye(3)
    if np.linalg.det(U @ Vt) < 0:
        S[-1, -1] = -1
    R = U @ S @ Vt
    var_x = np.mean(np.sum(Xc ** 2, axis=1))
    if var_x < 1e-12:
        s = 1.0
    else:
        s = np.trace(np.diag(D) @ S) / var_x
    t = my - s * (R @ mx)
    return float(s), R, t


def rank_init_candidates_fast(source_pcd, target_pcd, init_candidates, voxel_size, top_k=10):
    """
    Fast first-pass ranking of init transforms to avoid expensive full ICP on all seeds.
    """
    import open3d as o3d

    if not init_candidates:
        return []

    ranked = []
    dist = voxel_size * 8.0
    criteria = o3d.pipelines.registration.ICPConvergenceCriteria(max_iteration=40)
    est = o3d.pipelines.registration.TransformationEstimationPointToPoint(False)

    for idx, M in enumerate(init_candidates):
        try:
            r = o3d.pipelines.registration.registration_icp(
                source_pcd, target_pcd, dist, np.array(M, dtype=float), est, criteria
            )
            rmse = float(r.inlier_rmse)
            fit = float(r.fitness)
            score = rmse / max(fit, 1e-3)
            ranked.append((score, idx, np.array(r.transformation)))
        except Exception:
            continue

    ranked.sort(key=lambda x: x[0])
    return ranked[:max(1, top_k)]

@app.route('/api/patient/<patient_id>/register/auto', methods=['POST'])
def auto_register(patient_id):
    try:
        import open3d as o3d
        
        data = request.json
        source_path = data.get('source_path')
        target_path = data.get('target_path')

        if not source_path or not target_path:
            return jsonify({"error": "Missing source or target path"}), 400
        
        full_source = os.path.join(ROOT_FOLDER, source_path)
        full_target = os.path.join(ROOT_FOLDER, target_path)

        if not os.path.exists(full_source) or not os.path.exists(full_target):
            return jsonify({"error": "Source or target file not found"}), 404
        
        print(f"\n=== ROBUST Auto Registration Pipeline ===")
        
        # 1. Load meshes
        src_mesh = trimesh.load(full_source, process=False)
        dst_mesh = trimesh.load(full_target, process=False)
        
        # 2. SYNCED PRE-ALIGNMENT (AABB logic matching Three.js)
        c_src = get_aabb_center(src_mesh)
        c_dst = get_aabb_center(dst_mesh)
        
        # Initial guess: Align XY centers, and align Z-fronts
        t_xy = c_dst[:2] - c_src[:2]
        t_z = dst_mesh.bounds[0][2] - src_mesh.bounds[0][2]
        
        t_pre = np.array([t_xy[0], t_xy[1], t_z])
        print(f"Sync Pre-alignment (AABB Front): {t_pre}")
        
        # 3. Build auto strategies (ROI + prealign variants)
        src_extent = np.max(src_mesh.extents)
        dst_extent = np.max(dst_mesh.extents)
        source_is_jaw = dst_extent > src_extent * 1.5
        target_is_jaw = src_extent > dst_extent * 1.5

        # Always run multiple auto attempts and choose best (no manual fallback gate here).
        strategies = []
        roi_radii = [35.0, 45.0, 55.0, 70.0, 85.0]
        t_center = c_dst - c_src
        if source_is_jaw:
            for r in roi_radii:
                strategies.append({"name": f"front_roi_{int(r)}", "pre_mode": "front", "roi_radius": r, "use_roi": True, "z_bias": 0.0})
            strategies.append({"name": "center_roi_55", "pre_mode": "center", "roi_radius": 55.0, "use_roi": True, "z_bias": 0.0})
            strategies.append({"name": "none_roi_55", "pre_mode": "none", "roi_radius": 55.0, "use_roi": True, "z_bias": 0.0})
            for zb in [-10.0, 10.0]:
                strategies.append({"name": f"front_roi_55_z{int(zb)}", "pre_mode": "front", "roi_radius": 55.0, "use_roi": True, "z_bias": zb})
            strategies.append({"name": "front_full", "pre_mode": "front", "roi_radius": None, "use_roi": False, "z_bias": 0.0})
        elif target_is_jaw:
            for r in roi_radii:
                strategies.append({"name": f"front_roi_{int(r)}", "pre_mode": "front", "roi_radius": r, "use_roi": True, "z_bias": 0.0})
            strategies.append({"name": "center_roi_55", "pre_mode": "center", "roi_radius": 55.0, "use_roi": True, "z_bias": 0.0})
            strategies.append({"name": "none_roi_55", "pre_mode": "none", "roi_radius": 55.0, "use_roi": True, "z_bias": 0.0})
            for zb in [-10.0, 10.0]:
                strategies.append({"name": f"front_roi_55_z{int(zb)}", "pre_mode": "front", "roi_radius": 55.0, "use_roi": True, "z_bias": zb})
            strategies.append({"name": "front_full", "pre_mode": "front", "roi_radius": None, "use_roi": False, "z_bias": 0.0})
        else:
            strategies = [
                {"name": "front_full", "pre_mode": "front", "roi_radius": None, "use_roi": False, "z_bias": 0.0},
                {"name": "center_full", "pre_mode": "center", "roi_radius": None, "use_roi": False, "z_bias": 0.0},
                {"name": "none_full", "pre_mode": "none", "roi_radius": None, "use_roi": False, "z_bias": 0.0},
            ]

        best_global = None
        best_valid_global = None
        diagnostics = []

        for st in strategies:
            src_work = src_mesh.copy()
            M_pre = np.eye(4)
            t_curr = np.array([0.0, 0.0, 0.0], dtype=float)
            if st["pre_mode"] == "front":
                t_curr = np.array(t_pre, dtype=float)
            elif st["pre_mode"] == "center":
                t_curr = np.array(t_center, dtype=float)
            t_curr[2] += float(st.get("z_bias", 0.0))
            if st["pre_mode"] != "none":
                src_work.apply_translation(t_curr)
                M_pre[:3, 3] = t_curr

            # ROI selection for jaw-face alignment
            if st["use_roi"] and source_is_jaw:
                dst_roi = extract_mouth_roi(dst_mesh, src_work, distance_threshold=st["roi_radius"])
                src_roi = src_work
            elif st["use_roi"] and target_is_jaw:
                src_roi = extract_mouth_roi(src_work, dst_mesh, distance_threshold=st["roi_radius"])
                dst_roi = dst_mesh
            else:
                src_roi = src_work
                dst_roi = dst_mesh

            source_pcd, _ = trimesh_to_open3d(src_roi)
            target_pcd, _ = trimesh_to_open3d(dst_roi)

            roi_extent = max(np.max(src_roi.extents), np.max(dst_roi.extents))
            voxel_size = max(roi_extent * 0.012, 0.6)

            source_down, source_fpfh = preprocess_point_cloud(source_pcd, voxel_size)
            target_down, target_fpfh = preprocess_point_cloud(target_pcd, voxel_size)

            result_ransac = execute_global_registration(
                source_down, target_down, source_fpfh, target_fpfh, voxel_size
            )

            source_pcd.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=voxel_size * 2.0, max_nn=30))
            target_pcd.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=voxel_size * 2.0, max_nn=30))

            coarse_candidates = build_coarse_init_candidates(source_pcd, target_pcd)
            local_candidates = build_local_init_candidates_around_centroid(
                source_pcd,
                angle_deg_list=[-10.0, 0.0, 10.0],
                z_offsets=[-5.0, 0.0, 5.0]
            )
            init_candidates = [np.array(result_ransac.transformation)] + coarse_candidates + local_candidates

            # Deterministic cap to keep runtime bounded
            max_init = 96
            if len(init_candidates) > max_init:
                idxs = np.linspace(0, len(init_candidates) - 1, num=max_init, dtype=int)
                init_candidates = [init_candidates[i] for i in idxs]

            # Fast ranking pass, then expensive multiscale only on top seeds
            ranked = rank_init_candidates_fast(
                source_pcd, target_pcd, init_candidates, voxel_size, top_k=12
            )
            ranked_inits = [M for _, _, M in ranked] if ranked else init_candidates[:12]

            best_local_result = None
            best_local_M = None
            best_local_seed = -1
            for i, init_M in enumerate(ranked_inits):
                result_i = refine_registration_multiscale(source_pcd, target_pcd, voxel_size, init_M)
                if (best_local_result is None) or (float(result_i.inlier_rmse) < float(best_local_result.inlier_rmse)):
                    best_local_result = result_i
                    best_local_M = np.array(result_i.transformation)
                    best_local_seed = i

            M_total = best_local_M @ M_pre
            rmse_val = float(best_local_result.inlier_rmse)
            fitness_val = float(best_local_result.fitness)
            quality = evaluate_alignment_quality(source_pcd, target_pcd, best_local_M, voxel_size)

            # Center distance penalty: keep transformed jaw near mouth ROI center
            src_center = np.asarray(source_pcd.points).mean(axis=0)
            dst_center = np.asarray(target_pcd.points).mean(axis=0)
            src_center_h = np.array([src_center[0], src_center[1], src_center[2], 1.0], dtype=float)
            src_center_t = (best_local_M @ src_center_h)[:3]
            center_dist = float(np.linalg.norm(src_center_t - dst_center))

            # Robust score: heavily penalize tail error and low overlap/local wrong basins.
            score = (
                (0.35 * quality["median_sym"] + 0.45 * quality["p90_sym"] + 0.20 * rmse_val)
                / (max(quality["overlap"], 1e-3) ** 1.2)
                / (max(fitness_val, 1e-2) ** 0.25)
                + 0.08 * center_dist
            )

            diag = {
                "strategy": st["name"],
                "pre_mode": st["pre_mode"],
                "roi_radius": st["roi_radius"],
                "z_bias": float(st.get("z_bias", 0.0)),
                "rmse": rmse_val,
                "fitness": fitness_val,
                "median_sym": quality["median_sym"],
                "p90_sym": quality["p90_sym"],
                "overlap": quality["overlap"],
                "center_dist": center_dist,
                "score": float(score),
                "best_seed_index": int(best_local_seed),
                "voxel_size": float(voxel_size),
                "roi_extent": float(roi_extent)
            }

            # Reject degenerate alignments (common when ICP has no real correspondences).
            is_degenerate = (
                (fitness_val < 0.02) or
                (quality["overlap"] < 0.05) or
                (center_dist > max(roi_extent * 0.8, 60.0)) or
                ((rmse_val < 1e-6) and (quality["median_sym"] > 3.0))
            )
            diag["is_valid"] = not is_degenerate
            diagnostics.append(diag)

            if (best_global is None) or (score < best_global["score"]):
                best_global = {
                    "score": float(score),
                    "rmse": rmse_val,
                    "fitness": fitness_val,
                    "M_total": M_total,
                    "strategy": st["name"],
                    "median_sym": quality["median_sym"],
                    "p90_sym": quality["p90_sym"],
                    "overlap": quality["overlap"],
                    "center_dist": center_dist,
                    "best_seed_index": int(best_local_seed),
                    "roi_extent": float(roi_extent)
                }
            if (not is_degenerate) and ((best_valid_global is None) or (score < best_valid_global["score"])):
                best_valid_global = {
                    "score": float(score),
                    "rmse": rmse_val,
                    "fitness": fitness_val,
                    "M_total": M_total,
                    "strategy": st["name"],
                    "median_sym": quality["median_sym"],
                    "p90_sym": quality["p90_sym"],
                    "overlap": quality["overlap"],
                    "center_dist": center_dist,
                    "best_seed_index": int(best_local_seed),
                    "roi_extent": float(roi_extent)
                }

        # Prefer valid alignment. If none valid, fallback to center prealign (conservative).
        if best_valid_global is not None:
            chosen = best_valid_global
            selection_mode = "valid_best"
        elif best_global is not None:
            # conservative fallback transform (front prealign) instead of trusting degenerate ICP
            M_fallback = np.eye(4)
            M_fallback[:3, 3] = t_pre
            chosen = {
                "score": float("inf"),
                "rmse": float(best_global["rmse"]),
                "fitness": float(best_global["fitness"]),
                "M_total": M_fallback,
                "strategy": "fallback_prealign_front",
                "median_sym": float(best_global["median_sym"]),
                "p90_sym": float(best_global["p90_sym"]),
                "overlap": float(best_global["overlap"]),
                "center_dist": float(best_global["center_dist"]),
                "best_seed_index": -1,
                "roi_extent": float(best_global["roi_extent"])
            }
            selection_mode = "fallback_prealign"
        else:
            raise RuntimeError("Auto registration: no candidate produced")

        M_total = chosen["M_total"]
        rmse_val = chosen["rmse"]
        fitness_val = chosen["fitness"]
        rmse_gate = max(chosen["roi_extent"] * 0.015, 1.2)
        fitness_gate = 0.20
        quality_passed = (
            (rmse_val <= rmse_gate) and
            (fitness_val >= fitness_gate) and
            (chosen["overlap"] >= 0.30) and
            (chosen["center_dist"] <= 40.0)
        )
        low_confidence = not quality_passed

        print(
            f"Auto best strategy={chosen['strategy']}, seed={chosen['best_seed_index']}, mode={selection_mode}, "
            f"rmse={rmse_val:.4f}, fitness={fitness_val:.4f}, "
            f"median={chosen['median_sym']:.4f}, p90={chosen['p90_sym']:.4f}, "
            f"overlap={chosen['overlap']:.4f}, center_dist={chosen['center_dist']:.4f}, "
            f"low_confidence={low_confidence}"
        )

        return jsonify({
            "rotation": M_total[:3, :3].tolist(),
            "translation": M_total[:3, 3].tolist(),
            "rmse": rmse_val,
            "fitness": fitness_val,
            "overlap": float(chosen["overlap"]),
            "center_dist": float(chosen["center_dist"]),
            "low_confidence": bool(low_confidence),
            "quality_gate": {
                "rmse_max": float(rmse_gate),
                "fitness_min": float(fitness_gate),
                "overlap_min": 0.30,
                "center_dist_max": 40.0,
                "passed": bool(quality_passed)
            },
            "best_strategy": chosen["strategy"],
            "best_seed_index": int(chosen["best_seed_index"]),
            "selection_mode": selection_mode,
            "attempt_count": len(strategies),
            "attempt_diagnostics": sorted(diagnostics, key=lambda d: d["score"])[:12],
            "model_centers": {
                "source": c_src.tolist(),
                "target": c_dst.tolist()
            }
        })

    except Exception as e:
        print(f"Auto Registration Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/patient/<patient_id>/register/icp', methods=['POST'])
def refine_icp(patient_id):
    """Refine current alignment using ROI-aware multiscale ICP."""
    try:
        import open3d as o3d
        
        data = request.json
        source_path = data.get('source_path')
        target_path = data.get('target_path')
        curr_rot = data.get('rotation') 
        curr_trans = data.get('translation')

        if not source_path or not target_path or curr_rot is None:
            return jsonify({"error": "Missing required data"}), 400

        # Reconstruct current transform
        M_curr = np.eye(4)
        R_arr = np.array(curr_rot)
        if R_arr.shape == (3, 3):
            M_curr[:3, :3] = R_arr
            M_curr[:3, 3] = np.array(curr_trans)
        elif R_arr.shape == (4, 4):
            M_curr = R_arr

        src_mesh = trimesh.load(os.path.join(ROOT_FOLDER, source_path), process=False)
        dst_mesh = trimesh.load(os.path.join(ROOT_FOLDER, target_path), process=False)

        src_extent = np.max(src_mesh.extents)
        dst_extent = np.max(dst_mesh.extents)
        source_is_jaw = dst_extent > src_extent * 1.5
        target_is_jaw = src_extent > dst_extent * 1.5

        def run_branch(use_roi):
            src_ref = src_mesh
            dst_ref = dst_mesh
            if use_roi and source_is_jaw:
                src_for_roi = src_mesh.copy()
                src_for_roi.apply_transform(M_curr)
                dst_ref = extract_mouth_roi(dst_mesh, src_for_roi, distance_threshold=55.0)
            elif use_roi and target_is_jaw:
                M_inv = np.linalg.inv(M_curr)
                tgt_in_src = dst_mesh.copy()
                tgt_in_src.apply_transform(M_inv)
                src_ref = extract_mouth_roi(src_mesh, tgt_in_src, distance_threshold=55.0)

            source_pcd, _ = trimesh_to_open3d(src_ref)
            target_pcd, _ = trimesh_to_open3d(dst_ref)
            roi_extent = max(np.max(src_ref.extents), np.max(dst_ref.extents))
            voxel_size = max(roi_extent * 0.008, 0.4)

            seeds = build_refine_seed_transforms(M_curr)
            best = None
            for i, seed_M in enumerate(seeds):
                res_i = refine_registration_multiscale(source_pcd, target_pcd, voxel_size, seed_M)
                M_i = np.array(res_i.transformation)
                rmse_i = float(res_i.inlier_rmse)
                fitness_i = float(res_i.fitness)
                quality_i = evaluate_alignment_quality(source_pcd, target_pcd, M_i, voxel_size)
                src_center = np.asarray(source_pcd.points).mean(axis=0)
                dst_center = np.asarray(target_pcd.points).mean(axis=0)
                src_center_t = (M_i @ np.array([src_center[0], src_center[1], src_center[2], 1.0]))[:3]
                center_dist_i = float(np.linalg.norm(src_center_t - dst_center))

                score_i = (
                    (0.35 * quality_i["median_sym"] + 0.45 * quality_i["p90_sym"] + 0.20 * rmse_i)
                    / (max(quality_i["overlap"], 1e-3) ** 1.2)
                    / (max(fitness_i, 1e-2) ** 0.25)
                    + 0.08 * center_dist_i
                )

                rmse_gate_i = max(roi_extent * 0.015, 1.2)
                quality_pass_i = (
                    (rmse_i <= rmse_gate_i) and
                    (fitness_i >= 0.20) and
                    (quality_i["overlap"] >= 0.30) and
                    (center_dist_i <= 40.0)
                )
                candidate = {
                    "M": M_i,
                    "rmse": rmse_i,
                    "fitness": fitness_i,
                    "overlap": float(quality_i["overlap"]),
                    "center_dist": center_dist_i,
                    "score": float(score_i),
                    "quality_passed": bool(quality_pass_i),
                    "rmse_gate": float(rmse_gate_i),
                    "roi_extent": float(roi_extent),
                    "seed_index": int(i),
                }
                if best is None:
                    best = candidate
                else:
                    # Prefer gate-pass candidates first, then lower score
                    if candidate["quality_passed"] and not best["quality_passed"]:
                        best = candidate
                    elif candidate["quality_passed"] == best["quality_passed"] and candidate["score"] < best["score"]:
                        best = candidate

            best["branch"] = "roi" if use_roi else "full"
            return best

        roi_branch = run_branch(use_roi=True)
        full_branch = run_branch(use_roi=False)

        # Choose branch: gate-pass priority, then score
        chosen = roi_branch
        if full_branch["quality_passed"] and not roi_branch["quality_passed"]:
            chosen = full_branch
        elif full_branch["quality_passed"] == roi_branch["quality_passed"] and full_branch["score"] < roi_branch["score"]:
            chosen = full_branch

        M_final = chosen["M"]
        rmse_val = chosen["rmse"]
        fitness_val = chosen["fitness"]
        overlap_val = chosen["overlap"]
        center_dist = chosen["center_dist"]
        quality_passed = chosen["quality_passed"]

        print(
            f"Refine ICP: branch={chosen['branch']}, seed={chosen['seed_index']}, "
            f"rmse={rmse_val:.4f}, fitness={fitness_val:.4f}, "
            f"overlap={overlap_val:.4f}, center_dist={center_dist:.4f}, passed={quality_passed}"
        )

        return jsonify({
            "rotation": M_final[:3, :3].tolist(),
            "translation": M_final[:3, 3].tolist(),
            "rmse": rmse_val,
            "fitness": fitness_val,
            "overlap": overlap_val,
            "center_dist": center_dist,
            "low_confidence": not bool(quality_passed),
            "refine_branch": chosen["branch"],
            "seed_index": int(chosen["seed_index"]),
            "quality_gate": {
                "rmse_max": float(chosen["rmse_gate"]),
                "fitness_min": 0.20,
                "overlap_min": 0.30,
                "center_dist_max": 40.0,
                "passed": bool(quality_passed)
            }
        })

    except Exception as e:
        print(f"Refinement Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/patient/<patient_id>/register/similarity-check', methods=['POST'])
def similarity_check(patient_id):
    """
    Quick scale-drift diagnostic: estimate similarity scale between source and target.
    """
    try:
        data = request.json or {}
        source_path = data.get('source_path')
        target_path = data.get('target_path')
        init_rot = data.get('rotation')
        init_trans = data.get('translation')

        if not source_path or not target_path:
            return jsonify({"error": "Missing source_path or target_path"}), 400

        src_mesh = trimesh.load(os.path.join(ROOT_FOLDER, source_path), process=False)
        dst_mesh = trimesh.load(os.path.join(ROOT_FOLDER, target_path), process=False)

        src_pts = np.asarray(src_mesh.vertices)
        dst_pts = np.asarray(dst_mesh.vertices)
        if len(src_pts) == 0 or len(dst_pts) == 0:
            return jsonify({"error": "Empty mesh vertices"}), 400

        # Optional rigid init to improve nearest-neighbor pairing.
        if init_rot is not None:
            M = np.eye(4)
            R_arr = np.array(init_rot, dtype=float)
            if R_arr.shape == (3, 3):
                M[:3, :3] = R_arr
                M[:3, 3] = np.array(init_trans if init_trans is not None else [0, 0, 0], dtype=float)
                src_pts = (M[:3, :3] @ src_pts.T).T + M[:3, 3]

        # Subsample for speed
        rng = np.random.default_rng(42)
        n_src = min(8000, len(src_pts))
        n_dst = min(15000, len(dst_pts))
        src_sub = src_pts[rng.choice(len(src_pts), n_src, replace=False)]
        dst_sub = dst_pts[rng.choice(len(dst_pts), n_dst, replace=False)]

        # Pair each source point to nearest target point
        import open3d as o3d
        dst_pcd = o3d.geometry.PointCloud()
        dst_pcd.points = o3d.utility.Vector3dVector(dst_sub)
        kdt = o3d.geometry.KDTreeFlann(dst_pcd)
        nn = []
        for p in src_sub:
            _, idx, _ = kdt.search_knn_vector_3d(p, 1)
            nn.append(dst_sub[idx[0]])
        nn = np.asarray(nn)

        s, R, t = estimate_similarity_umeyama(src_sub, nn)
        drift = abs(s - 1.0)
        return jsonify({
            "scale": float(s),
            "scale_drift": float(drift),
            "likely_scale_mismatch": bool(drift > 0.03),
            "sample_size": int(len(src_sub))
        })
    except Exception as e:
        print(f"Similarity Check Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500




if __name__ == '__main__':
    print(f"Starting Flask server...")
    print(f"Root folder: {ROOT_FOLDER}")
    app.run(debug=False, port=5000, use_reloader=False)

