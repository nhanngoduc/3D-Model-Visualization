#!/usr/bin/env python
import requests
import json

BASE_URL = 'http://localhost:5000'

# Test 1: Get patients list
print("Test 1: Get patients list")
response = requests.get(f'{BASE_URL}/api/patients')
print(f"Status: {response.status_code}")
data = response.json()
print(f"Response: {json.dumps(data, indent=2)}")

if data.get('patients'):
    patient_id = data['patients'][0]['id']
    
    # Test 2: Get patient data
    print(f"\nTest 2: Get data for {patient_id}")
    response = requests.get(f'{BASE_URL}/api/patient/{patient_id}/data')
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")
