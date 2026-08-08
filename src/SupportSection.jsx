import React, { useState, useEffect, useCallback, useRef } from 'react';
import HamzaStoreBoot from './HamzaStoreBoot';

const isValidEmail = (email) => {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

const isValidPhone = (phone) => {
  if (typeof phone !== 'string') return false;
  return /^[0-9+\s-]{7,15}$/.test(phone.trim());
};

const seenStorageKey = (email) => `hz_support_seen_${(email || 'guest').toLowerCase()}`;
const replyFingerprint = (item) => `${item.id || item._id}:${(item.reply || '').length}`;

const glassPanel = {
  background: 'rgba(255,255,255,0.05)',
  backdropFilter: 'blur(18px) saturate(140%)',
  WebkitBackdropFilter: 'blur(18px) saturate(140%)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '18px',
  padding: '22px'
};

// ============================================================
// تصميم كاردات "الأرضية العاكسة" — بادج أيقونة عائم فوق حافة
// الكارد + انعكاس خافت تحته، مستوحى من مرجع التصميم اللي طلبه
// المستخدم. مُعرّف محلياً هون فقط عشان ما يأثر على كاردات لوحة
// التحكم الإدارية بمكان تاني بالتطبيق.
// ============================================================
const SUPPORT_CARD_STYLE = `
  .hz-support-grid { padding-top: 34px; }
  .hz-support-card-wrap {
    position: relative;
  }
  .hz-support-card-wrap .hz-glass-card {
    padding-top: 30px !important;
    text-align: center;
    height: 100%;
  }
  .hz-support-badge {
    position: absolute;
    top: -26px;
    left: 50%;
    transform: translateX(-50%);
    width: 56px;
    height: 56px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 25px;
    background: linear-gradient(160deg, rgba(255,255,255,0.22), rgba(255,255,255,0.04));
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.32);
    box-shadow: 0 10px 24px var(--glow), inset 0 1px 0 rgba(255,255,255,0.35);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    z-index: 2;
  }
  .hz-support-card-wrap:hover .hz-support-badge {
    transform: translateX(-50%) translateY(-4px) scale(1.06);
    box-shadow: 0 16px 32px var(--glow), inset 0 1px 0 rgba(255,255,255,0.4);
  }
  .hz-support-reflection {
    position: absolute;
    left: 14%;
    right: 14%;
    bottom: -18px;
    height: 26px;
    background: radial-gradient(ellipse at center, var(--glow), transparent 75%);
    filter: blur(10px);
    opacity: 0.22;
    transform: scaleY(-1);
    pointer-events: none;
    transition: opacity 0.3s ease;
    z-index: 0;
  }
  .hz-support-card-wrap:hover .hz-support-reflection { opacity: 0.45; }
`;

export default function SupportSection({ api, currentUser, inputStyle = {} }) {
  const [activeApp, setActiveApp] = useState(null); // null | 'bot' | 'messages' | 'send' | 'track'

  const [supportName, setSupportName] = useState(() => {
    try { return (currentUser && (currentUser.name || currentUser.email)) || ''; } catch (e) { return ''; }
  });
  const [supportEmail, setSupportEmail] = useState(() => {
    try { return (currentUser && currentUser.email) || ''; } catch (e) { return ''; }
  });
  const [supportPhone, setSupportPhone] = useState('');
  const [supportLocation, setSupportLocation] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportSubmitted, setSupportSubmitted] = useState(false);

  const [trackingResults, setTrackingResults] = useState([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState(null);

  const [seenSet, setSeenSet] = useState(() => {
    try {
      const email = currentUser && currentUser.email;
      const raw = localStorage.getItem(seenStorageKey(email));
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) { return new Set(); }
  });

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const fetchCustomerTickets = useCallback(async (email) => {
    if (!email || typeof email !== 'string' || !email.trim()) return;
    if (!api || typeof api.get !== 'function') return;

    if (isMounted.current) setTrackingLoading(true);
    const cleanEmail = email.trim().toLowerCase();

    try {
      const res = await api.get('/support/customer', { params: { email: cleanEmail } });
      const responseData = res && res.data;
      const list = Array.isArray(responseData) ? responseData : [];
      if (isMounted.current) setTrackingResults(list);
    } catch (err) {
      if (isMounted.current) setTrackingResults([]);
    } finally {
      if (isMounted.current) setTrackingLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (currentUser && typeof currentUser === 'object' && currentUser.email) {
      const safeEmail = String(currentUser.email).trim();
      const safeName = String(currentUser.name || currentUser.email || '').trim();
      setSupportEmail(safeEmail);
      setSupportName(safeName);
      fetchCustomerTickets(safeEmail);
    }
  }, [currentUser, fetchCustomerTickets]);

  const persistSeenSet = (set) => {
    try {
      const email = currentUser && currentUser.email;
      localStorage.setItem(seenStorageKey(email), JSON.stringify(Array.from(set)));
    } catch (e) {}
  };

  const markRepliesAsSeen = () => {
    const next = new Set(seenSet);
    trackingResults.forEach(item => {
      if (item && item.reply) next.add(replyFingerprint(item));
    });
    setSeenSet(next);
    persistSeenSet(next);
  };

  const hasUnseenReply = trackingResults.some(item => item && item.reply && !seenSet.has(replyFingerprint(item)));

  const handleSupportSubmit = async (e) => {
    e.preventDefault();
    const safeName = typeof supportName === 'string' ? supportName.trim() : '';
    const safeMessage = typeof supportMessage === 'string' ? supportMessage.trim() : '';
    const safeEmail = typeof supportEmail === 'string' ? supportEmail.trim() : '';
    const safePhone = typeof supportPhone === 'string' ? supportPhone.trim() : '';
    const safeLocation = typeof supportLocation === 'string' ? supportLocation.trim() : '';
    const currentUserEmail = currentUser && currentUser.email ? String(currentUser.email).trim() : '';

    if (!safeName || !safeMessage) {
      alert('⚠️ يرجى إدخال الاسم وتفاصيل الشكوى كحد أدنى.');
      return;
    }
    if (safeEmail && !isValidEmail(safeEmail)) {
      alert('⚠️ البريد الإلكتروني المدخل غير صحيح.');
      return;
    }
    if (safePhone && !isValidPhone(safePhone)) {
      alert('⚠️ يرجى إدخال رقم هاتف صحيح ومكون من أرقام صالحة.');
      return;
    }
    if (!api || typeof api.post !== 'function') {
      alert('⚠️ عذراً، خدمة الاتصال بالخادم غير متاحة حالياً.');
      return;
    }

    if (isMounted.current) setSupportSubmitting(true);

    try {
      await api.post('/support', {
        customerName: safeName,
        customerEmail: safeEmail || currentUserEmail || 'غير متوفر',
        phone: safePhone || 'غير متوفر',
        location: safeLocation || 'متجر الألعاب الرقمية',
        issue: safeMessage
      });

      if (isMounted.current) {
        setSupportMessage('');
        setSupportPhone('');
        setSupportLocation('');
        setSupportSubmitted(true);
      }
      if (currentUserEmail) fetchCustomerTickets(currentUserEmail);

      setTimeout(() => {
        if (isMounted.current) setSupportSubmitted(false);
      }, 4000);
    } catch (err) {
      const errorMsg = err && err.response && err.response.data && err.response.data.error;
      alert(errorMsg || 'فشل إرسال البلاغ إلى خادم الدعم الفني.');
    } finally {
      if (isMounted.current) setSupportSubmitting(false);
    }
  };

  const safeTrackingResults = Array.isArray(trackingResults) ? trackingResults : [];
  const safeCurrentUser = currentUser && typeof currentUser === 'object' ? currentUser : null;
  const repliedResults = safeTrackingResults.filter(item => item && item.reply);

  if (!activeApp) {
    const cards = [
      { id: 'bot', icon: '🤖', title: 'روبوت خدمة المتجر', desc: 'دردش مع الروبوت واسأله عن المنتجات والطلبات قدر ما بدك', color: '#10b981', badge: false },
      { id: 'messages', icon: '💬', title: 'الرسائل والردود', desc: 'شوف رد الروبوت أو المدير أو الموظف على شكاويك', color: '#38bdf8', badge: hasUnseenReply },
      { id: 'send', icon: '📝', title: 'إرسال شكوى جديدة', desc: 'ابعت بلاغ أو مشكلة جديدة لفريق الدعم', color: '#f59e0b', badge: false },
      { id: 'track', icon: '📍', title: 'تتبع حالة الشكوى', desc: 'شوف حالة كل شكوى بعتها (قيد المراجعة / تم الرد)', color: '#a855f7', badge: false }
    ];

    return (
      <div style={{ marginBottom: '25px' }}>
        <style>{SUPPORT_CARD_STYLE}</style>
        <h3 style={{ margin: '0 0 16px 0', color: '#f8fafc', fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          🎧 خدمة العملاء
        </h3>
        <div className="hz-support-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '34px' }}>
          {cards.map(card => (
            <div
              key={card.id}
              className="hz-support-card-wrap"
              style={{ '--glow': card.color, cursor: 'pointer' }}
              onClick={() => {
                setActiveApp(card.id);
                if (card.id === 'messages') markRepliesAsSeen();
              }}
            >
              <div className="hz-support-badge">{card.icon}</div>
              <div className="hz-glass-card">
                {card.badge && <span className="hz-unread-dot" />}
                <h4 style={{ margin: '0 0 6px 0', color: '#f8fafc', fontSize: '15px', fontWeight: 'bold' }}>{card.title}</h4>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px', lineHeight: '1.5' }}>{card.desc}</p>
              </div>
              <div className="hz-support-reflection" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activeApp === 'bot') {
    return (
      <div style={{ marginBottom: '25px' }}>
        <BackButton onClick={() => setActiveApp(null)} title="روبوت خدمة المتجر" icon="🤖" />
        <HamzaStoreBoot inputStyle={inputStyle} />
      </div>
    );
  }

  if (activeApp === 'messages') {
    return (
      <div style={{ marginBottom: '25px' }}>
        <BackButton onClick={() => setActiveApp(null)} title="الرسائل والردود" icon="💬" />
        {!safeCurrentUser ? (
          <GuestPrompt />
        ) : trackingLoading ? (
          <LoadingText text="⏳ جاري جلب الرسائل..." />
        ) : repliedResults.length === 0 ? (
          <EmptyGlassBox text="ما فيه أي ردود عليك لهلق. لما يرد فريق الدعم على شكوى، رح يظهر هون." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {repliedResults.map((item, idx) => {
              const ticketId = item.id || item._id || idx;
              return (
                <div key={ticketId} style={glassPanel}>
                  <p style={{ margin: '0 0 8px 0', color: '#94a3b8', fontSize: '12px' }}>
                    شكواك: <span style={{ color: '#f8fafc' }}>{item.issue || item.message || 'بدون تفاصيل'}</span>
                  </p>
                  <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '12px', padding: '12px 14px' }}>
                    <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>🤖 الرد:</span>
                    <span style={{ fontSize: '13px', color: '#fff', lineHeight: '1.6' }}>{item.reply}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (activeApp === 'send') {
    return (
      <div style={{ marginBottom: '25px' }}>
        <BackButton onClick={() => setActiveApp(null)} title="إرسال شكوى جديدة" icon="📝" />
        <div style={glassPanel}>
          {supportSubmitted ? (
            <div style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '14px', borderRadius: '12px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>
              ✅ تم إرسال البلاغ إلى الخادم بنجاح!
            </div>
          ) : (
            <form onSubmit={handleSupportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <input type="text" placeholder="اسم العميل..." value={supportName} onChange={(e) => setSupportName(e.target ? e.target.value : '')} required
                  style={{ background: 'rgba(11,15,25,0.6)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...(inputStyle || {}) }} />
                <input type="text" placeholder="البريد الإلكتروني..." value={supportEmail} onChange={(e) => setSupportEmail(e.target ? e.target.value : '')}
                  style={{ background: 'rgba(11,15,25,0.6)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...(inputStyle || {}) }} />
                <input type="text" placeholder="رقم الهاتف (اختياري)..." value={supportPhone} onChange={(e) => setSupportPhone(e.target ? e.target.value : '')}
                  style={{ background: 'rgba(11,15,25,0.6)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...(inputStyle || {}) }} />
                <input type="text" placeholder="الموقع أو القسم (اختياري)..." value={supportLocation} onChange={(e) => setSupportLocation(e.target ? e.target.value : '')}
                  style={{ background: 'rgba(11,15,25,0.6)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...(inputStyle || {}) }} />
              </div>
              <textarea rows="4" placeholder="اكتب تفاصيل الشكوى أو المشكلة هنا..." value={supportMessage} onChange={(e) => setSupportMessage(e.target ? e.target.value : '')} required
                style={{ background: 'rgba(11,15,25,0.6)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', resize: 'vertical', ...(inputStyle || {}) }} />
              <button type="submit" disabled={supportSubmitting}
                style={{ background: supportSubmitting ? '#b45309' : '#f59e0b', color: '#111827', border: 'none', padding: '12px 20px', borderRadius: '10px', cursor: supportSubmitting ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px', alignSelf: 'flex-start' }}>
                {supportSubmitting ? 'جارٍ الإرسال...' : 'إرسال البلاغ 🚀'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (activeApp === 'track') {
    return (
      <div style={{ marginBottom: '25px' }}>
        <BackButton onClick={() => setActiveApp(null)} title="تتبع حالة الشكوى" icon="📍" />
        {!safeCurrentUser ? (
          <GuestPrompt />
        ) : trackingLoading ? (
          <LoadingText text="⏳ جاري جلب حالة الشكاوى..." />
        ) : safeTrackingResults.length === 0 ? (
          <EmptyGlassBox text="لا توجد لديك أي شكاوى مسجلة حالياً." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
            {safeTrackingResults.map((item, idx) => {
              const ticketId = item.id || item._id || idx;
              const hasReplied = Boolean(item.reply || item.status === 'resolved' || item.isResolved);
              const isExpanded = expandedCardId === ticketId;
              return (
                <div key={ticketId} style={{ ...glassPanel, cursor: 'pointer' }} onClick={() => setExpandedCardId(isExpanded ? null : ticketId)}>
                  <span style={{
                    background: hasReplied ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                    color: hasReplied ? '#34d399' : '#fcd34d',
                    padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 'bold'
                  }}>
                    {hasReplied ? '✅ تم الرد' : '⏳ قيد المراجعة'}
                  </span>
                  <p style={{ margin: '10px 0 0 0', color: '#f8fafc', fontSize: '13px', lineHeight: '1.4' }}>
                    {item.issue || item.message || 'بدون تفاصيل'}
                  </p>
                  {isExpanded && (
                    <p style={{ margin: '10px 0 0 0', color: '#64748b', fontSize: '11px' }}>
                      📅 {item.date ? new Date(item.date).toLocaleString('ar-JO') : ''}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function BackButton({ onClick, title, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
      <button type="button" onClick={onClick} className="hz-glass-btn" style={{ color: '#fff', padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>← رجوع</button>
      <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '16px', fontWeight: 'bold' }}>{icon} {title}</h3>
    </div>
  );
}

function GuestPrompt() {
  return <div style={{ ...glassPanel, textAlign: 'center', color: '#f59e0b' }}>⚠️ يرجى تسجيل الدخول لعرض هذا القسم.</div>;
}

function LoadingText({ text }) {
  return <p style={{ color: '#9ca3af', textAlign: 'center', padding: '20px' }}>{text}</p>;
}

function EmptyGlassBox({ text }) {
  return <div style={{ ...glassPanel, textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>{text}</div>;
}
