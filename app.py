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


@app.route('/api/patient/<string:patient_id>/register/icp', methods=['POST'])
def register_icp(patient_id):
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

if __name__ == '__main__':
    print(f"Starting Flask server...")
    print(f"Root folder: {ROOT_FOLDER}")
    app.run(debug=False, port=5000, use_reloader=False)

