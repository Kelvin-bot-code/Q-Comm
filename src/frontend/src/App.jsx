import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const sk = io('http://localhost:3001');

function App() {
  const [m, setM] = useState('');
  const [list, setList] = useState([]);
  const [status, setStatus] = useState('offline');

  useEffect(() => {
    sk.on('connect', () => setStatus('online'));
    sk.on('disconnect', () => setStatus('offline'));
    sk.on('rcv_msg', (d) => setList((p) => [...p, d]));

    return () => {
      sk.off('connect');
      sk.off('disconnect');
      sk.off('rcv_msg');
    };
  }, []);

  const send = () => {
    if (!m) return;
    const d = { txt: m, ts: Date.now(), id: sk.id };
    sk.emit('send_msg', d);
    setList((p) => [...p, d]);
    setM('');
  };

  return (
    <div style={{ padding: '20px', background: '#0a0a0a', color: '#00ff41', minHeight: '100vh', fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
        <h3 style={{ margin: 0 }}>Q-COMM // SYSTEM_V1</h3>
        <span style={{ color: status === 'online' ? '#00ff41' : '#ff4141' }}>● {status.toUpperCase()}</span>
      </div>
      
      <div style={{ border: '1px solid #333', height: '400px', overflowY: 'auto', padding: '10px', margin: '20px 0' }}>
        {list.map((i, k) => (
          <div key={k} style={{ marginBottom: '5px' }}>
            <span style={{ color: '#555' }}>[{new Date(i.ts).toLocaleTimeString()}]</span> 
            <span style={{ color: i.id === sk.id ? '#00ff41' : '#008fff' }}> {i.id === sk.id ? ' OUT > ' : ' IN < '}</span>
            {i.txt}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <input 
          style={{ background: '#000', color: '#00ff41', border: '1px solid #00ff41', padding: '12px', flex: 1, outline: 'none' }}
          value={m} 
          onChange={(e) => setM(e.target.value)} 
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="TYPE MESSAGE PACKET..." 
        />
        <button onClick={send} style={{ padding: '0 20px', background: '#00ff41', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>SEND</button>
      </div>
    </div>
  );
}

export default App;