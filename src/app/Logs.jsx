import React, { useState } from 'react';
import { useApp } from './AppContext';

function Logs({ logs: externalLogs, setLogs: externalSetLogs } = {}) {
  const contextApp = useApp() || {};
  const { logs: contextLogs, setLogs: contextSetLogs, addLog } = contextApp;

  const logs = externalLogs !== undefined ? externalLogs : (contextLogs || []);
  const setLogs = externalSetLogs || contextSetLogs;

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');

  const handleClearLogs = () => {
    if (typeof setLogs === 'function') {
      try {
        setLogs([]);
        if (typeof addLog === 'function') addLog({ action: '🧹 تم تفريغ سجل الأحداث' });
      } catch (err) {
        console.error("Error clearing logs:", err);
      }
    }
  };

  const handleExportLogs = () => {
    const safeLogs = Array.isArray(logs) ? logs : [];
    const dataStr = JSON.stringify(safeLogs, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderLogContent = (log) => {
    if (log === null || log === undefined) return "حدث غير معروف";
    if (typeof log === 'string') return log;
    if (typeof log === 'number' || typeof log === 'boolean') return String(log);

    if (typeof log === 'object') {
      try {
        const text = String(log.action || log.message || log.text || log.description || '');
        const userVal = log.user || log.userName;
        const user = userVal ? ` (بواسطة: ${String(userVal)})` : '';
        const timeVal = log.time || log.timestamp;
        const time = timeVal ? ` [${new Date(timeVal).toLocaleTimeString('ar-JO')}]` : '';

        if (text) {
          return `${time} ${text}${user}`;
        }
        return JSON.stringify(log, null, 2);
      } catch (e) {
        return "سجل بتنسيق غير متوافق";
      }
    }
    return String(log);
  };

  const getLogStyleAndIcon = (log) => {
    let content = '';
    try {
      if (typeof log === 'string') {
        content = log;
      } else if (log && typeof log === 'object') {
        content = JSON.stringify(log);
      } else {
        content = String(log || '');
      }
    } catch (err) {
      content = '';
    }

    if (content.includes('➕') || content.includes('إضافة') || content.includes('توظيف') || content.includes('إنشاء')) {
      return { icon: '🟢', color: '#34d399', bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)' };
    }
    if (content.includes('❌') || content.includes('حذف') || content.includes('إزالة') || content.includes('فشل')) {
      return { icon: '🔴', color: '#f87171', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)' };
    }
    if (content.includes('✏️') || content.includes('تعديل') || content.includes('تحديث') || content.includes('🔄')) {
      return { icon: '🟡', color: '#facc15', bg: 'rgba(250, 204, 21, 0.1)', border: 'rgba(250, 204, 21, 0.3)' };
    }
    if (content.includes('💰') || content.includes('راتب') || content.includes('مبيعات') || content.includes('📧') || content.includes('بريد')) {
      return { icon: '🔵', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.1)', border: 'rgba(56, 189, 248, 0.3)' };
    }
    if (content.includes('🧹') || content.includes('مسح') || content.includes('تفريغ')) {
      return { icon: '🟣', color: '#a78bfa', bg: 'rgba(139, 92, 246, 0.1)', border: 'rgba(139, 92, 246, 0.3)' };
    }
    return { icon: '📄', color: '#9ca3af', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.3)' };
  };

  const safeLogs = Array.isArray(logs) ? logs : [];

  let filteredLogs = safeLogs.filter(log => {
    const content = renderLogContent(log).toLowerCase();
    const matchesSearch = !searchTerm || content.includes(searchTerm.toLowerCase());
    const styleInfo = getLogStyleAndIcon(log);
    let matchesType = true;
    if (filterType === 'add') matchesType = styleInfo.icon === '🟢';
    else if (filterType === 'delete') matchesType = styleInfo.icon === '🔴';
    else if (filterType === 'edit') matchesType = styleInfo.icon === '🟡';
    else if (filterType === 'email') matchesType = styleInfo.icon === '🔵';
    return matchesSearch && matchesType;
  });

  if (sortOrder === 'newest') {
    filteredLogs = [...filteredLogs]; // already newest first from reverse
  } else {
    filteredLogs = [...filteredLogs].reverse();
  }

  return (
    <div style={glassContainerStyle} dir="rtl">

      {/* رأس قسم السجلات */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h3 style={{ margin: '0', color: '#f97316', fontSize: '20px', fontWeight: 'bold' }}>
            📜 سجل الأحداث والعمليات الفورية
          </h3>
          <span style={badgeStyle}>
            {safeLogs.length}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="🔍 ابحث في السجلات..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, width: '180px' }}
          />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            <option value="all">الكل</option>
            <option value="add">إضافات</option>
            <option value="delete">حذف</option>
            <option value="edit">تعديل</option>
            <option value="email">بريد</option>
          </select>
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            <option value="newest">الأحدث أولاً</option>
            <option value="oldest">الأقدم أولاً</option>
          </select>
          <button onClick={handleExportLogs} style={{ background: '#0ea5e9', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
            📤 تصدير
          </button>
          {safeLogs.length > 0 && typeof setLogs === 'function' && (
            <button 
              type="button"
              onClick={handleClearLogs}
              style={clearButtonStyle}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            >
              مسح السجلات 🧹
            </button>
          )}
        </div>
      </div>

      {safeLogs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '35px 0', color: '#94a3b8' }}>
          <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📭</span>
          <p style={{ margin: '0', fontSize: '13px' }}>لا توجد أحداث أو عمليات مسجلة حتى الآن. ستبدأ الأنشطة بالظهور هنا فوراً عند التفاعل مع النظام.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '450px', overflowY: 'auto', paddingRight: '4px' }}>
          {filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
              لا توجد سجلات مطابقة للفلتر المحدد.
            </div>
          ) : (
            filteredLogs.map((log, index) => {
              const styleInfo = getLogStyleAndIcon(log);
              const uniqueKey = log && typeof log === 'object' && (log.id || log.timestamp || log.time) 
                ? String(log.id || log.timestamp || log.time) 
                : `log-item-${index}`;

              return (
                <div 
                  key={uniqueKey} 
                  style={{
                    ...logItemStyle,
                    background: styleInfo.bg,
                    border: `1px solid ${styleInfo.border}`
                  }}
                >
                  <span style={{ fontSize: '18px', minWidth: '28px', textAlign: 'center' }}>{styleInfo.icon}</span>
                  <span style={{ fontSize: '13px', color: '#e2e8f0', wordBreak: 'break-word', lineHeight: '1.5', flex: 1 }}>
                    {renderLogContent(log)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// 💎 أنماط التصميم الزجاجي
const glassContainerStyle = {
  background: 'rgba(11, 15, 25, 0.75)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  padding: '24px',
  borderRadius: '20px',
  color: '#fff',
  fontFamily: 'Tajawal, sans-serif',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
  width: '100%',
  boxSizing: 'border-box'
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '16px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  paddingBottom: '12px',
  flexWrap: 'wrap',
  gap: '10px'
};

const badgeStyle = {
  background: 'rgba(249, 115, 22, 0.15)',
  color: '#f97316',
  padding: '2px 10px',
  borderRadius: '12px',
  fontSize: '12px',
  border: '1px solid rgba(249, 115, 22, 0.3)',
  fontWeight: 'bold'
};

const inputStyle = {
  background: 'rgba(17, 24, 39, 0.6)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  padding: '8px 12px',
  borderRadius: '10px',
  color: '#fff',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box'
};

const clearButtonStyle = {
  background: 'rgba(255, 255, 255, 0.1)',
  backdropFilter: 'blur(8px)',
  color: '#cbd5e1',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  padding: '8px 14px',
  borderRadius: '10px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 'bold',
  transition: 'all 0.2s ease'
};

const logItemStyle = {
  backdropFilter: 'blur(10px)',
  padding: '12px 14px',
  borderRadius: '12px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
  transition: 'transform 0.15s ease'
};

export default Logs;