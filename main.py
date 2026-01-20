import os
import shutil
import pymeshlab
import pydicom

# Đường dẫn đến thư mục gốc chứa các thư mục dữ liệu
root_folder = r"D:\Lab\3D Model Visualization\Cases for AI Fernando Polanco\Cases for AI Fernando Polanco"
# Hàm để xử lý tệp .ply với pyMeshLab
def process_ply_file(input_file, output_file):
    try:
        ms = pymeshlab.MeshSet()
        ms.load_new_mesh(input_file)
        ms.save_current_mesh(output_file)
        print(f"Processed PLY file: {input_file} -> {output_file}")
    except Exception as e:
        print(f"FAILED to process PLY file: {input_file}")
        print(f"Error: {e}")

# Hàm xử lý tệp DICOM, chỉ đọc và sao chép tệp vào thư mục mới mà không tạo tệp .txt
def process_dcm_file(input_file, process_scan_folder):
    try:
        # Đọc tệp DICOM
        # dicom_data = pydicom.dcmread(input_file) # Optional: just validation
        # print(f"Valid DICOM file: {input_file}")
        
        # Sao chép tệp DICOM vào thư mục mới (không tạo tệp .txt)
        output_file = os.path.join(process_scan_folder, os.path.basename(input_file))
        shutil.copy2(input_file, output_file) # copy2 preserves metadata
        print(f"File copied to: {output_file}")
    except Exception as e:
        print(f"Error processing DICOM {input_file}: {e}")

# Hàm để duyệt qua các thư mục và tổ chức lại dữ liệu
def process_patient_data(root_folder):
    if not os.path.exists(root_folder):
        print(f"Root folder does not exist: {root_folder}")
        return

    # In ra các thư mục bệnh nhân có trong root_folder
    print(f"Checking folders in: {root_folder}")
    
    for patient_folder in os.listdir(root_folder):
        # Kiểm tra nếu là thư mục cho bệnh nhân
        patient_path = os.path.join(root_folder, patient_folder)
        # Check if directory and starts with 'patient' (case insensitive)
        if os.path.isdir(patient_path) and patient_folder.lower().startswith('patient'):
            print(f"Processing data for {patient_folder}")
            
            # Tạo thư mục mới cho mỗi bệnh nhân
            patient_output_folder = os.path.join(root_folder, f"process_{patient_folder}")
            if not os.path.exists(patient_output_folder):
                os.makedirs(patient_output_folder)
                print(f"Created output folder for {patient_folder}: {patient_output_folder}")

            # Xử lý các thư mục Face scans, Intraoral scans, Pre-Op CBCT của mỗi bệnh nhân
            for scan_type in ['Face scans', 'Intraoral scans', 'Pre-Op CBCT']:
                scan_folder_path = os.path.join(patient_path, scan_type)
                
                if os.path.exists(scan_folder_path):
                    print(f"Found scan folder: {scan_folder_path}")
                    process_scan_type(scan_folder_path, patient_output_folder, scan_type)
                else:
                    print(f"Scan folder NOT found: {scan_folder_path}")

# Hàm xử lý từng loại dữ liệu (Face scans, Intraoral scans, Pre-Op CBCT)
def process_scan_type(scan_folder_path, patient_output_folder, scan_type):
    # Tạo thư mục tương ứng cho mỗi loại dữ liệu
    # Normalize folder name to avoid spaces/special chars issues if needed, but keeping consistent with request
    process_scan_folder = os.path.join(patient_output_folder, f"process_{scan_type.replace(' ', '_').lower()}")
    if not os.path.exists(process_scan_folder):
        os.makedirs(process_scan_folder)
        print(f"Created folder: {process_scan_folder}")

    # Duyệt qua các tệp trong thư mục scan_type và xử lý (bao gồm cả thư mục con)
    files_found = False
    for root, dirs, files in os.walk(scan_folder_path):
        for file in files:
            files_found = True
            input_file = os.path.join(root, file)
            
            if file.lower().endswith(".ply") or file.lower().endswith(".stl"):
                # Output processed file with .ply extension for consistency, or keep original? 
                # Given previous logic kept extension (processed_{file}), we'll stick to that 
                output_file = os.path.join(process_scan_folder, f"processed_{file}")
                process_ply_file(input_file, output_file)
            elif file.lower().endswith(".dcm"):
                process_dcm_file(input_file, process_scan_folder)
            else:
                # print(f"Skipping: {file}")
                pass
    
    if not files_found:
        print(f"No files found in {scan_folder_path}")
        return

# Chạy hàm để xử lý dữ liệu cho tất cả các bệnh nhân
if __name__ == "__main__":
    process_patient_data(root_folder)
