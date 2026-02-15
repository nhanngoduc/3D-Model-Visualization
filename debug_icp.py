import trimesh
import numpy as np
import os

# Create dummy meshes
mesh_a = trimesh.creation.box()
mesh_b = trimesh.creation.box()
mesh_b.apply_translation([0.1, 0, 0])

print(f"Trimesh version: {trimesh.__version__}")

try:
    import scipy
    print(f"Scipy version: {scipy.__version__}")
except ImportError:
    print("Scipy not found")

try:
    print("Trying with SAMPLED POINTS (app.py logic)...")
    points_a, _ = trimesh.sample.sample_surface(mesh_a, 1000)
    points_b, _ = trimesh.sample.sample_surface(mesh_b, 1000)
    
    ret = trimesh.registration.icp(points_a, points_b)
    print(f"ICP with points return length: {len(ret)}")
    for i, item in enumerate(ret):
        print(f"Item {i} type: {type(item)}")
        print(f"Item {i} str: {str(item)[:50]}")
        
    matrix, transformed, cost = ret
    print(f"Unpacked successfully. Cost type: {type(cost)}")
    print(f"Cost value: {cost}")
        
except Exception as e:
    print(f"Error running ICP with points: {e}")

