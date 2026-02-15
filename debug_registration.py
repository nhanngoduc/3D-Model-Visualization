"""Debug script to analyze mesh models and test Open3D registration offline."""
import trimesh
import numpy as np
import open3d as o3d
import os
import time

ROOT = r"D:\Lab\3D Model Visualization\Cases for AI Fernando Polanco\Cases for AI Fernando Polanco"

# These are the files from the screenshot (patient 1)
source_file = os.path.join(ROOT, "patient 1", "Intraoral scans", "IOS trios UpperJawScan.ply")
target_file = os.path.join(ROOT, "patient 1", "Face scans", "FaceWithRetractors_refine.ply")

print("=" * 60)
print("MESH ANALYSIS")
print("=" * 60)

# Load with trimesh
src = trimesh.load(source_file, process=False)
dst = trimesh.load(target_file, process=False)

print(f"\nSource: {os.path.basename(source_file)}")
print(f"  Vertices: {len(src.vertices)}")
print(f"  Faces: {len(src.faces)}")
print(f"  Bounds min: {src.bounds[0]}")
print(f"  Bounds max: {src.bounds[1]}")
print(f"  Extent: {src.extents}")
print(f"  Max extent: {max(src.extents):.2f}")
print(f"  Centroid: {src.centroid}")

print(f"\nTarget: {os.path.basename(target_file)}")
print(f"  Vertices: {len(dst.vertices)}")
print(f"  Faces: {len(dst.faces)}")
print(f"  Bounds min: {dst.bounds[0]}")
print(f"  Bounds max: {dst.bounds[1]}")
print(f"  Extent: {dst.extents}")
print(f"  Max extent: {max(dst.extents):.2f}")
print(f"  Centroid: {dst.centroid}")

# Check overlap of bounding boxes
overlap_min = np.maximum(src.bounds[0], dst.bounds[0])
overlap_max = np.minimum(src.bounds[1], dst.bounds[1])
has_overlap = np.all(overlap_min < overlap_max)
print(f"\nBounding Box Overlap: {has_overlap}")
if has_overlap:
    overlap_extent = overlap_max - overlap_min
    print(f"  Overlap extent: {overlap_extent}")
    print(f"  Overlap volume: {np.prod(overlap_extent):.2f}")

# Convert to Open3D
def trimesh_to_o3d(mesh, num_points=30000):
    o3d_mesh = o3d.geometry.TriangleMesh()
    o3d_mesh.vertices = o3d.utility.Vector3dVector(np.array(mesh.vertices))
    o3d_mesh.triangles = o3d.utility.Vector3iVector(np.array(mesh.faces))
    o3d_mesh.compute_vertex_normals()
    pcd = o3d_mesh.sample_points_uniformly(number_of_points=num_points)
    return pcd

source_pcd = trimesh_to_o3d(src)
target_pcd = trimesh_to_o3d(dst)

# Test different voxel sizes
print("\n" + "=" * 60)
print("TESTING DIFFERENT VOXEL SIZES")
print("=" * 60)

src_extent = max(src.extents)
dst_extent = max(dst.extents)
avg_extent = (src_extent + dst_extent) / 2.0

for voxel_pct in [0.005, 0.01, 0.02, 0.03, 0.05]:
    voxel_size = max(avg_extent * voxel_pct, 0.5)
    
    # Preprocess
    src_down = source_pcd.voxel_down_sample(voxel_size)
    tgt_down = target_pcd.voxel_down_sample(voxel_size)
    
    src_down.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=voxel_size * 2, max_nn=30))
    tgt_down.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=voxel_size * 2, max_nn=30))
    
    src_fpfh = o3d.pipelines.registration.compute_fpfh_feature(
        src_down, o3d.geometry.KDTreeSearchParamHybrid(radius=voxel_size * 5, max_nn=100))
    tgt_fpfh = o3d.pipelines.registration.compute_fpfh_feature(
        tgt_down, o3d.geometry.KDTreeSearchParamHybrid(radius=voxel_size * 5, max_nn=100))
    
    print(f"\nVoxel size: {voxel_size:.2f} ({voxel_pct*100:.1f}% of extent)")
    print(f"  Source downsampled: {len(src_down.points)} points")
    print(f"  Target downsampled: {len(tgt_down.points)} points")
    
    # RANSAC
    dist_thresh = voxel_size * 1.5
    t0 = time.time()
    result_ransac = o3d.pipelines.registration.registration_ransac_based_on_feature_matching(
        src_down, tgt_down, src_fpfh, tgt_fpfh,
        mutual_filter=True,
        max_correspondence_distance=dist_thresh,
        estimation_method=o3d.pipelines.registration.TransformationEstimationPointToPoint(False),
        ransac_n=4,
        checkers=[
            o3d.pipelines.registration.CorrespondenceCheckerBasedOnEdgeLength(0.9),
            o3d.pipelines.registration.CorrespondenceCheckerBasedOnDistance(dist_thresh)
        ],
        criteria=o3d.pipelines.registration.RANSACConvergenceCriteria(4000000, 500)
    )
    t_ransac = time.time() - t0
    print(f"  RANSAC: fitness={result_ransac.fitness:.4f}, rmse={result_ransac.inlier_rmse:.4f}, time={t_ransac:.1f}s")
    
    # ICP refine with LARGER threshold
    for icp_mult in [0.4, 1.0, 2.0, 5.0]:
        icp_thresh = voxel_size * icp_mult
        result_icp = o3d.pipelines.registration.registration_icp(
            source_pcd, target_pcd,
            icp_thresh,
            result_ransac.transformation,
            o3d.pipelines.registration.TransformationEstimationPointToPlane(),
            o3d.pipelines.registration.ICPConvergenceCriteria(max_iteration=200)
        )
        print(f"  ICP (thresh={icp_thresh:.2f}): fitness={result_icp.fitness:.4f}, rmse={result_icp.inlier_rmse:.4f}")

# Also test Fast Global Registration
print("\n" + "=" * 60)
print("TESTING FAST GLOBAL REGISTRATION (FGR)")
print("=" * 60)

voxel_size = max(avg_extent * 0.02, 1.0)
src_down = source_pcd.voxel_down_sample(voxel_size)
tgt_down = target_pcd.voxel_down_sample(voxel_size)
src_down.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=voxel_size * 2, max_nn=30))
tgt_down.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=voxel_size * 2, max_nn=30))
src_fpfh = o3d.pipelines.registration.compute_fpfh_feature(
    src_down, o3d.geometry.KDTreeSearchParamHybrid(radius=voxel_size * 5, max_nn=100))
tgt_fpfh = o3d.pipelines.registration.compute_fpfh_feature(
    tgt_down, o3d.geometry.KDTreeSearchParamHybrid(radius=voxel_size * 5, max_nn=100))

t0 = time.time()
result_fgr = o3d.pipelines.registration.registration_fgr_based_on_feature_matching(
    src_down, tgt_down, src_fpfh, tgt_fpfh,
    o3d.pipelines.registration.FastGlobalRegistrationOption(
        maximum_correspondence_distance=voxel_size * 2.0
    )
)
t_fgr = time.time() - t0
print(f"FGR: fitness={result_fgr.fitness:.4f}, rmse={result_fgr.inlier_rmse:.4f}, time={t_fgr:.1f}s")

# ICP refine after FGR
for icp_mult in [1.0, 2.0, 5.0, 10.0]:
    icp_thresh = voxel_size * icp_mult
    result_icp = o3d.pipelines.registration.registration_icp(
        source_pcd, target_pcd,
        icp_thresh,
        result_fgr.transformation,
        o3d.pipelines.registration.TransformationEstimationPointToPlane(),
        o3d.pipelines.registration.ICPConvergenceCriteria(max_iteration=200)
    )
    print(f"  ICP after FGR (thresh={icp_thresh:.2f}): fitness={result_icp.fitness:.4f}, rmse={result_icp.inlier_rmse:.4f}")

print("\n" + "=" * 60)
print("BEST TRANSFORM from FGR + ICP (thresh=5.0*voxel)")
print("=" * 60)
icp_thresh = voxel_size * 5.0
result_best = o3d.pipelines.registration.registration_icp(
    source_pcd, target_pcd,
    icp_thresh,
    result_fgr.transformation,
    o3d.pipelines.registration.TransformationEstimationPointToPlane(),
    o3d.pipelines.registration.ICPConvergenceCriteria(max_iteration=200)
)
print(f"Final fitness: {result_best.fitness:.4f}")
print(f"Final RMSE: {result_best.inlier_rmse:.4f}")
print(f"Transform:\n{np.array(result_best.transformation)}")
