from flask import Flask, jsonify, send_file, send_from_directory, request
from flask_cors import CORS
import os
import json

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)  # Enable CORS for all routes

# Đường dẫn đến thư mục gốc chứa các thư mục dữ liệu
ROOT_FOLDER = r"D:\Lab\3D Model Visualization\Cases for AI Fernando Polanco\Cases for AI Fernando Polanco"

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

if __name__ == '__main__':
    print(f"Starting Flask server...")
    print(f"Root folder: {ROOT_FOLDER}")
    app.run(debug=True, port=5000)
