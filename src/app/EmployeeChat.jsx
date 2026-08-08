import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useApp } from './AppContext';

export default function EmployeeChatSynced(props) {
  // تفعيل المزامنة اللحظية عبر BroadcastChannel بين النوافذ المفتوحة وأقسام النظام
  useEffect(() => {
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      const chatSyncChannel = new BroadcastChannel('global_system_state_bus');

      chatSyncChannel.onmessage = (event) => {
        if (event.data && (event.data.type === 'TRIGGER_CHAT_SYNC' || event.data.type === 'GLOBAL_STATE_UPDATE')) {
          window.dispatchEvent(new Event('force_chat_sync'));
        }
      };

      return () => {
        chatSyncChannel.close();
      };
    }
  }, []);

  return (
    <div style={{ width: '100%', minHeight: '100vh', boxSizing: 'border-box' }}>
      <EmployeeChatOriginal {...props} />
    </div>
  );
}

function EmployeeChatOriginal({ 
  systemData = {}, 
  employees: externalEmployees = [] 
}) {
  const { 
    chats: contextChats = [], 
    setChats: setContextChats,
    employees: contextEmployees = [],
    globalBus,
    setGlobalBus,
    addLog,
    api
  } = useApp() || {};

  const [internalChats, setInternalChats] = useState([]);
  const [currentUser, setCurrentUser] = useState('مسؤول النظام (Hamza)');
  const [message, setMessage] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [isEmailMode, setIsEmailMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [searchChat, setSearchChat] = useState('');
  const [activeUsers, setActiveUsers] = useState([]);

  const chatContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [attachedFile, setAttachedFile] = useState(null);

  const emojis = ['😀','😂','🥰','😎','🤔','👍','👎','❤️','🔥','🎉','✅','❌','🚀','💡','⚡','🙏','💪','🎯','📎','💬'];

  // 🔒 دالة تعقيم
  const sanitizeInput = (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>]/g, '');
  };

  const broadcastGlobalChange = (payload = {}) => {
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        const channel = new BroadcastChannel('global_system_state_bus');
        channel.postMessage({ type: 'GLOBAL_STATE_UPDATE', ...payload });
        channel.close();
      }
    } catch (e) {}
    if (setGlobalBus && typeof setGlobalBus === 'function') {
      setGlobalBus(Date.now());
    }
  };

  const safeEmployees = externalEmployees.length > 0 
    ? externalEmployees 
    : (contextEmployees.length > 0 
      ? contextEmployees 
      : (systemData.employees || []));

  const safeChats = contextChats.length > 0 
    ? contextChats 
    : (internalChats.length > 0 ? internalChats : (systemData.chats || []));

  const updateChats = (newList) => {
    setInternalChats(newList);
    if (setContextChats && typeof setContextChats === "function") {
      setContextChats(newList);
    }
  };

  // جلب المحادثات
  const fetchChatsFromAPI = async () => {
    try {
      let response;
      if (api) {
        response = await api.get('/system/chats');
      } else {
        const token = localStorage.getItem('token');
        response = await axios.get("/api/system/chats", {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
      }
      if (response && response.data) {
        updateChats(response.data);
        // Extract unique senders as active users
        const senders = [...new Set(response.data.map(c => c.sender).filter(Boolean))];
        setActiveUsers(senders);
      }
    } catch (err) {
      console.error("فشل جلب المحادثات من الخادم:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    fetchChatsFromAPI();

    const handleExternalSync = () => {
      fetchChatsFromAPI();
    };
    window.addEventListener('force_chat_sync', handleExternalSync);

    // Poll every 10 seconds as fallback
    const interval = setInterval(fetchChatsFromAPI, 10000);

    return () => {
      window.removeEventListener('force_chat_sync', handleExternalSync);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [safeChats]);

  // 📨 إرسال رسالة دردشة
  const sendMessage = async (e) => {
    e.preventDefault();
    const safeMsg = sanitizeInput(message);
    if (!safeMsg.trim() && !attachedFile) return;

    const safeCurrentUser = sanitizeInput(currentUser);
    const fileInfo = attachedFile ? { name: attachedFile.name, size: attachedFile.size, type: attachedFile.type } : null;

    const newChatPayload = {
      sender: safeCurrentUser,
      message: safeMsg.trim(),
      file: fileInfo,
      date: new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }),
      deleted: false,
      timestamp: new Date().toISOString()
    };

    try {
      let savedChat;
      if (api) {
        const response = await api.post('/system/chats', newChatPayload);
        savedChat = response.data.chat || { ...newChatPayload, id: response.data.id || Date.now() };
      } else {
        const token = localStorage.getItem('token');
        const response = await axios.post("/api/system/chats", newChatPayload, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        savedChat = response.data.chat || { ...newChatPayload, id: response.data.id || Date.now() };
      }

      const updatedList = [...safeChats, savedChat];
      updateChats(updatedList);
      broadcastGlobalChange({ action: 'NEW_CHAT', chat: savedChat });
      setMessage('');
      setAttachedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (typeof addLog === 'function') addLog({ action: `💬 رسالة جديدة من: ${safeCurrentUser}` });
    } catch (err) {
      console.error("فشل إرسال الرسالة:", err);
      // Local fallback
      const localChat = { ...newChatPayload, id: Date.now() };
      updateChats([...safeChats, localChat]);
      setMessage('');
      setAttachedFile(null);
    }
  };

  // 📧 إرسال إيميل حقيقي
  const sendRealEmail = async (e) => {
    e.preventDefault();
    const safeMsg = sanitizeInput(message);
    if (!safeMsg.trim() || !recipientEmail) {
      alert("يرجى كتابة الرسالة وتحديد بريد المستلم.");
      return;
    }

    setIsSendingEmail(true);
    try {
      if (api) {
        await api.post('/system/send-email', {
          to: recipientEmail,
          sender: currentUser,
          content: safeMsg.trim(),
          timestamp: new Date().toISOString()
        });
      } else {
        const token = localStorage.getItem('token');
        await axios.post("/api/system/send-email", {
          to: recipientEmail,
          sender: currentUser,
          content: safeMsg.trim(),
          timestamp: new Date().toISOString()
        }, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
      }

      alert("تم إرسال البريد الإلكتروني الحقيقي بنجاح! ✉️");
      setMessage('');
      setIsEmailMode(false);
      broadcastGlobalChange({ action: 'EMAIL_SENT', recipient: recipientEmail });
      if (typeof addLog === 'function') addLog({ action: `📧 إيميل مرسل إلى: ${recipientEmail}` });
    } catch (err) {
      console.error("فشل إرسال الإيميل:", err);
      alert("تعذر إرسال الإيميل عبر الخادم.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  // 🗑️ حذف رسالة
  const deleteMessage = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الرسالة؟')) return;
    try {
      if (api) {
        await api.patch(`/system/chats/${id}`, { deleted: true });
      } else {
        const token = localStorage.getItem('token');
        await axios.patch(`/api/system/chats/${id}`, { deleted: true }, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
      }
      const updated = safeChats.map(c => c && c.id === id ? { ...c, deleted: true } : c);
      updateChats(updated);
      broadcastGlobalChange({ action: 'DELETE_CHAT', id });
    } catch (err) {
      console.error("فشل حذف الرسالة:", err);
    }
  };

  const activeChats = safeChats.filter(c => c && !c.deleted);
  const filteredChats = searchChat.trim() 
    ? activeChats.filter(c => (c.message || '').toLowerCase().includes(searchChat.toLowerCase()) || (c.sender || '').toLowerCase().includes(searchChat.toLowerCase()))
    : activeChats;

  // --- أنماط التصميم الزجاجي ---
  const glassContainerStyle = {
    background: 'rgba(15, 23, 42, 0.85)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
    padding: '25px',
    borderRadius: '24px',
    color: '#fff',
    fontFamily: 'Tajawal, sans-serif',
    minHeight: '100vh',
    width: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column'
  };

  const glassBoxStyle = {
    background: 'rgba(11, 15, 25, 0.75)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
  };

  const glassInputStyle = {
    background: 'rgba(30, 41, 59, 0.75)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.3s ease',
  };

  return (
    <div style={glassContainerStyle} dir="rtl">

      {/* رأس لوحة الدردشة */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '28px' }}>{isEmailMode ? '✉️' : '💬'}</span>
          <div>
            <h3 style={{ margin: '0', color: isEmailMode ? '#38bdf8' : '#f97316', fontSize: '22px', fontWeight: 'bold', textShadow: '0 0 10px rgba(249, 115, 22, 0.3)' }}>
              {isEmailMode ? 'إرسال بريد إلكتروني رسمي للفريق' : 'دردشة الفريق (Global State Bus + مزامنة حية)'}
            </h3>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>متصل عبر ناقل الحالة العام لكل أقسام النظام</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder="🔍 ابحث في الرسائل..." 
            value={searchChat}
            onChange={(e) => setSearchChat(e.target.value)}
            style={{ ...glassInputStyle, padding: '8px 14px', borderRadius: '10px', fontSize: '13px', width: '180px' }}
          />
          <button 
            onClick={() => setIsEmailMode(!isEmailMode)}
            style={{ background: isEmailMode ? 'rgba(249, 115, 22, 0.2)' : 'rgba(56, 189, 248, 0.2)', border: `1px solid ${isEmailMode ? '#f97316' : '#38bdf8'}`, color: '#fff', padding: '8px 16px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {isEmailMode ? 'العودة للدردشة 💬' : 'وضع إرسال إيميل ✉️'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(30, 41, 59, 0.7)', padding: '6px 12px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 'bold' }}>بصفتي:</span>
            <select 
              value={currentUser} 
              onChange={(e) => setCurrentUser(sanitizeInput(e.target.value))} 
              style={{ ...glassInputStyle, background: '#0f172a', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              <option value="مسؤول النظام (Hamza)">👑 مسؤول النظام (Hamza)</option>
              {safeEmployees.map(emp => emp && (
                <option key={emp.id || emp.name} value={sanitizeInput(emp.name || emp.title)}>
                  👤 {emp.name || emp.title} {emp.role ? `(${sanitizeInput(emp.role)})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Active Users */}
      {!isEmailMode && activeUsers.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>👥 نشطون:</span>
          {activeUsers.map((u, i) => (
            <span key={i} style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              🟢 {u}
            </span>
          ))}
        </div>
      )}

      {/* شاشة عرض الرسائل */}
      {!isEmailMode ? (
        <div 
          ref={chatContainerRef}
          style={{ ...glassBoxStyle, padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px', minHeight: '400px' }}
        >
          {isLoading ? (
            <div style={{ color: '#94a3b8', textAlign: 'center', margin: 'auto' }}>جاري جامع حالة الأقسام ومزامنة البيانات...</div>
          ) : filteredChats.length === 0 ? (
            <div style={{ color: '#94a3b8', textAlign: 'center', margin: 'auto', fontSize: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '40px' }}>💬</span>
              <span>لا توجد رسائل حالياً. ابدأ بالتواصل مع بقية الأقسام الآن! 🚀</span>
            </div>
          ) : (
            filteredChats.map(c => {
              const isMe = c.sender === currentUser;
              return (
                <div 
                  key={c.id || Math.random()} 
                  style={{ 
                    background: isMe ? 'rgba(30, 41, 59, 0.9)' : 'rgba(30, 41, 59, 0.55)', 
                    border: isMe ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)', 
                    padding: '14px 18px', 
                    borderRadius: '16px', 
                    maxWidth: '75%',
                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    backdropFilter: 'blur(6px)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#38bdf8', marginBottom: '8px', gap: '15px' }}>
                    <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span>{isMe ? '👑' : '👤'}</span> {c.sender}
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: '11px' }}>{c.date}</span>
                  </div>

                  <div style={{ fontSize: '14px', color: '#f8fafc', background: 'rgba(15, 23, 42, 0.65)', padding: '12px 14px', borderRadius: '10px', lineHeight: '1.5', marginBottom: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: '1px solid rgba(255,255,255,0.04)' }}>
                    {c.message}
                  </div>

                  {c.file && (
                    <div style={{ fontSize: '12px', color: '#facc15', background: 'rgba(250, 204, 21, 0.1)', padding: '8px 12px', borderRadius: '8px', marginBottom: '8px', border: '1px solid rgba(250, 204, 21, 0.2)' }}>
                      📎 مرفق: {c.file.name} ({(c.file.size / 1024).toFixed(1)} KB)
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button onClick={() => deleteMessage(c.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', padding: 0, fontWeight: 'bold', opacity: 0.8 }} title="حذف الرسالة">
                      حذف 🗑️
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div style={{ ...glassBoxStyle, padding: '30px', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '20px', justifyContent: 'center', minHeight: '400px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', color: '#38bdf8', fontWeight: 'bold' }}>بريد المرسل إليه (البريد الإلكتروني الحقيقي):</label>
            <input 
              type="email" 
              placeholder="example@domain.com" 
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(sanitizeInput(e.target.value))}
              style={{ ...glassInputStyle, padding: '12px 16px', borderRadius: '12px', fontSize: '14px' }}
            />
          </div>
          <div style={{ color: '#94a3b8', fontSize: '12px', background: 'rgba(56, 189, 248, 0.05)', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
            ℹ️ سيتم إرسال محتوى الرسالة أدناه مباشرة كإيميل رسمي عبر خادم البريد.
          </div>
        </div>
      )}

      {/* حقل الإرسال الموحد */}
      <form onSubmit={isEmailMode ? sendRealEmail : sendMessage} style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
        {attachedFile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(250, 204, 21, 0.1)', padding: '8px 14px', borderRadius: '10px', border: '1px solid rgba(250, 204, 21, 0.2)' }}>
            <span style={{ color: '#facc15', fontSize: '13px' }}>📎 {attachedFile.name} ({(attachedFile.size / 1024).toFixed(1)} KB)</span>
            <button type="button" onClick={() => { setAttachedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}>✕</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          {!isEmailMode && (
            <>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && setAttachedFile(e.target.files[0])} />
              <button type="button" onClick={() => fileInputRef.current?.click()} style={{ background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', color: '#facc15', padding: '14px', borderRadius: '12px', cursor: 'pointer', fontSize: '18px' }}>
                📎
              </button>
              <div style={{ position: 'relative' }}>
                <button type="button" onClick={() => setEmojiPickerOpen(!emojiPickerOpen)} style={{ background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', color: '#fbbf24', padding: '14px', borderRadius: '12px', cursor: 'pointer', fontSize: '18px' }}>
                  😊
                </button>
                {emojiPickerOpen && (
                  <div style={{ position: 'absolute', bottom: '50px', right: 0, background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '10px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                    {emojis.map(emoji => (
                      <button key={emoji} type="button" onClick={() => { setMessage(prev => prev + emoji); setEmojiPickerOpen(false); }} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '4px' }}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          <textarea 
            rows="2"
            placeholder={isEmailMode ? "اكتب محتوى الإيميل الرسمي..." : "اكتب رسالة موجهة لكل الأقسام..."} 
            value={message} 
            onChange={(e) => setMessage(e.target.value)} 
            style={{ flex: 1, ...glassInputStyle, padding: '14px 18px', borderRadius: '12px', fontSize: '14px', resize: 'none' }} 
          />
          <button 
            type="submit" 
            disabled={isSendingEmail}
            style={{ 
              background: isEmailMode ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
              color: '#fff', 
              border: 'none', 
              padding: '0 28px', 
              borderRadius: '12px', 
              cursor: 'pointer', 
              fontWeight: 'bold', 
              fontSize: '15px', 
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
              opacity: isSendingEmail ? 0.7 : 1,
              height: '50px'
            }}
          >
            {isSendingEmail ? 'جاري... ⏳' : (isEmailMode ? 'إرسال ✉️' : 'إرسال 🚀')}
          </button>
        </div>
      </form>

    </div>
  );
}