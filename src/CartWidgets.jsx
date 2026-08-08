import React, { useState, useEffect, useRef } from 'react';

const glassBtn = {
  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02))',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
};

export function HeaderControls({ authCart, onOpenDashboard }) {
  const safeAuthCart = authCart && typeof authCart === 'object' ? authCart : {};
  const {
    currentUser = null,
    isStaffUser = false,
    userRoleInfo = { label: 'ضيف', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: '#64748b' },
    cart = [],
    removeFromCart = () => {},
    totalPrice = 0,
    totalItemsCount = 0,
    showCartDropdown = false,
    setShowCartDropdown = () => {},
    setShowLoginPage = () => {},
    handleLogout = () => {},
    handleInitiateCheckout = () => {},
  } = safeAuthCart;

  const safeCart = Array.isArray(cart) ? cart : [];
  const safeUserRoleInfo = userRoleInfo && typeof userRoleInfo === 'object' ? userRoleInfo : { label: 'ضيف', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: '#64748b' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', flexWrap: 'wrap' }}>

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setShowCartDropdown(!showCartDropdown)}
          style={{ ...glassBtn, color: '#38bdf8', padding: '10px 18px', borderRadius: '14px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          className="hz-admin-btn"
        >
          🛒 السلة <span style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)', color: '#fff', fontSize: '11px', padding: '2px 8px', borderRadius: '50%', boxShadow: '0 0 10px rgba(2, 132, 199, 0.5)' }}>{Number(totalItemsCount) || 0}</span>
        </button>

        {showCartDropdown && (
          <div style={{ position: 'absolute', left: '0', top: '55px', width: '320px', background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(56,189,248,0.4)', borderRadius: '18px', padding: '16px', zIndex: 100, boxShadow: '0 25px 50px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.15)' }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#38bdf8', fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>محتويات سلة المشتريات</h4>

            {safeCart.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '12px', margin: '15px 0', textAlign: 'center' }}>السلة فارغة حالياً.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {safeCart.map((item, idx) => {
                  if (!item || typeof item !== 'object') return null;
                  const itemId = item.id || item._id || idx;
                  const itemName = String(item.name || 'منتج');
                  const itemQty = Number(item.quantity) || 1;
                  const itemPrice = Number(item.price) || 0;

                  return (
                    <div key={itemId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(11,15,25,0.7)', border: '1px solid rgba(255,255,255,0.06)', padding: '10px', borderRadius: '10px', fontSize: '12px' }}>
                      <span style={{ color: '#f8fafc' }}>{itemName} (×{itemQty})</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#facc15', fontWeight: 'bold' }}>{itemPrice * itemQty} دينار</span>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id || item._id)}
                          className="hz-cart-remove-btn"
                          style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', border: 'none', width: '22px', height: '22px', borderRadius: '6px', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(239, 68, 68, 0.4)' }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold', fontSize: '13px' }}>
                  <span style={{ color: '#f8fafc' }}>الإجمالي: <span style={{ color: '#facc15' }}>{Number(totalPrice) || 0} دينار</span></span>
                  <button
                    type="button"
                    onClick={() => { setShowCartDropdown(false); handleInitiateCheckout(); }}
                    className="hz-checkout-btn"
                    style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)' }}
                  >
                    إتمام الشراء
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {currentUser ? (
        <div style={{ ...glassBtn, display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 14px', borderRadius: '14px' }}>
          <span style={{ fontSize: '13px', color: '#38bdf8', fontWeight: 'bold', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{String(currentUser.name || currentUser.email || 'مستخدم')}</span>
          <span style={{
            fontSize: '10px',
            color: safeUserRoleInfo.color || '#94a3b8',
            background: safeUserRoleInfo.bg || 'rgba(148,163,184,0.15)',
            border: `1px solid ${safeUserRoleInfo.border || '#64748b'}`,
            padding: '2px 8px',
            borderRadius: '999px',
            fontWeight: 'bold'
          }}>
            الحالة: {safeUserRoleInfo.label || 'ضيف'}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="hz-logout-btn"
            style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.9), rgba(220,38,38,0.9))', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)' }}
          >
            تسجيل الخروج 🚪
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            fontSize: '10px',
            color: safeUserRoleInfo.color || '#94a3b8',
            background: safeUserRoleInfo.bg || 'rgba(148,163,184,0.15)',
            border: `1px solid ${safeUserRoleInfo.border || '#64748b'}`,
            padding: '3px 10px',
            borderRadius: '999px',
            fontWeight: 'bold'
          }}>
            الحالة: {safeUserRoleInfo.label || 'ضيف'}
          </span>
          <button
            type="button"
            onClick={() => setShowLoginPage(true)}
            style={{ ...glassBtn, color: '#fff', padding: '10px 18px', borderRadius: '14px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}
            className="hz-admin-btn"
          >
            تسجيل الدخول 👤
          </button>
        </div>
      )}

      {isStaffUser && typeof onOpenDashboard === 'function' && (
        <button
          type="button"
          onClick={onOpenDashboard}
          style={{ ...glassBtn, color: '#c4b5fd', padding: '10px 18px', borderRadius: '14px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 20px rgba(124, 58, 237, 0.4)' }}
          className="hz-admin-btn"
        >
          لوحة التحكم ⚙️
        </button>
      )}
    </div>
  );
}

export function CheckoutForm({ authCart, inputStyle = {} }) {
  const safeAuthCart = authCart && typeof authCart === 'object' ? authCart : {};
  const {
    checkoutMode = false,
    currentUser = null,
    cart = [],
    updateCartItemPlayerId = () => {},
    totalPrice = 0,
    submittingCheckout = false,
    handleCheckout = () => {},
    setCheckoutMode = () => {}
  } = safeAuthCart;

  if (!checkoutMode) return null;

  const safeCart = Array.isArray(cart) ? cart : [];

  return (
    <form onSubmit={handleCheckout} style={{ background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(11, 15, 25, 0.95))', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: '25px', borderRadius: '20px', border: '1px solid rgba(16, 185, 129, 0.4)', marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '18px', boxShadow: '0 25px 50px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', border: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontSize: '22px', fontWeight: 'bold', boxShadow: '0 0 15px rgba(16, 185, 129, 0.3)' }}>+</div>
        <div>
          <h3 style={{ margin: '0 0 4px 0', color: '#34d399', fontSize: '18px', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>🧾 مراجعة الطلب وتأكيد التسليم الرقمي</h3>
          <p style={{ margin: '0', color: '#94a3b8', fontSize: '13px' }}>
            التسليم رقمي بالكامل عبر البريد: <span style={{ color: '#38bdf8' }}>{String(currentUser?.email || 'غير متوفر')}</span>
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {safeCart.map((item, idx) => {
          const itemId = item.id || item._id || idx;
          return (
            <div key={itemId} style={{ background: 'rgba(11, 15, 25, 0.75)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: '#f8fafc', fontWeight: 'bold' }}>{item.name} (×{item.quantity})</span>
                <span style={{ color: '#facc15', fontWeight: 'bold' }}>{(item.price || 0) * (item.quantity || 1)} دينار</span>
              </div>

              {item.deliveryType === 'id_topup' && (
                <input
                  type="text"
                  placeholder="أدخل آيدي اللاعب لهذا المنتج..."
                  value={item.playerId || ''}
                  onChange={(e) => updateCartItemPlayerId(itemId, e.target.value)}
                  required
                  style={{ background: '#0b0f19', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', outline: 'none', ...(inputStyle || {}) }}
                />
              )}

              {(item.deliveryType === 'code' || item.deliveryType === 'subscription') && (
                <span style={{ color: '#38bdf8', fontSize: '12px' }}>📦 كود جاهز — يُسلَّم فوراً بعد التأكيد</span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '15px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}>
        <span style={{ color: '#f8fafc' }}>الإجمالي</span>
        <span style={{ color: '#facc15', fontSize: '18px' }}>{totalPrice} دينار</span>
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <button type="submit" disabled={submittingCheckout} className="hz-checkout-btn" style={{ flex: 1, background: submittingCheckout ? '#065f46' : 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', padding: '14px', borderRadius: '12px', cursor: submittingCheckout ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '15px', boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)' }}>
          {submittingCheckout ? 'جاري تأكيد الطلب...' : 'تأكيد الطلب والتسليم الرقمي 🛒'}
        </button>
        <button type="button" onClick={() => setCheckoutMode(false)} className="hz-cancel-btn" style={{ background: 'linear-gradient(135deg, #4b5563, #374151)', color: '#fff', border: 'none', padding: '14px 22px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

export function OrderConfirmation({ authCart }) {
  const safeAuthCart = authCart && typeof authCart === 'object' ? authCart : {};
  const { lastOrder = null, setLastOrder = () => {} } = safeAuthCart;

  if (!lastOrder) return null;

  const items = Array.isArray(lastOrder.items) ? lastOrder.items : [];

  return (
    <div style={{ background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(11, 15, 25, 0.98))', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: '25px', borderRadius: '20px', border: '1px solid rgba(16, 185, 129, 0.5)', marginBottom: '25px', boxShadow: '0 25px 50px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.15)' }}>
      <h3 style={{ margin: '0 0 6px 0', color: '#34d399', fontSize: '18px', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>✅ تم تأكيد طلبك بنجاح</h3>
      <p style={{ margin: '0 0 18px 0', color: '#94a3b8', fontSize: '14px' }}>الإجمالي: <span style={{ color: '#facc15', fontWeight: 'bold', fontSize: '16px' }}>{lastOrder.totalAmount} دينار</span></p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ background: 'rgba(11, 15, 25, 0.75)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '14px' }}>
            <div style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>{item.name} (×{item.quantity})</div>

            {item.playerId && (
              <div style={{ color: '#38bdf8', fontSize: '13px' }}>🆔 تمت تعبئة الآيدي: {item.playerId}</div>
            )}

            {Array.isArray(item.deliveredCodes) && item.deliveredCodes.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {item.deliveredCodes.map((code, cIdx) => (
                  <code key={cIdx} style={{ background: '#020617', border: '1px solid rgba(52, 211, 153, 0.3)', color: '#34d399', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', letterSpacing: '1px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}>{code}</code>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <p style={{ color: '#94a3b8', fontSize: '13px', margin: '0 0 16px 0' }}>تم إرسال نسخة من هذه التفاصيل إلى بريدك الإلكتروني أيضاً.</p>

      <button type="button" onClick={() => setLastOrder(null)} className="hz-continue-btn" style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 6px 20px rgba(37, 99, 235, 0.4)' }}>
        متابعة التسوق
      </button>
    </div>
  );
}

export function EmailVerificationBanner({ authCart }) {
  const safeAuthCart = authCart && typeof authCart === 'object' ? authCart : {};
  const { currentUser = null, handleResendVerification = () => {}, resendVerificationSubmitting = false } = safeAuthCart;
  const [sent, setSent] = useState(false);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  if (!currentUser || currentUser.emailVerified !== false) return null;

  const resend = async () => {
    if (!currentUser.email || typeof handleResendVerification !== 'function') return;
    const res = await handleResendVerification(currentUser.email);
    if (res && res.success && isMounted.current) {
      setSent(true);
    }
  };

  return (
    <div style={{ background: 'linear-gradient(135deg, rgba(51, 42, 26, 0.9), rgba(30, 24, 15, 0.95))', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#fcd34d', padding: '14px 20px', borderRadius: '14px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', fontSize: '13px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
      <span>⚠️ حسابك غير مفعّل بعد. تحقق من بريدك الإلكتروني لتفعيله.</span>
      {sent ? (
        <span style={{ color: '#a7f3d0', fontWeight: 'bold' }}>تم إرسال الرابط ✅</span>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={resendVerificationSubmitting}
          className="hz-resend-btn"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000', border: 'none', padding: '8px 16px', borderRadius: '10px', cursor: resendVerificationSubmitting ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '12px', boxShadow: '0 4px 15px rgba(245, 158, 11, 0.4)' }}
        >
          {resendVerificationSubmitting ? 'جاري الإرسال...' : 'إعادة إرسال رابط التفعيل'}
        </button>
      )}
    </div>
  );
}