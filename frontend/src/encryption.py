import torch
import numpy as np
from PIL import Image
from diffusers import StableDiffusionPipeline
import io

# 1. LIGHTWEIGHT LATTICE (LWE) FOR TEXT
class FastLattice:
    def __init__(self, n=128, q=2**15):
        self.n = n
        self.q = q
    
    def encrypt_bit(self, bit, pk):
        A, b = pk
        r = np.random.randint(0, 2, size=self.n)
        u = np.dot(r, A) % self.q
        v = (np.dot(r, b) + (bit * (self.q // 2))) % self.q
        return np.append(u, v)

# 2. GENERATE AI IMAGE (Tiny Model for Speed)
def get_fast_ai_image(prompt):
    print("🚀 Downloading Tiny-AI model (much faster)...")
    model_id = "segmind/tiny-sd" # Only ~600MB vs 5GB
    pipe = StableDiffusionPipeline.from_pretrained(model_id, torch_dtype=torch.float32)
    pipe.to("cpu") # Explicitly use CPU to avoid CUDA warnings
    
    print("🎨 Generating image...")
    # Low steps (20) for speed
    image = pipe(prompt, num_inference_steps=20).images[0]
    return image.resize((256, 256))

# 3. HIDE ENCRYPTED MSG IN IMAGE
def hide_message(image, encrypted_data):
    pixels = np.array(image)
    flat_pixels = pixels.flatten()
    # Flatten encrypted array into bits to hide in LSB
    flat_data = (encrypted_data % 2).astype(np.uint8)
    
    for i in range(min(len(flat_data), len(flat_pixels))):
        flat_pixels[i] = (flat_pixels[i] & ~1) | flat_data[i]
        
    return Image.fromarray(flat_pixels.reshape(pixels.shape))

# --- EXECUTION ---
lattice = FastLattice()
# Generate simple keypair
s_key = np.random.randint(0, lattice.q, size=lattice.n)
A_mat = np.random.randint(0, lattice.q, size=(lattice.n, lattice.n))
b_vec = (np.dot(A_mat, s_key) + np.random.normal(0, 2, size=lattice.n).astype(int)) % lattice.q
pub_key = (A_mat, b_vec)

# Process Text
msg = "PQ-SAFE-2026"
bits = np.unpackbits(np.frombuffer(msg.encode(), dtype=np.uint8))
encrypted_payload = np.array([lattice.encrypt_bit(b, pub_key) for b in bits])

# Run Pipeline
ai_img = get_fast_ai_image("cyberpunk neon city")
secure_img = hide_message(ai_img, encrypted_payload)
secure_img.save("fast_quantum_vault.png")

print("✨ Success! 'fast_quantum_vault.png' created.")