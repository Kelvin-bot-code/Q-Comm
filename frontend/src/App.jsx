import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Kyber768 } from 'https://esm.sh/crystals-kyber-js@1.1.1';
import './index.css';

// --- CONFIG ---
const SERVER_URL = 'http://localhost:3001'; 

const socket = io(SERVER_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

// --- SOUNDS ---
const SOUNDS = {
  msg: 'https://assets.mixkit.co/active_storage/sfx/2044/2044-preview.mp3',
  boot: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
  alert: 'https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3',
  verify: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'
};

const playSound = (name) => {
  const now = Date.now();
  if (window.lastSfx && now - window.lastSfx < 100) return;
  window.lastSfx = now;
  if (SOUNDS[name]) {
    const audio = new Audio(SOUNDS[name]);
    audio.volume = 0.4;
    audio.play().catch(e => console.warn("Audio blocked"));
  }
};

// --- UTILS ---
const toHex = (data) => {
  if (!data) return "NULL";
  let bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const slice = bytes.slice(0, 32);
  let hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  if (bytes.length > 32) hex += ` ... [${bytes.length} bytes]`;
  return hex;
};

// --- 1. EDUCATIONAL CUSTOM LWE (Lattice Math) ---
const LWE_Q = 97; 
const LWE_N = 10; 
const LWE_ERR = 2;
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const generateLWEKeys = () => {
  const sk = Array.from({length: LWE_N}, () => randInt(0, LWE_Q - 1));
  const A = Array.from({length: LWE_N}, () => Array.from({length: LWE_N}, () => randInt(0, LWE_Q - 1)));
  const b = A.map(row => {
    let dot = row.reduce((sum, val, j) => sum + val * sk[j], 0);
    return (dot + randInt(-LWE_ERR, LWE_ERR)) % LWE_Q;
  });
  return { sk, pk: { A, b } };
};

const encryptLWEBit = (bit, pk) => {
  const r = Array.from({length: LWE_N}, () => randInt(0, 1));
  const u = Array.from({length: LWE_N}, (_, j) => r.reduce((sum, val, i) => sum + val * pk.A[i][j], 0) % LWE_Q);
  const v_val = r.reduce((sum, val, i) => sum + val * pk.b[i], 0);
  const v = (v_val + randInt(-LWE_ERR, LWE_ERR) + bit * Math.floor(LWE_Q / 2)) % LWE_Q;
  return { u, v };
};

const decryptLWEBit = (ct, sk) => {
  const dot = ct.u.reduce((sum, val, i) => sum + val * sk[i], 0);
  const dec = (ct.v - dot) % LWE_Q;
  const val = dec < 0 ? dec + LWE_Q : dec; 
  return (val > Math.floor(LWE_Q / 4) && val < Math.floor(3 * LWE_Q / 4)) ? 1 : 0;
};

const encryptLWE = (msg, pk) => {
  const bin = Array.from(msg).map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join('');
  return Array.from(bin).map(bit => encryptLWEBit(parseInt(bit), pk));
};

const decryptLWE = (cts, sk) => {
  const bin = cts.map(ct => decryptLWEBit(ct, sk)).join('');
  let str = '';
  for(let i=0; i<bin.length; i+=8) {
    str += String.fromCharCode(parseInt(bin.slice(i, i+8), 2));
  }
  return str;
};

// --- 2. KYBER AES-GCM WRAPPER ---
async function encryptAES(msg, keyBytes) {
  const key = await window.crypto.subtle.importKey("raw", keyBytes, "AES-GCM", true, ["encrypt", "decrypt"]);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(msg));
  const buffer = new Uint8Array(12 + ciphertext.byteLength);
  buffer.set(iv); 
  buffer.set(new Uint8Array(ciphertext), 12);
  return window.btoa(String.fromCharCode(...buffer));
}

async function decryptAES(packedMsg, keyBytes) {
  try {
    const key = await window.crypto.subtle.importKey("raw", keyBytes, "AES-GCM", true, ["encrypt", "decrypt"]);
    const data = new Uint8Array(window.atob(packedMsg).split('').map(c => c.charCodeAt(0)));
    const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, key, data.slice(12));
    return new TextDecoder().decode(decrypted);
  } catch (e) { return null; }
}

// --- 3. HTML5 CANVAS LSB STEGANOGRAPHY ---
const STEGO_DELIMITER = '1111111111111110';

const embedStego = async (payloadStr, imageSrc) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      const binPayload = Array.from(payloadStr).map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join('') + STEGO_DELIMITER;
      let dataIdx = 0;

      for (let i = 0; i < data.length; i += 4) {
        if (dataIdx < binPayload.length) data[i] = (data[i] & ~1) | parseInt(binPayload[dataIdx++]);     
        if (dataIdx < binPayload.length) data[i+1] = (data[i+1] & ~1) | parseInt(binPayload[dataIdx++]); 
        if (dataIdx < binPayload.length) data[i+2] = (data[i+2] & ~1) | parseInt(binPayload[dataIdx++]); 
        if (dataIdx >= binPayload.length) break;
      }
      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject("Failed to load stego image.");
    img.src = imageSrc; 
  });
};

const extractStego = async (dataUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      let binStr = "";
      for (let i = 0; i < data.length; i += 4) {
        binStr += (data[i] & 1).toString() + (data[i+1] & 1).toString() + (data[i+2] & 1).toString();
        if (binStr.endsWith(STEGO_DELIMITER)) {
          binStr = binStr.slice(0, -STEGO_DELIMITER.length);
          let str = '';
          for(let j=0; j<binStr.length; j+=8) str += String.fromCharCode(parseInt(binStr.slice(j, j+8), 2));
          resolve(str);
          return;
        }
      }
      reject("No Stego Data Found in Carrier Image");
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
};

// --- SUB-COMPONENTS ---
const Identicon = ({ data, size = 50 }) => {
  if (!data) return <div style={{ width: size, height: size, background: '#111', border: '1px dashed #333' }}></div>;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const blocks = [];
  for (let i = 0; i < 25; i++) blocks.push(bytes[i % bytes.length] % 2 === 0);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', width: size, height: size, border: '1px solid #0f0', padding: '2px', background: '#000', gap: '1px' }}>
      {blocks.map((filled, i) => (<div key={i} style={{ background: filled ? '#0f0' : '#002200' }} />))}
    </div>
  );
};

// --- MAIN APPLICATION ---
function App() {
  const [status, setStatus] = useState('offline');
  const [viewMode, setViewMode] = useState('logs');
  const [loginMode, setLoginMode] = useState('join'); 
  
  const [bootLog, setBootLog] = useState([]);
  const [isBooted, setIsBooted] = useState(false);
  const [isInRoom, setIsInRoom] = useState(false);
  const [isCreator, setIsCreator] = useState(false); 
  const [hackerMode, setHackerMode] = useState(false);
  const [logs, setLogs] = useState([]);
  const [msgInput, setMsgInput] = useState('');
  const [chatList, setChatList] = useState([]);
  const [room, setRoom] = useState("");
  const [username, setUsername] = useState(localStorage.getItem('qcomm_user') || "OPERATOR");
  
  const [stegoImage, setStegoImage] = useState(null); 
  const stegoImageInputRef = useRef(null);

  // Crypto State
  const [keys, setKeys] = useState({ pub: null, sec: null, lwePub: null, lweSec: null });
  const [peerPub, setPeerPub] = useState(null);
  const [peerLwePub, setPeerLwePub] = useState(null);
  const [sharedSecret, setSharedSecret] = useState(null);
  const [isVerified, setIsVerified] = useState(false);

  const keysRef = useRef(keys);
  const sharedSecretRef = useRef(sharedSecret);
  const roomRef = useRef(room);
  const chatEndRef = useRef(null);
  const logEndRef = useRef(null);

  useEffect(() => { keysRef.current = keys; }, [keys]);
  useEffect(() => { sharedSecretRef.current = sharedSecret; }, [sharedSecret]);
  useEffect(() => { roomRef.current = room; }, [room]);

  // --- LOGGING ---
  const addLog = useCallback((type, content, dump = null) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    setLogs(prev => [...prev.slice(-99), { time: timestamp, type, content, dump: dump ? toHex(dump) : null }]);
  }, []);

  // --- SOCKET LISTENERS ---
  useEffect(() => {
    const onConnect = () => {
      setStatus('online');
      addLog("NET", `Uplink Established: ${socket.id}`);
      if (keysRef.current.pub && roomRef.current) {
        socket.emit('share_pubkey', { key: Array.from(keysRef.current.pub), lweKey: keysRef.current.lwePub, room: roomRef.current });
      }
    };
    
    const onDisconnect = () => { setStatus('offline'); addLog("NET", "⚠️ UPLINK SEVERED"); playSound('alert'); };
    
    const onUserJoined = (id) => {
      addLog("NET", `User Joined: ${id}`);
      setChatList((p) => [...p.slice(-49), { txt: `SIGNAL DETECTED: ${id.substr(0, 4)}...`, type: 'system', ts: Date.now(), id: 'sys' }]);
      playSound('alert');
      // Transmit keys back to the new joiner
      if (keysRef.current.pub) {
        socket.emit('share_pubkey', { key: Array.from(keysRef.current.pub), lweKey: keysRef.current.lwePub, room: roomRef.current });
      }
    };
    
    const onUserLeft = (id) => {
      addLog("NET", `User Left: ${id}`);
      setChatList((p) => [...p.slice(-49), { txt: `SIGNAL LOST: ${id.substr(0, 4)}...`, type: 'system', ts: Date.now(), id: 'sys' }]);
      playSound('alert');
      setPeerPub(null);
      setPeerLwePub(null);
      setIsVerified(false);
      setSharedSecret(null);
    };
    
    const onPeerPubkey = (d) => {
      if (d.id !== socket.id) {
        setPeerPub(new Uint8Array(d.key));
        setPeerLwePub(d.lweKey);
        setIsVerified(false);
        addLog("NET-IN", `Peer Kyber & LWE PubKeys Received`);
      }
    };
    
    const onHandshake = async (data) => {
      addLog("IN", "Handshake Rcvd", data.ct);
      try {
        const ciphertext = new Uint8Array(data.ct);
        const kyber = new Kyber768();
        let result = kyber.decap ? await kyber.decap(ciphertext, keysRef.current.sec) : await kyber.decapsulate(ciphertext, keysRef.current.sec);
        let secret = result.sharedSecret || result.ss || result;
        if (!(secret instanceof Uint8Array)) secret = new Uint8Array(secret);
        setSharedSecret(secret);
        addLog("OK", "Kyber Secret Derived", secret);
        setChatList((p) => [...p.slice(-49), { txt: `SECURE HANDSHAKE ESTABLISHED`, type: 'system', ts: Date.now(), id: 'sys' }]);
        playSound('boot');
      } catch (e) {
        console.error(e);
        addLog("ERR", "Handshake Failed");
      }
    };
    
    const onMsg = async (d) => {
      if (d.id !== socket.id) playSound('msg');
      
      if (sharedSecretRef.current && d.type === 'stego') {
        try {
          addLog("IN", "Processing Stego Carrier...");
          const extractedAES = await extractStego(d.txt);
          const extractedLWEJSON = await decryptAES(extractedAES, sharedSecretRef.current);
          if (!extractedLWEJSON) throw new Error("AES Decryption Failed");
          
          const lweCts = JSON.parse(extractedLWEJSON);
          const clearText = decryptLWE(lweCts, keysRef.current.lweSec);

          setChatList((p) => [...p.slice(-49), { ...d, txt: clearText, carrier: d.txt, secure: true }]);
        } catch (e) {
          console.error(e);
          setChatList((p) => [...p.slice(-49), { ...d, txt: "🔒 [MULTI-LAYER DECRYPTION FAILED]", secure: false }]);
          addLog("ERR", "Integrity Check / Stego Extraction Failed");
        }
      } else {
        setChatList((p) => [...p.slice(-49), { ...d, secure: false }]);
      }
    };

    const onRoomTerminated = () => {
        playSound('alert');
        alert("CRITICAL: THIS FREQUENCY HAS BEEN TERMINATED.");
        window.location.reload(); 
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('peer_pubkey', onPeerPubkey);
    socket.on('handshake_challenge', onHandshake);
    socket.on('rcv_msg', onMsg);
    socket.on('room_terminated', onRoomTerminated);

    return () => { socket.off(); };
  }, [addLog]);

  // --- ACTIONS ---

  const handleStegoImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { 
        alert("CARRIER IMAGE TOO LARGE (Max 2MB)");
        return;
    }
    const reader = new FileReader();
    reader.onload = () => setStegoImage(reader.result); 
    reader.readAsDataURL(file);
  };

  const executeUplink = async () => {
    if (!room) return;
    if (loginMode === 'create' && !stegoImage) {
        alert("YOU MUST UPLOAD A CARRIER IMAGE TO CREATE A ROOM.");
        return;
    }

    socket.connect();
    
    const eventName = loginMode === 'create' ? 'create_room' : 'join_room';
    const payload = loginMode === 'create' ? { room, stegoImg: stegoImage } : { room };

    socket.emit(eventName, payload, async (response) => {
        if (!response.success) {
            alert(response.message);
            socket.disconnect();
            return;
        }

        setIsInRoom(true);
        setIsCreator(loginMode === 'create');
        if (loginMode === 'join') {
            setStegoImage(response.stegoImg); 
        }

        let step = 0;
        const steps = ["INITIALIZING KERNEL...", "GENERATING PQC MODULES...", "GENERATING LWE LATTICE...", `CONNECTING TO FREQ: ${room.toUpperCase()}...`];
        const interval = setInterval(() => {
          if (step < steps.length) {
            setBootLog(prev => [...prev, steps[step]]);
            playSound('boot');
            step++;
          } else {
            clearInterval(interval);
            setIsBooted(true);
          }
        }, 250);

        try {
          addLog("SYS", "Generating New Kyber Keypair...");
          const kyber = new Kyber768();
          const pair = await kyber.generateKeyPair();
          const pk = pair.publicKey || pair[0];
          const sk = pair.privateKey || pair[1];
          
          addLog("SYS", "Generating LWE Lattice Keys...");
          const lwePair = generateLWEKeys();

          setKeys({ pub: pk, sec: sk, lwePub: lwePair.pk, lweSec: lwePair.sk });
          localStorage.setItem('qcomm_user', username);

          // Broadcast keys to the room immediately upon generation
          socket.emit('share_pubkey', { 
            key: Array.from(pk), 
            lweKey: lwePair.pk, 
            room: room 
          });
          
        } catch (err) {
          console.error(err);
          addLog("ERR", "Initialization Failed");
        }
    });
  };

  const terminateRoom = () => {
      if (window.confirm("WARNING: DO YOU WANT TO TERMINATE THIS FREQUENCY? THIS WILL DESTROY THE ROOM FOR ALL USERS.")) {
          socket.emit('terminate_room', room);
      }
  };

  const initiateHandshake = async () => {
    if (!peerPub) return;
    addLog("OUT", "Encapsulating Kyber Secret...");
    try {
      const kyber = new Kyber768();
      let result = kyber.encap ? await kyber.encap(peerPub) : await kyber.encapsulate(peerPub);
      let ciphertext, secret;
      if (Array.isArray(result)) { ciphertext = result[0]; secret = result[1]; }
      else { ciphertext = result.ciphertext || result.c; secret = result.sharedSecret || result.ss; }
      if (!(secret instanceof Uint8Array)) secret = new Uint8Array(secret);
      setSharedSecret(secret);
      socket.emit('send_handshake', { ct: Array.from(ciphertext), room: room });
      addLog("OUT", "Handshake Challenge Sent");
    } catch (e) { console.error(e); }
  };

  const sendMessage = async () => {
    if (!msgInput) return;
    if (!sharedSecret || !peerLwePub || !stegoImage) {
      alert("SECURE CHANNEL, PEER LWE KEYS, AND CARRIER IMAGE REQUIRED.");
      return;
    }

    addLog("IO", `Initializing Multi-Layer Encryption...`);
    try {
      const lweCipher = encryptLWE(msgInput, peerLwePub);
      const lweJSON = JSON.stringify(lweCipher);
      
      const secretBytes = sharedSecret instanceof Uint8Array ? sharedSecret : new Uint8Array(sharedSecret);
      const aesCipher = await encryptAES(lweJSON, secretBytes);
      
      const stegoImgBase64 = await embedStego(aesCipher, stegoImage); 
      
      let payload = { txt: stegoImgBase64, ts: Date.now(), id: socket.id, encrypted: true, type: 'stego', room: room };
      socket.emit('send_msg', payload);
      
      setChatList((p) => [...p.slice(-49), { txt: msgInput, carrier: stegoImgBase64, ts: Date.now(), id: socket.id, secure: true, type: 'stego' }]);
      setMsgInput('');
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    } catch (err) {
      console.error(err);
      alert("Encryption Pipeline Failed. Payload may be too large for the chosen Carrier Image.");
    }
  };

  // --- CLEANUP ---
  useEffect(() => {
    if (logEndRef.current && viewMode === 'logs') logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [logs, viewMode]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatList]);

  // --- RENDER ---
  if (!isInRoom) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="terminal-header" style={{ justifyContent: 'center', marginBottom: '15px' }}>Q-COMM V3.0</div>
          
          <div style={{ display: 'flex', borderBottom: '1px solid #0f0', marginBottom: '15px' }}>
              <div 
                  onClick={() => setLoginMode('join')} 
                  style={{ flex: 1, textAlign: 'center', padding: '10px', cursor: 'pointer', background: loginMode === 'join' ? '#0f0' : '#000', color: loginMode === 'join' ? '#000' : '#0f0', fontWeight: 'bold' }}
              > JOIN UPLINK </div>
              <div 
                  onClick={() => setLoginMode('create')} 
                  style={{ flex: 1, textAlign: 'center', padding: '10px', cursor: 'pointer', background: loginMode === 'create' ? '#0f0' : '#000', color: loginMode === 'create' ? '#000' : '#0f0', fontWeight: 'bold' }}
              > CREATE UPLINK </div>
          </div>

          <div className="login-form">
            <div className="label">CODENAME</div>
            <input className="cyber-input" value={username} onChange={(e) => setUsername(e.target.value)} spellCheck="false" />
            
            <div className="label">TARGET FREQUENCY</div>
            <input className="cyber-input" value={room} placeholder="ENTER CHANNEL NAME..." onChange={(e) => setRoom(e.target.value)} spellCheck="false" />
            
            {loginMode === 'create' && (
                <div style={{ border: '1px dashed #0f0', padding: '10px', marginTop: '10px', background: 'rgba(0,255,0,0.05)' }}>
                    <div className="label" style={{ marginBottom: '10px' }}>STEGO CARRIER IMAGE (REQUIRED)</div>
                    <input type="file" accept="image/*" ref={stegoImageInputRef} hidden onChange={handleStegoImageSelect} />
                    <button className="cyber-button sm" style={{ width: '100%' }} onClick={() => stegoImageInputRef.current.click()}>
                        {stegoImage ? "✓ IMAGE LOADED" : "UPLOAD IMAGE"}
                    </button>
                    {stegoImage && <img src={stegoImage} alt="preview" style={{ width: '100%', height: '80px', objectFit: 'cover', marginTop: '10px', border: '1px solid #0f0' }}/>}
                </div>
            )}

            <button className="cyber-button full-width" style={{ marginTop: '15px' }} onClick={executeUplink}>
                {loginMode === 'create' ? 'ESTABLISH NEW UPLINK' : 'CONNECT TO UPLINK'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-container ${hackerMode ? 'hacker-mode' : ''}`}>
      <div className="main-interface crt-screen">
        <div className="terminal-header">
          <div className="header-title">Q-COMM <span className="channel-tag">// {room.toUpperCase()}</span></div>
          <div className="header-controls">
            {isCreator && (
                <button className="cyber-button sm danger" title="TERMINATE ROOM" onClick={terminateRoom} style={{ background: 'red', color: 'white', borderColor: 'darkred' }}> ☠️ </button>
            )}
            
            {peerPub && (<div className={`status-badge ${isVerified ? 'verified' : 'unverified'}`}> {isVerified ? '✓ SECURED' : '⚠ UNVERIFIED'} </div>)}
            <button className={`cyber-button sm ${hackerMode ? 'active' : ''}`} onClick={() => setHackerMode(!hackerMode)}> {hackerMode ? '▼ DATA' : '▲ DATA'} </button>
            <div className="status-indicator online">●</div>
          </div>
        </div>
        
        {!isBooted && <div className="boot-sequence">{bootLog.map((l, i) => <div key={i}>&gt; {l}</div>)}</div>}
        
        <div className="chat-interface" style={{ display: isBooted ? 'flex' : 'none' }}>
          <div className="alert-bar">
            {peerPub && !sharedSecret && <button className="cyber-button alert sm" onClick={initiateHandshake}>[ ! ] INITIATE HANDSHAKE</button>}
          </div>
          
          <div className="chat-window">
            {chatList.map((msg, k) => {
              if (msg.type === 'system') return <div key={k} className="sys-msg"> &lt;&lt; {msg.txt} &gt;&gt; </div>;
              const isMe = msg.id === socket.id;

              return (
                <div key={k} className={`msg-row ${isMe ? 'msg-me' : 'msg-peer'}`}>
                  <div className="msg-meta">
                    <span>{isMe ? username : 'TRG'}</span>
                    <span>{new Date(msg.ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="msg-bubble" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {/* UI UPDATED: Removed the Stego Carrier Image visual display */}
                    {msg.secure ? <span className="lock-icon" title="Encrypted">🔒 Multi-Layer Protected</span> : <span className="warn-icon" title="Unsafe">⚠️ Plaintext</span>}
                    <div style={{ marginTop: '5px' }}>{msg.txt}</div>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          <div className="input-area">
            <input
              className="cyber-input message-input" 
              value={msgInput} 
              onChange={(e) => setMsgInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder={isVerified ? "ENTER COMMAND..." : "AWAITING SECURE HANDSHAKE..."}
              disabled={!isVerified}
            />
            <button className="cyber-button send-btn" disabled={!isVerified} onClick={sendMessage}>TX</button>
          </div>
        </div>
      </div>

      <div className="hacker-panel">
        <div className="hp-tabs">
          <div onClick={() => setViewMode('logs')} className={viewMode === 'logs' ? 'active' : ''}>LOGS</div>
          <div onClick={() => setViewMode('verify')} className={viewMode === 'verify' ? 'active' : ''}>ID</div>
          <div onClick={() => setHackerMode(false)} style={{ color: '#ff4444' }}>✕</div>
        </div>
        
        {viewMode === 'logs' ? (
          <div className="hp-content">
            <div className="hp-header">// SYSTEM_STREAM</div>
            <div className="hp-log-stream">
              {logs.map((l, i) => (
                <div key={i} className="log-entry">
                  <span className="log-time">[{l.time}]</span> <span className={`log-type ${l.type}`}>{l.type}</span>
                  <div className="log-txt">{l.content}</div>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        ) : (
          <div className="hp-content">
            <div className="hp-header">// SAFETY_NUMBER_VERIFICATION</div>
            <div className="id-card">
              <div className="id-label">YOU ({username})</div>
              <div className="id-visual"><Identicon data={keys.pub} size={60} /></div>
            </div>
            <div className="id-card peer">
              <div className="id-label">PEER (TARGET)</div>
              {peerPub ? (
                <div className="id-visual"><Identicon data={peerPub} size={60} /></div>
              ) : <div className="id-wait">WAITING FOR SIGNAL...</div>}
            </div>
            <div className="verify-actions">
              {isVerified ? (
                <div className="verified-box">
                  <h3>✓ IDENTITY CONFIRMED</h3>
                  <p>Channel Secured.</p>
                </div>
              ) : (
                <button className="cyber-button full-width" disabled={!peerPub} onClick={() => { setIsVerified(true); playSound('verify'); addLog("SEC", "Manual Verification Confirmed"); }}>
                  {peerPub ? "CONFIRM MATCH" : "NO PEER"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;