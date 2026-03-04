import urllib.request
import os

WEIGHTS_DIR = os.path.join(os.path.dirname(__file__), "frontend", "weights")
JS_DIR = os.path.join(os.path.dirname(__file__), "frontend", "js")

os.makedirs(WEIGHTS_DIR, exist_ok=True)

BASE_URL = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

files = [
    "tiny_face_detector_model-weights_manifest.json",
    "tiny_face_detector_model-shard1",
    "face_expression_model-weights_manifest.json",
    "face_expression_model-shard1",
]

print("Downloading face-api.js model weights...")
for f in files:
    url = f"{BASE_URL}/{f}"
    dest = os.path.join(WEIGHTS_DIR, f)
    print(f"  {f} ...", end=" ", flush=True)
    urllib.request.urlretrieve(url, dest)
    size = os.path.getsize(dest)
    print(f"OK ({size:,} bytes)")

# Also download the face-api.min.js library itself
face_api_js_url = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js"
face_api_dest = os.path.join(JS_DIR, "face-api.min.js")
print(f"\nDownloading face-api.min.js ...", end=" ", flush=True)
urllib.request.urlretrieve(face_api_js_url, face_api_dest)
size = os.path.getsize(face_api_dest)
print(f"OK ({size:,} bytes)")

print("\nAll done! Files in frontend/weights/:")
for f in os.listdir(WEIGHTS_DIR):
    sz = os.path.getsize(os.path.join(WEIGHTS_DIR, f))
    print(f"  {f:55s} {sz:>10,} bytes")
