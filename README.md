# Q-Comm V3.0: Multi-Layer Post-Quantum Secure Chat

A highly advanced, real-time secure messaging application protected by a multi-layer cryptographic pipeline, including **CRYSTALS-Kyber**, custom **Lattice-Based Cryptography (LWE)**, and **Image Steganography**.

## 🚀 Concept
Current encryption is vulnerable to future Quantum Computers ("Harvest Now, Decrypt Later"). Q-Comm establishes a Quantum-Safe channel to negotiate a shared secret, wraps messages in multiple layers of encryption, and visually hides the payload inside an image carrier to evade network sniffing.

## 🛠 Tech Stack & Cryptography
* **Post-Quantum KEM:** CRYSTALS-Kyber-768 (via `crystals-kyber-js`) for secure key exchange.
* **Secondary Asymmetric Layer:** Custom LWE (Learning With Errors) lattice math implementation.
* **Symmetric Payload Encryption:** AES-GCM (256-bit) using the Kyber shared secret.
* **Obfuscation:** LSB (Least Significant Bit) HTML5 Canvas Steganography.
* **Backend:** Node.js + Express + Socket.io (100MB payload capacity).
* **Frontend:** React with a custom CRT Terminal/Hacker UI.

## 📦 Project Progress & Features

### ✅ Stage 1: Foundation (Complete)
* [x] Express / Socket.io Relay Server (Port 3001)
* [x] "Hacker Mode" UI with live system logging
* [x] Channel/Room isolation

### ✅ Stage 2: Quantum-Safe Key Exchange (Complete)
* [x] Integrated `crystals-kyber-js`
* [x] Client-side generation of Kyber-768 & LWE Keypairs
* [x] Socket relay of Public Keys (`share_pubkey`)
* [x] Kyber Encapsulation & Decapsulation (`send_handshake`)
* [x] Visual Identicons for Public Key fingerprint verification

### ✅ Stage 3: Multi-Layer Payload & Obfuscation (Complete)
* [x] `encryptLWE` / `decryptLWE`: Message conversion to binary and LWE lattice encryption.
* [x] `encryptAES` / `decryptAES`: Wrapping the LWE payload using the Kyber shared secret.
* [x] `embedStego` / `extractStego`: Hiding the AES cipher inside an uploaded Carrier Image.

### ✅ Stage 4: Advanced Security Features (Complete)
* [x] **Dead-Man's Switch:** If the room creator disconnects, the frequency is immediately terminated and sockets are destroyed for all users.
* [x] Audio threat/alert system for connectivity and verification statuses.

### 🚧 Stage 5: Advanced Cryptographic Protocols (Upcoming)
* [ ] **Post-Quantum Digital Signatures:** Integrate CRYSTALS-Dilithium or Falcon to authenticate messages and mathematically prevent Man-in-the-Middle (MITM) attacks.
* [ ] **Quantum-Safe Double Ratchet:** Implement continuous session key rotation (Perfect Forward Secrecy) to ensure that if one session key is compromised, past and future messages remain completely secure.
* [ ] **Cryptographic Padding:** Add randomized, constant-length padding to all LWE/AES ciphertexts before steganography embedding to defeat traffic analysis and payload size correlation.
