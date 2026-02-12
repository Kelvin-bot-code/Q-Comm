# Post-Quantum Cryptography (PQC) Secure Chat

A real-time secure messaging application protected by **CRYSTALS-Kyber (ML-KEM)**, a NIST-standardized Post-Quantum Cryptographic algorithm.

## 🚀 Concept
Current encryption (RSA/Elliptic Curve) is vulnerable to future Quantum Computers (Shor's Algorithm). This project implements a **Quantum-Safe Key Encapsulation Mechanism (KEM)** to establish a shared secret, ensuring messages remain secure even against quantum attacks ("Harvest Now, Decrypt Later").

## 🛠 Tech Stack
- **Algorithm:** CRYSTALS-Kyber-1024 (via `crystals-kyber-js`)
- **Backend:** Node.js + Express + Socket.io
- **Frontend:** Vanilla JS (No framework for lightweight execution)
- **Encryption:** Hybrid approach (Kyber for Key Exchange + AES-256 for Payload)

## 📦 Milestones
- [ ] Basic Server Setup
- [ ] Real-time Socket Communication
- [ ] Integration of Kyber-1024
- [ ] Traffic Visualization ("Hacker View")