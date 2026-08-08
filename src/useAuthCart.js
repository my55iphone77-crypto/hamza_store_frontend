import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from './app/AppContext';

export function useAuthCart({ api, fetchProducts, searchTerm, setError }) {
  const appData = useApp() || {};
  const {
    currentUser = null, setCurrentUser = () => {}, token = '', setToken = () => {},
    showLoginPage = false, setShowLoginPage = () => {},
    loginSubmitting = false, loginError = '', setLoginError = () => {},
    handleLoginSubmit = () => {}, handleSocialLogin = () => {},
    pendingTwoFactor = null, setPendingTwoFactor = () => {}, twoFactorSubmitting = false, handleVerifyTwoFactorLogin = () => {},
    showForgotPassword = false, setShowForgotPassword = () => {},
    forgotPasswordSubmitting = false, forgotPasswordSent = false, setForgotPasswordSent = () => {},
    handleForgotPasswordRequest = () => {}, handleResetPassword = () => {}, resetPasswordSubmitting = false,
  } = appData;

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const isAdminUser = Boolean(currentUser && (currentUser.isOwner || currentUser.role === 'owner'));
  const isStaffUser = Boolean(currentUser && (
    ['owner', 'admin', 'employee'].includes(currentUser.role) || currentUser.isOwner === true
  ));

  const userRoleInfo = (() => {
    if (!currentUser) return { label: 'ضيف', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: '#64748b' };
    if (currentUser.isOwner === true || currentUser.role === 'owner' || currentUser.role === 'admin') {
      return { label: 'مدير', color: '#fca5a5', bg: 'rgba(239,68,68,0.15)', border: '#ef4444' };
    }
    if (currentUser.role === 'employee') {
      return { label: 'موظف', color: '#c4b5fd', bg: 'rgba(124,58,237,0.15)', border: '#7c3aed' };
    }
    return { label: 'عميل', color: '#38bdf8', bg: 'rgba(56,189,248,0.15)', border: '#0284c7' };
  })();

  const [cart, setCart] = useState(() => {
    try {
      const savedCart = localStorage.getItem('hamza_cart');
      const parsed = savedCart ? JSON.parse(savedCart) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  });

  const [showCartDropdown, setShowCartDropdown] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState(false);
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [resendVerificationSubmitting, setResendVerificationSubmitting] = useState(false);
  // 🆕 آخر طلب ناجح — لعرض شاشة التأكيد (المنتجات + الأكواد المسلَّمة)
  const [lastOrder, setLastOrder] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem('hamza_cart', JSON.stringify(cart));
    } catch (e) {}
  }, [cart]);

  const addToCart = (product) => {
    if (!product || typeof product !== 'object') return;
    const stockCount = typeof product.stock === 'number' ? product.stock : 0;
    if (stockCount <= 0) {
      alert('⚠️ عذراً، هذا المنتج نفد من المخزون حالياً.');
      return;
    }
    const prodId = product.id || product._id;
    if (!prodId) return;

    setCart(prevCart => {
      const safePrevCart = Array.isArray(prevCart) ? prevCart : [];
      const existing = safePrevCart.find(item => item && (item.id === prodId || item._id === prodId));
      if (existing) {
        const currentQty = typeof existing.quantity === 'number' ? existing.quantity : 1;
        if (currentQty >= stockCount) {
          alert('⚠️ لقد وصلت للحد الأقصى المتوفر في المخزون لهذا المنتج.');
          return safePrevCart;
        }
        return safePrevCart.map(item =>
          item && (item.id === prodId || item._id === prodId) ? { ...item, quantity: currentQty + 1 } : item
        );
      }
      // 🆕 نحتفظ بـ deliveryType بالعنصر ونضيف playerId فاضي لو النوع id_topup
      return [...safePrevCart, { ...product, id: prodId, quantity: 1, playerId: '' }];
    });
  };

  const removeFromCart = (id) => {
    if (!id) return;
    setCart(prev => (Array.isArray(prev) ? prev.filter(item => item && item.id !== id && item._id !== id) : []));
  };

  // 🆕 تحديث آيدي اللاعب لعنصر معيّن بالسلة (لمنتجات تعبئة الآيدي فقط)
  const updateCartItemPlayerId = (id, playerId) => {
    if (!id) return;
    setCart(prev => (Array.isArray(prev)
      ? prev.map(item => (item && (item.id === id || item._id === id)) ? { ...item, playerId } : item)
      : []));
  };

  const safeCart = Array.isArray(cart) ? cart : [];
  const totalPrice = safeCart.reduce((sum, item) => sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 1), 0);
  const totalItemsCount = safeCart.reduce((acc, item) => acc + (Number(item?.quantity) || 1), 0);

  // 🆕 هل بالسلة منتج بيحتاج آيدي لاعب؟
  const requiresPlayerId = safeCart.some(item => item && item.deliveryType === 'id_topup');

  const handleInitiateCheckout = () => {
    if (safeCart.length === 0) {
      alert("⚠️ السلة فارغة.");
      return;
    }
    if (!currentUser) {
      setShowLoginPage(true);
      return;
    }
    setLastOrder(null);
    setCheckoutMode(true);
  };

  useEffect(() => {
    if (currentUser && !showLoginPage && safeCart.length > 0 && !checkoutMode && !lastOrder) {
      setCheckoutMode(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, showLoginPage, safeCart.length]);

  const handleCheckout = useCallback(async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (!currentUser) {
      setShowLoginPage(true);
      return;
    }

    // 🆕 تحقق: كل منتج تعبئة آيدي لازم يكون له آيدي مُدخَل
    const missingPlayerId = safeCart.find(item => item && item.deliveryType === 'id_topup' && !String(item.playerId || '').trim());
    if (missingPlayerId) {
      alert(`⚠️ يرجى إدخال آيدي اللاعب لمنتج "${missingPlayerId.name}".`);
      return;
    }

    if (!api || typeof api.post !== 'function') {
      if (typeof setError === 'function') {
        setError('⚠️ خدمة الاتصال بالخادم غير متاحة.');
      }
      return;
    }

    if (isMounted.current) setSubmittingCheckout(true);
    if (typeof setError === 'function') setError('');

    try {
      const response = await api.post('/orders', {
        customerName: currentUser.name || currentUser.email || 'عميل',
        customerEmail: currentUser.email || 'غير متوفر',
        items: safeCart.map(item => ({
          id: item.id || item._id,
          name: item.name || 'منتج',
          price: item.price || 0,
          quantity: item.quantity || 1,
          playerId: item.deliveryType === 'id_topup' ? String(item.playerId || '').trim() : undefined
        })),
        totalAmount: totalPrice
      });

      if (isMounted.current) {
        setLastOrder(response?.data?.order || null); // 🆕 لعرض شاشة التأكيد
        setCart([]);
        try { localStorage.removeItem('hamza_cart'); } catch (err) {}
        setCheckoutMode(false);
        setShowCartDropdown(false);
      }

      if (typeof fetchProducts === 'function') {
        fetchProducts(typeof searchTerm === 'string' ? searchTerm : '');
      }
    } catch (err) {
      const errorMsg = err && err.response && err.response.data && err.response.data.error;
      if (isMounted.current && typeof setError === 'function') {
        setError(errorMsg || 'فشل إتمام عملية الشراء عبر الخادم.');
      }
    } finally {
      if (isMounted.current) setSubmittingCheckout(false);
    }
  }, [api, safeCart, currentUser, totalPrice, fetchProducts, searchTerm, setError, setShowLoginPage]);

  const handleLogout = useCallback(() => {
    setCart([]);
    try { localStorage.removeItem('hamza_cart'); } catch (e) {}
    setCurrentUser(null);
    setToken('');
    ['user', 'token', 'hamza_user', 'hamza_token'].forEach((key) => {
      try { localStorage.removeItem(key); } catch (e) {}
    });
    alert('تم تسجيل الخروج بنجاح.');
  }, [setCurrentUser, setToken]);

  const handleResendVerification = useCallback(async (email) => {
    if (!email || typeof email !== 'string' || !email.trim()) {
      return { success: false, error: 'البريد الإلكتروني مطلوب.' };
    }
    if (!api || typeof api.post !== 'function') {
      return { success: false, error: 'خدمة الاتصال غير متاحة.' };
    }
    if (isMounted.current) setResendVerificationSubmitting(true);
    try {
      await api.post('/auth/resend-verification', { email: email.trim() });
      return { success: true };
    } catch (err) {
      const errorMsg = err && err.response && err.response.data && err.response.data.error;
      return { success: false, error: errorMsg || 'حدث خطأ.' };
    } finally {
      if (isMounted.current) setResendVerificationSubmitting(false);
    }
  }, [api]);

  return {
    currentUser, isAdminUser, isStaffUser, userRoleInfo,
    cart, setCart, addToCart, removeFromCart, updateCartItemPlayerId, requiresPlayerId,
    totalPrice, totalItemsCount,
    showCartDropdown, setShowCartDropdown,
    checkoutMode, setCheckoutMode,
    submittingCheckout, lastOrder, setLastOrder,
    showLoginPage, setShowLoginPage,
    handleInitiateCheckout, handleCheckout, handleLogout,
    loginSubmitting, loginError, setLoginError,
    handleLoginSubmit, handleSocialLogin,
    pendingTwoFactor, setPendingTwoFactor, twoFactorSubmitting, handleVerifyTwoFactorLogin,
    showForgotPassword, setShowForgotPassword,
    forgotPasswordSubmitting, forgotPasswordSent, setForgotPasswordSent,
    handleForgotPasswordRequest, handleResetPassword, resetPasswordSubmitting,
    resendVerificationSubmitting, handleResendVerification,
  };
}