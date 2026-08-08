import React, { useState, useEffect } from 'react';
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

function Tickets({ 
  inputStyle = {}, 
  role = 'manager', 
  currentUser = { role: 'manager', name: 'حمد' },
  mails = [], 
  setMails = () => {},
  apiBaseUrl = 'https://api.yourdomain.com/v1' 
}) {
  // محاولة جلب الأدوات من الـ Global Context إن وجدت لضمان التوافق التام
  const appContext = useApp ? useApp() : {};
  const apiUrl = appContext.apiUrl || apiBaseUrl;
  const globalBus = appContext.globalBus;
  const triggerGlobalSync = appContext.triggerGlobalSync;

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingState, setSavingState] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('متوسطة');
  const [department, setDepartment] = useState('الدعم الفني');
  const [assignedTo, setAssignedTo] = useState('أحمد');
  
  // حالات نافذة إرسال التقارير عبر الإيميل الحقيقي
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailSubject, setEmailSubject] = useState('تقرير تذاكر الدعم الفني ونظام العمل');
  const [emailBody, setEmailBody] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  
  // توليد التاريخ الآمن بصيغة YYYY-MM-DD
  const getSafeInitialDate = () => {
    try {
      return new Date().toISOString().split('T')[0];
    } catch (e) {
      return '';
    }
  };

  const [date, setDate] = useState(getSafeInitialDate());

  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // 🔐 دالة موحدة لجلب التوكن بأمان تام
  const getAuthToken = () => {
    try {
      const tokenFromUser = currentUser && typeof currentUser === 'object' ? currentUser.token : '';
      const tokenFromStorage = (typeof window !== 'undefined' && localStorage.getItem('token')) || (typeof window !== 'undefined' && localStorage.getItem('authToken')) || '';
      const finalToken = tokenFromUser || tokenFromStorage;
      return typeof finalToken === 'string' ? finalToken.trim() : '';
    } catch (e) {
      return '';
    }
  };

  const flashSaving = (msg, syncType = 'TICKET_SYNC') => {
    setSavingState(msg);
    setTimeout(() => setSavingState(''), 3000);
    if (typeof triggerGlobalSync === 'function') {
      triggerGlobalSync({ type: syncType, timestamp: Date.now() });
    }
  };

  // 🌐 دالة موحدة لطلبات الـ RESTful API عبر apiFetch
  const apiFetch = async (endpoint, options = {}) => {
    try {
      const token = getAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {})
      };

      const response = await fetch(`${apiUrl}${endpoint}`, {
        ...options,
        headers
      });

      return response;
    } catch (error) {
      console.error('خطأ في شبكة الاتصال:', error);
      throw error;
    }
  };

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const response = await apiFetch('/tickets');
      if (!response || !response.ok) throw new Error('فشل في جلب التذاكر من السيرفر');
      const data = await response.json();
      if (Array.isArray(data)) {
        setTickets(data);
      } else {
        setTickets([]);
      }
      setError(null);
    } catch (err) {
      console.error(err);
      setError('تعذر الاتصال بقاعدة البيانات لجلب التذاكر.');
    } finally {
      setLoading(false);
    }
  };

  // 🌐 جلب التذاكر عند التحميل
  useEffect(() => {
    fetchTickets();
  }, []);

  // ⚡ المزامنة اللحظية الفورية عبر Global State Bus مع الأقسام الأخرى
  useEffect(() => {
    if (globalBus && (globalBus.type === 'TICKET_SYNC' || globalBus.type === 'GENERAL_SYNC')) {
      fetchTickets();
    }
  }, [globalBus]);

  // ➕ إضافة تذكرة جديدة وإرسالها للـ API
  const addTicket = async (e) => {
    e.preventDefault();
    if (!title || !description || !department || !assignedTo || !date) {
      alert('⚠️ يرجى تعبئة كافة حقول التذكرة المطلوبة.');
      return;
    }

    const newTicketData = {
      title: String(title).trim(),
      description: String(description).trim(),
      status: 'مفتوحة',
      priority: String(priority).trim(),
      department: String(department).trim(),
      date: String(date).trim(),
      assignedTo: String(assignedTo).trim()
    };

    try {
      const response = await apiFetch('/tickets', {
        method: 'POST',
        body: JSON.stringify(newTicketData)
      });

      if (!response || !response.ok) throw new Error('فشل في حفظ التذكرة الجديدة');
      
      const savedTicket = await response.json();
      if (savedTicket && typeof savedTicket === 'object') {
        setTickets((prev) => [...prev, savedTicket]);
      } else {
        fetchTickets(); // إعادة جلب إن لم يُرجع السيرفر الكائن كاملاً
      }

      const logText = `🎫 تم إنشاء تذكرة دعم جديدة: (${title}) مسندة إلى (${assignedTo}) بقسم (${department})`;
      if (setMails && Array.isArray(mails)) {
        setMails([...mails, logText]);
      }

      flashSaving('✅ تم إنشاء التذكرة ومزامنتها بنجاح!', 'TICKET_SYNC');

      setTitle('');
      setDescription('');
      setPriority('متوسطة');
      setDepartment('الدعم الفني');
      setAssignedTo('أحمد');
    } catch (err) {
      console.error(err);
      alert('⚠️ حدث خطأ أثناء إرسال التذكرة للسيرفر.');
    }
  };

  // 🔄 تغيير حالة التذكرة عبر الـ API
  const toggleStatus = async (id) => {
    const safeTickets = Array.isArray(tickets) ? tickets : [];
    const target = safeTickets.find(t => t && (t.id === id || t._id === id));
    if (!target) return;
    
    const targetId = target.id || target._id;
    const newStatus = target.status === 'مفتوحة' ? 'مغلقة' : 'مفتوحة';

    try {
      const response = await apiFetch(`/tickets/${targetId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });

      if (!response || !response.ok) throw new Error('فشل تحديث حالة التذكرة');

      setTickets((prev) => prev.map(t => t && (t.id === id || t._id === id) ? { ...t, status: newStatus } : t));

      const logText = `${newStatus === 'مغلقة' ? '🔒 تم إغلاق التذكرة' : '🔓 تم إعادة فتح التذكرة'}: (${target?.title || id})`;
      if (setMails && Array.isArray(mails)) {
        setMails([...mails, logText]);
      }
      flashSaving('🔄 تم تحديث الحالة والمزامنة!', 'TICKET_SYNC');
    } catch (err) {
      console.error(err);
      alert('⚠️ حدث خطأ أثناء تحديث حالة التذكرة.');
    }
  };

  // ❌ حذف تذكرة عبر الـ API
  const deleteTicket = async (id) => {
    const safeTickets = Array.isArray(tickets) ? tickets : [];
    const target = safeTickets.find(t => t && (t.id === id || t._id === id));
    if (!target) return;
    const targetId = target.id || target._id;
    
    if (!window.confirm('🗑️ هل أنت متأكد من رغبتك في حذف هذه التذكرة نهائياً؟')) return;

    try {
      const response = await apiFetch(`/tickets/${targetId}`, {
        method: 'DELETE'
      });

      if (!response || !response.ok) throw new Error('فشل حذف التذكرة');

      setTickets((prev) => prev.filter(t => t && (t.id !== id && t._id !== id)));

      const logText = `🗑️ تم حذف تذكرة الدعم: (${target?.title || 'غير معروف'})`;
      if (setMails && Array.isArray(mails)) {
        setMails([...mails, logText]);
      }
      flashSaving('🗑️ تم الحذف والمزامنة بنجاح!', 'TICKET_SYNC');
    } catch (err) {
      console.error(err);
      alert('⚠️ حدث خطأ أثناء حذف التذكرة.');
    }
  };

  // 📧 إرسال تقارير التذاكر عبر إيميل حقيقي من خلال الـ API
  const handleSendRealEmail = async (e) => {
    e.preventDefault();
    if (!emailRecipient) {
      alert('الرجاء إدخال البريد الإلكتروني للمستلم!');
      return;
    }
    setIsSendingEmail(true);
    try {
      const token = getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${apiUrl}/send-email`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: emailRecipient,
          subject: emailSubject,
          message: emailBody || `تقرير نظام التذاكر:\n- إجمالي التذاكر: ${tickets.length}\n- المفتوحة: ${tickets.filter(t => t.status === 'مفتوحة').length}\n- المغلقة: ${tickets.filter(t => t.status === 'مغلقة').length}`
        }),
      });

      if (!response.ok) throw new Error('فشل إرسال البريد الإلكتروني من السيرفر.');

      alert('📧 تم إرسال تقرير التذاكر عبر البريد الإلكتروني بنجاح!');
      setIsEmailModalOpen(false);
      setEmailRecipient('');
      setEmailBody('');
    } catch (err) {
      alert('فشل إرسال الإيميل: ' + err.message);
    } finally {
      setIsSendingEmail(false);
    }
  };

  // 📊 إحصائيات عامة
  const safeTickets = Array.isArray(tickets) ? tickets : [];
  const totalTickets = safeTickets.length;
  const openTickets = safeTickets.filter(t => t && t.status === 'مفتوحة').length;
  const closedTickets = safeTickets.filter(t => t && t.status === 'مغلقة').length;

  // 🔍 فلترة وبحث متقدم
  const filteredTickets = safeTickets.filter(t => {
    if (!t) return false;
    const matchStatus = filterStatus === 'all' ? true : t.status === filterStatus;
    const matchDept = filterDept === 'all' ? true : t.department === filterDept;
    const matchPriority = filterPriority === 'all' ? true : t.priority === filterPriority;
    const matchSearch = ((t.title || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (t.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (t.assignedTo || '').toLowerCase().includes(searchTerm.toLowerCase()));
    return matchStatus && matchDept && matchPriority && matchSearch;
  });

  const deptIcons = { 'المبيعات': '💰', 'الدعم الفني': '🔧', 'التقنية': '💻', 'الإدارة': '👑' };
  const priorityIcons = { 'منخفضة': '🟢', 'متوسطة': '🟡', 'عالية': '🔴' };

  const departments = ['المبيعات', 'الدعم الفني', 'التقنية'];
  const priorities = ['منخفضة', 'متوسطة', 'عالية'];

  const ticketsByDept = departments.map(d => ({
    dept: d,
    count: safeTickets.filter(t => t && t.department === d).length
  }));

  const ticketsByPriority = priorities.map(p => ({
    priority: p,
    count: safeTickets.filter(t => t && t.priority === p).length
  }));

  const ticketsByEmployee = [...new Set(safeTickets.map(t => t?.assignedTo).filter(Boolean))].map(emp => ({
    employee: emp,
    count: safeTickets.filter(t => t && t.assignedTo === emp).length
  }));

  if (loading) {
    return <div style={{ color: '#fff', textAlign: 'center', padding: '50px', fontFamily: 'Tajawal, sans-serif' }}>جاري تحميل البيانات من السيرفر... ⏳</div>;
  }

  if (error) {
    return <div style={{ color: '#ef4444', textAlign: 'center', padding: '50px', fontFamily: 'Tajawal, sans-serif' }}>{error}</div>;
  }

  return (
    <div style={glassContainerStyle} dir="rtl">
      
      {/* رأس الصفحة مع زر إرسال الإيميل الحقيقي */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', color: '#f97316', fontSize: '22px', fontWeight: 'bold' }}>
            🎫 نظام التذاكر والدعم الفني (Tickets Management)
          </h2>
          <p style={{ margin: '0', color: '#94a3b8', fontSize: '13px' }}>إدارة استفسارات العملاء، مشاكل شحن بطاقات الألعاب، وتوزيع المهام على فرق العمل.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {savingState && <span style={{ color: '#34d399', fontSize: '12px', fontWeight: 'bold' }}>{savingState}</span>}
          <button 
            type="button"
            onClick={() => setIsEmailModalOpen(true)}
            style={secondaryButtonStyle}
          >
            📨 إرسال تقرير إيميل حقيقي
          </button>
          <div style={{ background: 'rgba(30, 41, 59, 0.7)', color: '#38bdf8', padding: '10px 16px', borderRadius: '12px', fontSize: '13px', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold' }}>
            التذاكر المفتوحة: {openTickets} ⏳
          </div>
        </div>
      </div>

      {/* نموذج إضافة تذكرة جديدة */}
      <form onSubmit={addTicket} style={glassCardStyle}>
        <h4 style={{ margin: '0', color: '#38bdf8', fontSize: '15px' }}>➕ فتح تذكرة دعم جديدة</h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <input type="text" placeholder="عنوان التذكرة والمشكلة..." value={title} onChange={(e) => setTitle(e.target.value)} style={glassInputStyle} />
          <input type="text" placeholder="وصف تفصيلي للمشكلة..." value={description} onChange={(e) => setDescription(e.target.value)} style={glassInputStyle} />
          
          <select value={department} onChange={(e) => setDepartment(e.target.value)} style={glassInputStyle}>
            <option value="">اختر القسم المختص...</option>
            <option value="المبيعات" style={{ background: '#0b0f19' }}>💰 المبيعات</option>
            <option value="الدعم الفني" style={{ background: '#0b0f19' }}>🔧 الدعم الفني</option>
            <option value="التقنية" style={{ background: '#0b0f19' }}>💻 التقنية</option>
          </select>

          <select value={priority} onChange={(e) => setPriority(e.target.value)} style={glassInputStyle}>
            <option value="منخفضة" style={{ background: '#0b0f19' }}>🟢 أولوية منخفضة</option>
            <option value="متوسطة" style={{ background: '#0b0f19' }}>🟡 أولوية متوسطة</option>
            <option value="عالية" style={{ background: '#0b0f19' }}>🔴 أولوية عاجلة (عالية)</option>
          </select>

          <input type="text" placeholder="اسم الموظف المسؤول (مثل: أحمد، سارة)..." value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={glassInputStyle} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={glassInputStyle} />
        </div>

        <button type="submit" style={primaryButtonStyle}>
          إضافة التذكرة وإرسالها للسيرفر ➕
        </button>
      </form>

      {/* شريط البحث والفلترة المتقدمة */}
      <div style={glassCardStyle}>
        <h4 style={{ margin: '0', color: '#facc15', fontSize: '14px' }}>🔍 بحث وفلترة التذاكر</h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <input 
            type="text" 
            placeholder="ابحث بالعنوان، الوصف، أو اسم المسؤول..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            style={glassInputStyle} 
          />

          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={glassInputStyle}>
            <option value="all" style={{ background: '#0b0f19' }}>كل الحالات</option>
            <option value="مفتوحة" style={{ background: '#0b0f19' }}>مفتوحة ⏳</option>
            <option value="مغلقة" style={{ background: '#0b0f19' }}>مغلقة ✅</option>
          </select>

          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={glassInputStyle}>
            <option value="all" style={{ background: '#0b0f19' }}>كل الأقسام</option>
            <option value="المبيعات" style={{ background: '#0b0f19' }}>المبيعات</option>
            <option value="الدعم الفني" style={{ background: '#0b0f19' }}>الدعم الفني</option>
            <option value="التقنية" style={{ background: '#0b0f19' }}>التقنية</option>
          </select>

          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={glassInputStyle}>
            <option value="all" style={{ background: '#0b0f19' }}>كل الأولويات</option>
            <option value="منخفضة" style={{ background: '#0b0f19' }}>منخفضة</option>
            <option value="متوسطة" style={{ background: '#0b0f19' }}>متوسطة</option>
            <option value="عالية" style={{ background: '#0b0f19' }}>عالية</option>
          </select>
        </div>
      </div>

      {/* قائمة التذاكر */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px', marginBottom: '25px' }}>
        {filteredTickets.length === 0 ? (
          <p style={{ color: '#9ca3af', textAlign: 'center', padding: '20px', gridColumn: '1 / -1' }}>لا توجد تذاكر مطابقة لخيارات البحث الحالية</p>
        ) : (
          filteredTickets.map(ticket => {
            if (!ticket) return null;
            const ticketId = ticket.id || ticket.Y;
            return (
              <div key={ticketId || Math.random()} style={ticketCardStyle}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: ticket.status === 'مفتوحة' ? '#f97316' : '#34d399', fontWeight: 'bold' }}>
                    {deptIcons[ticket.department] || '📁'} {ticket.department}
                  </span>
                  <span style={{ fontSize: '12px', background: 'rgba(30, 41, 59, 0.8)', color: '#38bdf8', padding: '2px 8px', borderRadius: '6px' }}>
                    {priorityIcons[ticket.priority] || ''} {ticket.priority}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <h4 style={{ margin: '0', color: '#fff', fontSize: '15px' }}>{ticket.title}</h4>
                  <p style={{ margin: '0', color: '#94a3b8', fontSize: '13px' }}>{ticket.description}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                    <span>👤 المسؤول: {ticket.assignedTo}</span>
                    <span>📅 {ticket.date}</span>
                  </div>
                </div>

                {/* أزرار التفاعل */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button 
                    type="button"
                    onClick={() => toggleStatus(ticketId)} 
                    style={{ flex: 1, background: ticket.status === 'مفتوحة' ? '#10b981' : '#f59e0b', color: '#fff', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >
                    {ticket.status === 'مفتوحة' ? 'إغلاق التذكرة 🔒' : 'إعادة فتح 🔓'}
                  </button>
                  <button 
                    type="button"
                    onClick={() => deleteTicket(ticketId)} 
                    style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >
                    حذف 🗑️
                  </button>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* قسم الإحصائيات العامة */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '25px' }}>
        <div style={statBoxStyle}>
          <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>إجمالي التذاكر المسجلة</span>
          <span style={{ color: '#38bdf8', fontSize: '20px', fontWeight: 'bold' }}>{totalTickets}</span>
        </div>
        <div style={statBoxStyle}>
          <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>التذاكر المفتوحة قيد المعالجة</span>
          <span style={{ color: '#f97316', fontSize: '20px', fontWeight: 'bold' }}>{openTickets}</span>
        </div>
        <div style={statBoxStyle}>
          <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>التذاكر المغلقة والمحلولة</span>
          <span style={{ color: '#34d399', fontSize: '20px', fontWeight: 'bold' }}>{closedTickets}</span>
        </div>
      </div>

      {/* لوحة تحكم المدير */}
      {(role === 'manager' || (currentUser && currentUser.role === 'manager')) && (
        <div style={glassCardStyle}>
          <h3 style={{ margin: '0', color: '#f97316', fontSize: '16px' }}>👑 لوحة تحكم المدير وتحليلات التذاكر</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
            
            {/* حسب الأقسام */}
            <div style={subCardStyle}>
              <h5 style={{ margin: '0 0 10px 0', color: '#38bdf8', fontSize: '14px' }}>📂 التذاكر حسب الأقسام:</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                {ticketsByDept.map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{deptIcons[d.dept] || '📁'} {d.dept}</span>
                    <span style={{ color: '#34d399', fontWeight: 'bold' }}>{d.count} تذكرة</span>
                  </div>
                ))}
              </div>
            </div>

            {/* حسب الأولوية */}
            <div style={subCardStyle}>
              <h5 style={{ margin: '0 0 10px 0', color: '#facc15', fontSize: '14px' }}>⚡ التذاكر حسب الأولوية:</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                {ticketsByPriority.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{priorityIcons[p.priority] || ''} {p.priority}</span>
                    <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{p.count} تذكرة</span>
                  </div>
                ))}
              </div>
            </div>

            {/* حسب الموظفين */}
            <div style={subCardStyle}>
              <h5 style={{ margin: '0 0 10px 0', color: '#f97316', fontSize: '14px' }}>👥 التذاكر حسب الموظفين:</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                {ticketsByEmployee.map((emp, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>👤 {emp.employee}</span>
                    <span style={{ color: '#facc15', fontWeight: 'bold' }}>{emp.count} تذكرة</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* نافذة إرسال الإيميل الحقيقي بتصميم زجاجي فاخر */}
      {isEmailModalOpen && (
        <div style={modalOverlayStyle} dir="rtl">
          <div style={modalContentStyle}>
            <button onClick={() => setIsEmailModalOpen(false)} style={closeBtnStyle}>✕</button>
            <h3 style={{ color: '#38bdf8', margin: '0 0 15px 0' }}>📨 إرسال تقرير التذاكر عبر البريد</h3>
            <form onSubmit={handleSendRealEmail} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input 
                type="email" 
                placeholder="البريد الإلكتروني للمستلم *" 
                value={emailRecipient} 
                onChange={(e) => setEmailRecipient(e.target.value)} 
                style={glassInputStyle} 
                required 
              />
              <input 
                type="text" 
                placeholder="عنوان الرسالة..." 
                value={emailSubject} 
                onChange={(e) => setEmailSubject(e.target.value)} 
                style={glassInputStyle} 
              />
              <textarea 
                placeholder="محتوى التقرير أو الملاحظات..." 
                value={emailBody} 
                onChange={(e) => setEmailBody(e.target.value)} 
                rows={4} 
                style={glassInputStyle} 
              />
              <button type="submit" style={primaryButtonStyle} disabled={isSendingEmail}>
                {isSendingEmail ? '⏳ جاري إرسال الإيميل...' : 'إرسال التقرير الآن 🚀'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// ------------------------------------------------------------------
// 🎨 أنماط التصميم الزجاجي الفاخر (Glassmorphism Styles)
// ------------------------------------------------------------------
const glassContainerStyle = {
  background: 'rgba(15, 23, 42, 0.78)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  padding: '30px',
  borderRadius: '24px',
  color: '#f8fafc',
  fontFamily: 'Tajawal, sans-serif',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)'
};

const glassCardStyle = {
  background: 'rgba(17, 24, 39, 0.65)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  padding: '20px',
  borderRadius: '16px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  marginBottom: '25px',
  display: 'flex',
  flexDirection: 'column',
  gap: '15px'
};

const ticketCardStyle = {
  background: 'rgba(17, 24, 39, 0.75)',
  backdropFilter: 'blur(10px)',
  padding: '16px',
  borderRadius: '14px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  boxShadow: '0 8px 16px -4px rgba(0,0,0,0.3)'
};

const subCardStyle = {
  background: 'rgba(11, 15, 25, 0.6)',
  padding: '16px',
  borderRadius: '12px',
  border: '1px solid rgba(255, 255, 255, 0.05)'
};

const statBoxStyle = {
  background: 'rgba(17, 24, 39, 0.65)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  padding: '18px',
  borderRadius: '14px',
  backdropFilter: 'blur(10px)'
};

const glassInputStyle = {
  background: 'rgba(11, 15, 25, 0.7)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  padding: '10px 14px',
  borderRadius: '10px',
  color: '#fff',
  fontSize: '13px',
  outline: 'none',
  width: '100%',
  fontFamily: 'Tajawal, sans-serif'
};

const primaryButtonStyle = {
  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
  color: '#fff',
  border: 'none',
  padding: '12px',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '14px',
  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
};

const secondaryButtonStyle = {
  background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
  color: '#fff',
  border: 'none',
  padding: '10px 18px',
  borderRadius: '10px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 'bold',
  boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)'
};

const modalOverlayStyle = {
  position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
  background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(10px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px'
};

const modalContentStyle = {
  background: 'rgba(30, 41, 59, 0.88)', backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '20px',
  padding: '25px', width: '100%', maxWidth: '480px', maxHeight: '90vh',
  overflowY: 'auto', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
  textAlign: 'right'
};

const closeBtnStyle = {
  position: 'absolute', top: '15px', left: '15px', background: 'rgba(255,255,255,0.1)',
  color: '#fff', border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold'
};

export default Tickets;