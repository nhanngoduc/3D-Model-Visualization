import urllib.request
import json

url = "http://127.0.0.1:5000/api/patient/patient%201/register/auto"
payload = {
    "source_path": "patient 1/Intraoral scans/upper jaw.ply", 
    "target_path": "patient 1/Face scans/FaceWithRetractors_refine.ply"
}
# Note: I used 'upper jaw.ply' here just to be sure, or 'IOS trios LowerJawScan.ply' from previous list.
# Let's use the one from previous list: 'IOS trios LowerJawScan.ply'
payload["source_path"] = "patient 1/Intraoral scans/IOS trios LowerJawScan.ply"

data = json.dumps(payload).encode('utf-8')
headers = {'Content-Type': 'application/json'}

try:
    req = urllib.request.Request(url, data, headers)
    with urllib.request.urlopen(req) as response:
        print(f"Status Code: {response.getcode()}")
        print(f"Response: {response.read().decode('utf-8')[:500]}")
except Exception as e:
    print(f"Error: {e}")
