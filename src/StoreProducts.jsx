import React, { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useProducts
 * هوك مسؤول عن كل منطق المتجر: جلب المنتجات من الخادم، البحث، حالة التحميل والخطأ.
 * يُعاد استخدام fetchProducts من AuthCartCheckout.jsx بعد إتمام عملية الشراء لتحديث المخزون.
 */
export function useProducts({ api, setError }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // مرجع لتتبع حالة المكون لمنع تسريب الذاكرة (Memory Leaks)
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchProducts = useCallback(async (search = '') => {
    if (!api || typeof api.get !== 'function') {
      if (isMounted.current) {
        setLoading(false);
      }
      return;
    }

    if (isMounted.current) {
      setLoading(true);
    }
    
    if (typeof setError === 'function') {
      setError('');
    }

    try {
      const safeSearch = typeof search === 'string' ? search.trim() : '';
      const response = await api.get('/products', {
        params: safeSearch ? { search: safeSearch } : {}
      });

      if (isMounted.current) {
        const responseData = response && response.data;
        if (Array.isArray(responseData)) {
          setProducts(responseData);
        } else {
          setProducts([]);
        }
      }
    } catch (err) {
      if (isMounted.current && typeof setError === 'function') {
        setError('⚠️ تعذر الاتصال بالخادم. يرجى التأكد من تشغيل السيرفر وحالة الاتصال.');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [api, setError]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    const safeSearchTerm = typeof searchTerm === 'string' ? searchTerm : '';
    const timer = setTimeout(() => {
      fetchProducts(safeSearchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm, fetchProducts]);

  return { products, loading, searchTerm, setSearchTerm, fetchProducts };
}

/** شريط البحث في المنتجات */
export function ProductSearchBar({ searchTerm = '', setSearchTerm = () => {}, inputStyle = {} }) {
  const safeSearchTerm = typeof searchTerm === 'string' ? searchTerm : '';
  const safeSetSearchTerm = typeof setSearchTerm === 'function' ? setSearchTerm : () => {};

  return (
    <div style={{ marginBottom: '25px' }}>
      <input
        type="text"
        placeholder="🔍 ابحث في المنتجات عبر السيرفر..."
        value={safeSearchTerm}
        onChange={(e) => safeSetSearchTerm(e.target ? e.target.value : '')}
        style={{ width: '100%', background: '#111827', border: '1px solid #334155', padding: '14px 18px', borderRadius: '12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box', ...(inputStyle || {}) }}
      />
    </div>
  );
}

/** شبكة عرض بطاقات المنتجات */
export function ProductGrid({ loading = false, products = [], addToCart = () => {} }) {
  const [hoveredProductId, setHoveredProductId] = useState(null);

  if (loading) {
    return <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>⏳ جارٍ تحميل المنتجات من الخادم...</p>;
  }

  const safeProducts = Array.isArray(products) ? products : [];
  const safeAddToCart = typeof addToCart === 'function' ? addToCart : () => {};

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px', marginBottom: '30px' }}>
      {safeProducts.length === 0 ? (
        <p style={{ color: '#9ca3af', gridColumn: '1 / -1', textAlign: 'center', padding: '30px' }}>لا توجد منتجات مسجلة في قاعدة البيانات حالياً.</p>
      ) : (
        safeProducts.map(product => {
          if (!product || typeof product !== 'object') return null;
          const prodId = product.id || product._id || Math.random();
          const stockCount = typeof product.stock === 'number' ? product.stock : 0;
          const productPrice = product.price !== undefined ? product.price : 0;

          return (
            <div
              key={prodId}
              className="hz-product-card"
              onMouseEnter={() => setHoveredProductId(prodId)}
              onMouseLeave={() => setHoveredProductId(null)}
              style={{
                background: '#111827',
                padding: '24px',
                borderRadius: '20px',
                border: '2px dashed #10b981',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '15px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontSize: '24px', fontWeight: 'bold' }}>
                    +
                  </div>
                  <span style={{ background: stockCount > 0 ? '#065f46' : '#991b1b', color: stockCount > 0 ? '#34d399' : '#fca5a5', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                    {stockCount > 0 ? `المخزون: ${stockCount}` : 'نفد المخزون'}
                  </span>
                </div>
                <h4 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '16px', fontWeight: 'bold' }}>{product.name || 'منتج بدون اسم'}</h4>
                <p style={{ margin: '0', color: '#94a3b8', fontSize: '13px', lineHeight: '1.4' }}>{product.description || 'بدون وصف'}</p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '12px', borderTop: '1px solid #1f2937' }}>
                <span style={{ color: '#facc15', fontWeight: 'bold', fontSize: '16px' }}>💰 {productPrice}$</span>
                <button
                  type="button"
                  className="hz-add-btn"
                  onClick={() => safeAddToCart(product)}
                  disabled={stockCount <= 0}
                  style={{ background: stockCount > 0 ? '#10b981' : '#4b5563', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: stockCount > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '13px' }}
                >
                  {stockCount > 0 ? 'أضف للسلة ➕' : 'غير متوفر'}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}