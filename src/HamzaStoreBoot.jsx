import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useApp } from './app/AppContext';

function humanTypingDelay() {
  return new Promise(resolve => setTimeout(resolve, 300));
}

export function HamzaStoreBoot({
  sessions = [{ id: '1', name: 'محادثتي' }],
  currentSessionId = '1',
  setCurrentSessionId = () => {},
  createNewPrivateSession = () => {},
  inputStyle = {}
}) {
  const contextData = useApp() || {};
  const apiUrl = contextData.apiUrl || '/api';
  const getAuthHeaders = typeof contextData.getAuthHeaders === 'function' ? contextData.getAuthHeaders : () => ({ 'Content-Type': 'application/json' });

  // 🔌 اشتقاق رابط الـ Socket.IO للمتجر العام
  const SOCKET_URL = apiUrl.replace(/\/api\/?$/, '');

  const ENDPOINTS = {
    customerAiChat: `${apiUrl}/customerAiChat`,
    products: `${apiUrl}/products`,
  };

  const fetchPublicProductsOnly = useCallback(async () => {
    let freshProducts = Array.isArray(contextData.products) ? contextData.products : [];

    try {
      // 🔒 محصور فقط في مسار المنتجات العامة (Public Products Catalog)
      const prodRes = await fetch(ENDPOINTS.products, { headers: getAuthHeaders() });

      if (prodRes.ok) {
        const pData = await prodRes.json();
        if (Array.isArray(pData)) freshProducts = pData;
        else if (pData && Array.isArray(pData.products)) freshProducts = pData.products;
      }
    } catch (e) {}

    return { freshProducts };
  }, [contextData.products, apiUrl]);

  const externalAiInput = contextData.aiInputText || '';
  const setExternalAiInput = typeof contextData.setAiInputText === 'function' ? contextData.setAiInputText : () => {};

  const [chatHistories, setChatHistories] = useState({});
  const [localInputText, setLocalInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const chatContainerRef = useRef(null);

  // 🛡️ مخزن لا يحتوي إلا على الكتالوج العام للمنتجات
  const liveDataRef = useRef({ freshProducts: [] });
  const [liveMode, setLiveMode] = useState('polling');

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

    const refreshPublicData = async () => {
      const latest = await fetchPublicProductsOnly();
      liveDataRef.current = latest;
    };

    socket.on('connect', () => {
      setLiveMode('socket');
      refreshPublicData();
    });
    socket.on('disconnect', () => setLiveMode('polling'));
    socket.on('connect_error', () => setLiveMode('polling'));

    socket.on('UPDATE_DATA', (data) => {
      // الاستماع فقط لتحديثات المنتجات العامة
      if (data && (data.type === 'PRODUCTS' || data.type === 'REFRESH_ALL')) {
        refreshPublicData();
      }
    });

    const fallbackInterval = setInterval(() => {
      if (!socket.connected) {
        refreshPublicData();
      }
    }, 5000);

    return () => {
      socket.disconnect();
      clearInterval(fallbackInterval);
    };
  }, [SOCKET_URL, fetchPublicProductsOnly]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistories, currentSessionId, isThinking]);

  useEffect(() => {
    if (externalAiInput) setLocalInputText(externalAiInput);
  }, [externalAiInput]);

  useEffect(() => {
    if (!currentSessionId) return;
    try {
      const savedData = localStorage.getItem(`smart_assistant_bot_v14_${currentSessionId}`);
      if (savedData) {
        setChatHistories(prev => ({ ...prev, [currentSessionId]: JSON.parse(savedData) }));
      } else {
        const initialChat = [{ id: 'msg-init', sender: 'bot', text: `أهلاً بك يا غالي! أنا المساعد الشامل للمتجر. واجهتك أي مشكلة عامة، تقنية، بالدفع، أو بالتصفح؟ اطرحها وراح انحلها معك فوراً!` }];
        setChatHistories(prev => ({ ...prev, [currentSessionId]: initialChat }));
        localStorage.setItem(`smart_assistant_bot_v14_${currentSessionId}`, JSON.stringify(initialChat));
      }
    } catch (e) {
      setChatHistories(prev => ({ ...prev, [currentSessionId]: [] }));
    }
  }, [currentSessionId]);

  function pushBotReply(text, baseChat) {
    const cleanText = (text || '').replace(/\*\*/g, '');
    const newMessage = { id: 'msg-' + Date.now(), sender: 'bot', text: cleanText };
    const finalChat = [...baseChat, newMessage];
    setChatHistories(prev => ({ ...prev, [currentSessionId]: finalChat }));
    try {
      localStorage.setItem(`smart_assistant_bot_v14_${currentSessionId}`, JSON.stringify(finalChat));
    } catch (e) {}
    return finalChat;
  }

  async function generatePerfectArabicReply(textToSend, conversationSoFar) {
    const recentHistory = (conversationSoFar || [])
      .slice(-10)
      .map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', text: m.text }));

    const justFetched = await fetchPublicProductsOnly();
    liveDataRef.current = justFetched;
    const { freshProducts } = liveDataRef.current;

    // تصفية البيانات وإرسال الأسماء والأسعار وحالة المخزون فقط
    const catalogSample = freshProducts.slice(0, 30).map(p => ({
      name: p.name,
      price: p.price,
      stock: p.stock
    }));

    try {
      const aiRes = await fetch(ENDPOINTS.customerAiChat, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: textToSend,
          conversationHistory: recentHistory,
          persona: {
            name: 'المساعد الشامل للمتجر',
            styleInstructions: `أنت "المساعد الشامل للمتجر"، خبير تقني ودعم فني متخصص بحل **أي مشكلة عامة** تواجه الزبائن أو تظهر في المتجر (مثل: مشاكل التصفح، الأخطاء التقنية، مشاكل الدفع، شحن الأكواد، أو خطوات استخدام الموقع).
قواعدك الأمنية والصارمة للغاية:
1. احكي باللهجة الأردنية الدارجة الطبيعية وبأسلوب لطيف ومرحب 100%.
2. حل أي مشكلة عامة أو تقنية تواجه المستخدم ديناميكياً من الجذر بخطوات عملية وسهلة.
3. ممنوع تماماً ومن الجذور الوصول لأي معلومات حساسة أو إدارية أو مالية (محظور كلياً معرفة أو ذكر: أعداد المبيعات، الأرباح، التقارير المالية، بيانات الأدمن، أو البيانات الخاصة جداً للعملاء).
4. استخدم معلومات المنتجات العامة فقط في حال تطلب الأمر مساعدة الزيارة أو اختيار البطاقات المناسبة.
5. ممنوع استخدام نجوم الماركداون (**).`,
          },
          taskInstruction: 'حل المشكلة العامة أو التقنية المطروحة ديناميكياً من الجذر بكل احترافية باللهجة الأردنية وبإيموجيز مناسبة.',
          data: {
            // 🛡️ آمن تماماً: لا يرسل سوى بيانات المنتجات العامة
            catalogSample
          },
        }),
      });
      const aiResJson = await aiRes.json().catch(() => ({}));
      return aiResJson?.reply || null;
    } catch (e) {
      return null;
    }
  }

  const handleCustomSend = async (textToSend) => {
    if (!textToSend.trim()) return;

    const currentMessages = chatHistories[currentSessionId] || [];
    const userMsg = { id: 'msg-' + Date.now(), sender: 'user', text: textToSend };
    let updatedChat = [...currentMessages, userMsg];
    
    setChatHistories(prev => ({ ...prev, [currentSessionId]: updatedChat }));
    setLocalInputText('');
    setExternalAiInput('');
    setIsThinking(true);

    try {
      const [aiReply] = await Promise.all([
        generatePerfectArabicReply(textToSend, updatedChat),
        humanTypingDelay(),
      ]);

      setIsThinking(false);
      const finalReply = aiReply || "عذراً يا غالي صار خطأ بسيط بالاتصال، جرب ابعث رسالتك مرة ثانية.";
      pushBotReply(finalReply, updatedChat);

    } catch (error) {
      setIsThinking(false);
      pushBotReply("في خلل مؤقت بالاتصال، حدّث الصفحة وجرب كمان شوي.", updatedChat);
    }
  };

  return (
    <div className="hz-glass-card hz-bot-shell" style={{ '--glow': '#3b82f6', padding: '20px', cursor: 'default', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }} dir="rtl">
      <style>{`
        .hz-glass-card.hz-bot-shell:hover {
          transform: none;
          box-shadow: 0 20px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15);
        }
        .hz-glass-card.hz-bot-shell::before { display: none; }
        .hz-glass-card.hz-bot-shell::after { display: none; }

        .hz-bot-inner-panel {
          background: rgba(10, 15, 30, 0.6);
          backdrop-filter: blur(16px) saturate(180%);
          -webkit-backdrop-filter: blur(16px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
        }

        .hz-bot-bubble-user {
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.25), rgba(59, 130, 246, 0.15));
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(96, 165, 250, 0.3);
          box-shadow: 0 4px 15px rgba(37, 99, 235, 0.1);
        }

        .hz-bot-bubble-bot {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(5, 150, 105, 0.08));
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(52, 211, 153, 0.25);
          box-shadow: 0 4px 15px rgba(16, 185, 129, 0.08);
        }

        .hz-bot-input {
          background: rgba(15, 23, 42, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          transition: all 0.25s ease;
        }
        .hz-bot-input:focus {
          outline: none;
          border-color: rgba(56, 189, 248, 0.6);
          box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.15), inset 0 1px 1px rgba(255,255,255,0.1);
        }

        .hz-bot-send-btn {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
          transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .hz-bot-send-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.6);
          filter: brightness(1.1);
        }
        .hz-bot-send-btn:active { transform: translateY(0) scale(0.96); }

        @keyframes hzTypingBlink {
          0%, 100% { opacity: 0.3; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        .hz-typing-indicator {
          animation: hzTypingBlink 1.4s infinite ease-in-out;
        }

        @keyframes hzLivePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        .hz-live-pulse { animation: hzLivePulse 1.5s ease-in-out infinite; }
      `}</style>

      {/* رأس المحادثة الفاخر */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.4)' }}>
            <span style={{ fontSize: '18px' }}>🤖</span>
            <div
              className={liveMode === 'socket' ? 'hz-live-pulse' : ''}
              title={liveMode === 'socket' ? 'متصل لحظياً عبر Socket.IO' : 'وضع الاحتياط: تحديث دوري'}
              style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '10px', height: '10px', background: '#22c55e', borderRadius: '50%', border: '2px solid #0b0f19', boxShadow: '0 0 8px #22c55e' }}
            ></div>
          </div>
          <div>
            <div style={{ color: '#f8fafc', fontSize: '15px', fontWeight: 'bold', letterSpacing: '0.3px' }}>المساعد الشامل للمتجر</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              جاهز لحل أي مشكلة عامة وتقنية ⚡
            </div>
          </div>
        </div>
        <div style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.08)' }}>
          آمن 100%
        </div>
      </div>

      {/* صندوق رسائل المحادثة */}
      <div ref={chatContainerRef} className="hz-bot-inner-panel" style={{ padding: '16px', height: '390px', overflowY: 'auto', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '14px', scrollBehavior: 'smooth' }}>
        {(!chatHistories[currentSessionId] || chatHistories[currentSessionId].length === 0) ? (
          <div style={{ color: '#64748b', textAlign: 'center', margin: 'auto', fontSize: '13.5px', padding: '20px' }}>
            ✨ واجهتك أي مشكلة عامة أو تقنية بالمتجر؟ اطرحها وراح انحلها معك فوراً.
          </div>
        ) : (
          chatHistories[currentSessionId].map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: isUser ? 'flex-start' : 'flex-end', width: '100%', animation: 'fadeSlideIn 0.3s ease' }}>
                <div className={isUser ? 'hz-bot-bubble-user' : 'hz-bot-bubble-bot'} style={{
                  maxWidth: '85%',
                  color: '#f8fafc',
                  padding: '14px 18px',
                  borderRadius: isUser ? '18px 18px 18px 4px' : '18px 18px 4px 18px',
                  fontSize: '13.5px',
                  lineHeight: '1.75',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-line'
                }}>
                  <div style={{ fontSize: '10.5px', color: isUser ? '#93c5fd' : '#34d399', marginBottom: '6px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>{isUser ? 'أنت 👤' : 'المساعد الشامل 🛡️'}</span>
                  </div>
                  {msg.text}
                </div>
              </div>
            );
          })
        )}

        {isThinking && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', animation: 'fadeSlideIn 0.2s ease' }}>
            <div className="hz-bot-bubble-bot hz-typing-indicator" style={{ padding: '10px 16px', borderRadius: '12px', color: '#34d399', fontSize: '12.5px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>المساعد الشامل يحل المشكلة العامة</span>
              <span style={{ display: 'flex', gap: '3px' }}>
                <span style={{ animation: 'hzTypingBlink 1s infinite 0s' }}>.</span>
                <span style={{ animation: 'hzTypingBlink 1s infinite 0.2s' }}>.</span>
                <span style={{ animation: 'hzTypingBlink 1s infinite 0.4s' }}>.</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* صندوق الإدخال */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="اكتب مشكلتك العامة أو التقنية هنا..."
          value={localInputText}
          onChange={(e) => setLocalInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCustomSend(localInputText)}
          className="hz-bot-input"
          style={{ padding: '13px 18px', borderRadius: '14px', color: '#fff', flex: 1, fontSize: '13.5px', ...inputStyle }}
        />
        <button
          type="button"
          onClick={() => handleCustomSend(localInputText)}
          className="hz-bot-send-btn"
          style={{ color: '#fff', padding: '0 24px', height: '48px', borderRadius: '14px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <span>حل المشكلة</span>
          <span>🚀</span>
        </button>
      </div>
    </div>
  );
}

export default HamzaStoreBoot;