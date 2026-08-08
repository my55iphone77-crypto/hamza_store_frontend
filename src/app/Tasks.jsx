import React, { useState, useEffect } from 'react';

function Tasks({ 
  inputStyle = {}, 
  mails = [], 
  setMails = () => {},
  currentUser = null,
  apiBaseUrl = 'https://api.yourdomain.com/v1',
  globalEventBus = null // ناقل الحالة العالمي للتزامن الفوري بين الأقسام
}) {
  const [tasks, setTasks] = useState([]);
  const [storageSpaces, setStorageSpaces] = useState([]);
  const [loading, setLoading] = useState(false);

  // حالات إدخال مهمة جديدة
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [department, setDepartment] = useState('');

  // حالات الفلترة والبحث
  const [filterDate, setFilterDate] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // حالات نافذة التعديل (Modal) للمهمة
  const [editingTask, setEditingTask] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDept, setEditDept] = useState('');

  // حالات إضافة مساحة تخزين جديدة
  const [storageName, setStorageName] = useState('');
  const [storageCapacity, setStorageCapacity] = useState('');
  const [storageUsed, setStorageUsed] = useState('');
  const [storageDept, setStorageDept] = useState('');

  // دالة موحدة لجلب التوكن من localStorage أو من كائن currentUser بأمان تام
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

  // دالة موحدة لطلبات الـ RESTful API عبر apiFetch مع تعقيم الهيدرز والتعامل مع الأخطاء
  const apiFetch = async (endpoint, options = {}) => {
    try {
      const token = getAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {})
      };

      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        ...options,
        headers
      });

      return response;
    } catch (error) {
      console.error('خطأ في شبكة الاتصال:', error);
      throw error;
    }
  };

  // 🔄 ربط المزامنة اللحظية مع Global State Bus وإدارة جلب البيانات
  useEffect(() => {
    fetchDataFromApi();

    // الاستماع لأي أحداث قادمة من الأقسام الأخرى عبر ناقل الحركة العالمي
    if (globalEventBus && typeof globalEventBus.subscribe === 'function') {
      const unsubscribe = globalEventBus.subscribe('GLOBAL_SYNC_EVENT', (eventData) => {
        if (eventData && eventData.type === 'TASK_OR_STORAGE_UPDATE') {
          fetchDataFromApi(); // مزامنة فورية عند حدوث تغيير في قسم آخر
        }
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [globalEventBus]);

  // دالة إرسال الإشعار أو البريد الحقيقي وتحديث النظام الموحد
  const dispatchRealMailAndLog = (logText, subject = 'تحديث نظام المهام والخوادم') => {
    const timestamp = new Date().toLocaleTimeString('ar-SA');
    const fullLogObject = {
      id: Date.now(),
      sender: currentUser?.name || 'مدير النظام الآلي',
      subject: subject,
      message: logText,
      time: timestamp,
      read: false,
      type: 'system_notification'
    };

    if (setMails && Array.isArray(mails)) {
      setMails([fullLogObject, ...mails]);
    }

    // إطلاق حدث في الناقل العالمي لتحديث باقي الأقسام فورياً
    if (globalEventBus && typeof globalEventBus.publish === 'function') {
      globalEventBus.publish('GLOBAL_SYNC_EVENT', { type: 'TASK_OR_STORAGE_UPDATE', data: fullLogObject });
    }
  };

  const fetchDataFromApi = async () => {
    try {
      setLoading(true);
      const [tasksRes, storageRes] = await Promise.all([
        apiFetch('/tasks').catch(() => null),
        apiFetch('/storage').catch(() => null)
      ]);

      if (tasksRes && tasksRes.ok) {
        const tasksData = await tasksRes.json();
        if (Array.isArray(tasksData)) {
          setTasks(tasksData);
        }
      }

      if (storageRes && storageRes.ok) {
        const storageData = await storageRes.json();
        if (Array.isArray(storageData)) {
          setStorageSpaces(storageData);
        }
      }
    } catch (error) {
      console.error('فشل الاتصال بالخادم لجلب البيانات:', error);
    } finally {
      setLoading(false);
    }
  };

  // 💽 إضافة مساحة تخزين جديدة عبر الـ API
  const addStorageSpace = async (e) => {
    e.preventDefault();
    if (!storageName || !storageCapacity || !storageDept) {
      alert('⚠️ يرجى تعبئة حقول مساحة التخزين الأساسية.');
      return;
    }

    const newSpacePayload = {
      name: String(storageName).trim(),
      capacityGB: Number(storageCapacity),
      usedGB: Number(storageUsed || 0),
      department: String(storageDept).trim()
    };

    try {
      const response = await apiFetch('/storage', {
        method: 'POST',
        body: JSON.stringify(newSpacePayload)
      });

      if (response && response.ok) {
        const createdStorage = await response.json();
        if (createdStorage && typeof createdStorage === 'object') {
          setStorageSpaces((prev) => [...prev, createdStorage]);
        }

        const logText = `💽 تم إضافة مساحة تخزين جديدة: (${storageName}) بسعة (${storageCapacity}GB) لقسم (${storageDept}) بنجاح وتزامن مع السيرفر.`;
        dispatchRealMailAndLog(logText, 'إضافة مساحة تخزين سحابية جديدة');

        setStorageName('');
        setStorageCapacity('');
        setStorageUsed('');
        setStorageDept('');
      } else {
        alert('❌ فشل إضافة مساحة التخزين عبر الخادم.');
      }
    } catch (error) {
      console.error('خطأ في الاتصال بالخادم:', error);
    }
  };

  // 🗑️ حذف مساحة تخزين عبر الـ API
  const deleteStorage = async (id) => {
    const target = storageSpaces.find(s => s.id === id);
    try {
      const response = await apiFetch(`/storage/${id}`, {
        method: 'DELETE'
      });

      if (response && response.ok) {
        setStorageSpaces((prev) => prev.filter(s => s.id !== id));
        const logText = `🗑️ تم حذف مساحة التخزين: (${target?.name || 'غير معروف'}) وإلغاء ربطها بالخادم بنجاح.`;
        dispatchRealMailAndLog(logText, 'حذف مساحة تخزين سحابية');
      } else {
        alert('❌ فشل حذف مساحة التخزين من الخادم.');
      }
    } catch (error) {
      console.error('فشل الاتصال بالخادم:', error);
    }
  };

  // ➕ إضافة مهمة جديدة عبر الـ API
  const addTask = async (e) => {
    e.preventDefault();
    if (!title || !description || !date || !department) {
      alert('⚠️ يرجى تعبئة كافة حقول المهمة المطلوبة.');
      return;
    }

    const newTaskPayload = { 
      title: String(title).trim(), 
      description: String(description).trim(), 
      date: String(date).trim(), 
      department: String(department).trim() 
    };

    try {
      const response = await apiFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify(newTaskPayload)
      });

      if (response && response.ok) {
        const createdTask = await response.json();
        if (createdTask && typeof createdTask === 'object') {
          setTasks((prev) => [...prev, createdTask]);
        }

        const logText = `📝 تم إضافة مهمة جديدة: (${title}) لقسم (${department}) موعدها المستهدف (${date})`;
        dispatchRealMailAndLog(logText, 'مهمة عمل جديدة تم توثيقها');

        setTitle('');
        setDescription('');
        setDate('');
        setDepartment('');
      } else {
        alert('❌ فشل إضافة المهمة عبر الخادم.');
      }
    } catch (error) {
      console.error('خطأ في الاتصال بالخادم:', error);
    }
  };

  // ✅ تغيير حالة المهمة (إكمال / إلغاء) عبر الـ API
  const toggleTask = async (id) => {
    const target = tasks.find(t => t.id === id);
    const newStatus = !target?.completed;

    try {
      const response = await apiFetch(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: newStatus })
      });

      if (response && response.ok) {
        setTasks((prev) => prev.map(t => t.id === id ? { ...t, completed: newStatus } : t));
        const logText = `${newStatus ? '✅ تم إكمال المهمة بنجاح' : '⏳ تم إعادة فتح المهمة'}: (${target?.title || id})`;
        dispatchRealMailAndLog(logText, 'تحديث حالة مهمة');
      } else {
        alert('❌ فشل تحديث حالة المهمة.');
      }
    } catch (error) {
      console.error('فشل الاتصال بالخادم:', error);
    }
  };

  // ❌ حذف مهمة عبر الـ API
  const deleteTask = async (id) => {
    const target = tasks.find(t => t.id === id);
    try {
      const response = await apiFetch(`/tasks/${id}`, {
        method: 'DELETE'
      });

      if (response && response.ok) {
        setTasks((prev) => prev.filter(t => t.id !== id));
        const logText = `🗑️ تم حذف المهمة: (${target?.title || 'غير معروف'}) نهائياً من قاعدة البيانات.`;
        dispatchRealMailAndLog(logText, 'حذف مهمة رسمية');

        if (editingTask && editingTask.id === id) {
          setEditingTask(null);
        }
      } else {
        alert('❌ فشل حذف المهمة من الخادم.');
      }
    } catch (error) {
      console.error('فشل الاتصال بالخادم:', error);
    }
  };

  // ✏️ فتح نافذة التعديل
  const openEditModal = (t) => {
    if (!t) return;
    setEditingTask(t);
    setEditTitle(t.title || '');
    setEditDesc(t.description || '');
    setEditDate(t.date || '');
    setEditDept(t.department || '');
  };

  // 💾 حفظ التعديل على المهمة عبر الـ API
  const handleSaveEdit = async () => {
    if (!editingTask) return;

    const updatedPayload = {
      title: String(editTitle).trim(),
      description: String(editDesc).trim(),
      date: String(editDate).trim(),
      department: String(editDept).trim()
    };

    try {
      const response = await apiFetch(`/tasks/${editingTask.id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedPayload)
      });

      if (response && response.ok) {
        setTasks((prev) => prev.map(t => {
          if (t.id === editingTask.id) {
            return { ...t, ...updatedPayload };
          }
          return t;
        }));

        const logText = `✏️ تم تحديث بيانات المهمة وتفاصيلها: (${editTitle})`;
        dispatchRealMailAndLog(logText, 'تعديل بيانات مهمة قائمة');

        setEditingTask(null);
      } else {
        alert('❌ فشل حفظ التعديلات عبر الخادم.');
      }
    } catch (error) {
      console.error('فشل الاتصال بالخادم:', error);
    }
  };

  // 📊 إحصائيات دقيقة للمهام مع التحقق من المصفوفات
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const totalTasks = safeTasks.length;
  const completedTasks = safeTasks.filter(t => t && t.completed).length;
  const pendingTasks = totalTasks - completedTasks;
  const completionRate = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // 🔍 فلترة وبحث متقدم
  const filteredTasks = safeTasks.filter(t => {
    if (!t) return false;
    const matchDate = filterDate ? t.date === filterDate : true;
    const matchDept = filterDept === 'all' ? true : t.department === filterDept;
    const matchSearch = ((t.title || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (t.description || '').toLowerCase().includes(searchTerm.toLowerCase()));
    return matchDate && matchDept && matchSearch;
  });

  // استخراج الأقسام الفريدة بأمان
  const departments = ['all', ...new Set(safeTasks.map(t => t?.department).filter(Boolean))];

  return (
    <div style={{ 
      background: 'rgba(11, 15, 25, 0.75)', 
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      padding: '30px', 
      borderRadius: '24px', 
      color: '#f8fafc', 
      fontFamily: 'Tajawal, sans-serif', 
      border: '1px solid rgba(255, 255, 255, 0.08)', 
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
      opacity: loading ? 0.8 : 1,
      transition: 'all 0.3s ease'
    }} dir="rtl">
      
      {/* رأس الصفحة بالتصميم الزجاجي */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '15px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', color: '#f97316', fontSize: '22px', fontWeight: 'bold', textShadow: '0 2px 10px rgba(249, 115, 22, 0.3)' }}>
            📝 إدارة المهام ومساحات التخزين (Global Sync & Glass)
          </h2>
          <p style={{ margin: '0', color: '#94a3b8', fontSize: '13px' }}>
            {loading ? 'جاري المزامنة اللحظية مع الخادم السحابي...' : 'متصل بالكامل مع نظام State Bus وخوادم MongoDB السحابية.'}
          </p>
        </div>

        <div style={{ background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(8px)', color: '#38bdf8', padding: '10px 16px', borderRadius: '14px', fontSize: '13px', border: '1px solid rgba(56, 189, 248, 0.2)', fontWeight: 'bold', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1)' }}>
          معدل إنجاز المهام: {completionRate}%
        </div>
      </div>

      {/* قسم إدارة مساحات التخزين */}
      <div style={{ background: 'rgba(17, 24, 39, 0.65)', backdropFilter: 'blur(12px)', padding: '20px', borderRadius: '18px', border: '1px solid rgba(255, 255, 255, 0.06),', marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <h4 style={{ margin: '0', color: '#38bdf8', fontSize: '16px' }}>💽 إدارة ومراقبة مساحات التخزين والسيرفرات</h4>

        {/* نموذج إضافة مساحة تخزين */}
        <form onSubmit={addStorageSpace} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', background: 'rgba(11, 15, 25, 0.5)', padding: '15px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <input type="text" placeholder="اسم وحدة التخزين/السيرفر..." value={storageName} onChange={(e) => setStorageName(e.target.value)} style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 12px', borderRadius: '10px', color: '#fff', fontSize: '12px', ...inputStyle }} />
          <input type="number" placeholder="السعة الكلية (GB)..." value={storageCapacity} onChange={(e) => setStorageCapacity(e.target.value)} style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 12px', borderRadius: '10px', color: '#fff', fontSize: '12px', ...inputStyle }} />
          <input type="number" placeholder="المستخدم حالياً (GB)..." value={storageUsed} onChange={(e) => setStorageUsed(e.target.value)} style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 12px', borderRadius: '10px', color: '#fff', fontSize: '12px', ...inputStyle }} />
          <select value={storageDept} onChange={(e) => setStorageDept(e.target.value)} style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 12px', borderRadius: '10px', color: '#fff', fontSize: '12px', ...inputStyle }}>
            <option value="">اختر القسم...</option>
            <option value="المبيعات">المبيعات</option>
            <option value="الدعم الفني">الدعم الفني</option>
            <option value="التقنية">التقنية</option>
            <option value="الإدارة">الإدارة</option>
          </select>
          <button type="submit" style={{ gridColumn: '1 / -1', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#fff', border: 'none', padding: '12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', boxShadow: '0 4px 12px rgba(14, 165, 233, 0.3)' }}>
            إضافة مساحة تخزين عبر الخادم ➕
          </button>
        </form>

        {/* عرض مساحات التخزين */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
          {Array.isArray(storageSpaces) && storageSpaces.map((storage) => {
            if (!storage) return null;
            const usagePercent = storage.capacityGB ? Math.round(((storage.usedGB || 0) / storage.capacityGB) * 100) : 0;
            return (
              <div key={storage.id || Math.random()} style={{ background: 'rgba(11, 15, 25, 0.6)', backdropFilter: 'blur(8px)', padding: '14px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#f8fafc' }}>{storage.name}</span>
                  <span style={{ fontSize: '11px', background: 'rgba(30, 41, 59, 0.8)', color: '#38bdf8', padding: '2px 8px', borderRadius: '6px' }}>{storage.department}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  المستخدم: {storage.usedGB || 0} GB من {storage.capacityGB} GB ({usagePercent}%)
                </div>
                {/* شريط التقدم */}
                <div style={{ width: '100%', background: 'rgba(30, 41, 59, 0.8)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(usagePercent, 100)}%`, background: usagePercent > 85 ? '#ef4444' : '#10b981', height: '100%', transition: 'width 0.3s' }}></div>
                </div>
                <button type="button" onClick={() => deleteStorage(storage.id)} style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.4)', padding: '6px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', marginTop: '4px' }}>
                  حذف المساحة عبر الخادم 🗑️
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* نموذج إضافة مهمة جديدة */}
      <form onSubmit={addTask} style={{ background: 'rgba(17, 24, 39, 0.65)', backdropFilter: 'blur(12px)', padding: '20px', borderRadius: '18px', border: '1px solid rgba(255, 255, 255, 0.06)', marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <h4 style={{ margin: '0', color: '#38bdf8', fontSize: '15px' }}>➕ إضافة مهمة جديدة</h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <input type="text" placeholder="عنوان المهمة..." value={title} onChange={(e) => setTitle(e.target.value)} style={{ background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...inputStyle }} />
          <input type="text" placeholder="وصف تفصيلي للمهمة..." value={description} onChange={(e) => setDescription(e.target.value)} style={{ background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...inputStyle }} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...inputStyle }} />
          <select value={department} onChange={(e) => setDepartment(e.target.value)} style={{ background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...inputStyle }}>
            <option value="">اختر القسم المسؤول...</option>
            <option value="المبيعات">المبيعات</option>
            <option value="الدعم الفني">الدعم الفني</option>
            <option value="التقنية">التقنية</option>
            <option value="الإدارة">الإدارة</option>
          </select>
        </div>

        <button type="submit" style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', border: 'none', padding: '12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)' }}>
          إضافة المهمة وتوثيقها عبر الخادم ➕
        </button>
      </form>

      {/* شريط البحث والفلترة */}
      <div style={{ background: 'rgba(17, 24, 39, 0.65)', backdropFilter: 'blur(12px)', padding: '20px', borderRadius: '18px', border: '1px solid rgba(255, 255, 255, 0.06)', marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <h4 style={{ margin: '0', color: '#facc15', fontSize: '14px' }}>🔍 بحث وفلترة متقدمة</h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <input type="text" placeholder="ابحث في عنوان أو وصف المهام..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...inputStyle }} />
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...inputStyle }} />
          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={{ background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...inputStyle }}>
            {departments.map((d, i) => (
              <option key={i} value={d}>{d === 'all' ? 'كل الأقسام النشطة' : d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* قائمة المهام */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px', marginBottom: '25px' }}>
        {filteredTasks.length === 0 ? (
          <p style={{ color: '#9ca3af', textAlign: 'center', padding: '20px', gridColumn: '1 / -1' }}>لا توجد مهام مطابقة لخيارات البحث والفلترة</p>
        ) : (
          filteredTasks.map(task => {
            if (!task) return null;
            return (
              <div key={task.id || Math.random()} style={{ background: 'rgba(17, 24, 39, 0.65)', backdropFilter: 'blur(10px)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: '0 8px 16px -4px rgba(0,0,0,0.3)' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: task.completed ? '#34d399' : '#f97316', fontWeight: 'bold' }}>
                    {task.completed ? 'مكتملة ✅' : 'قيد التنفيذ ⏳'}
                  </span>
                  <span style={{ fontSize: '12px', background: 'rgba(30, 41, 59, 0.8)', color: '#38bdf8', padding: '2px 8px', borderRadius: '6px' }}>
                    {task.department}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <h4 style={{ margin: '0', color: '#fff', fontSize: '15px' }}>{task.title}</h4>
                  <p style={{ margin: '0', color: '#94a3b8', fontSize: '13px' }}>{task.description}</p>
                  <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '12px' }}>📅 موعد الاستحقاق: {task.date}</p>
                </div>

                {/* أزرار التفاعل مع المهمة */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => toggleTask(task.id)} style={{ flex: 1, background: task.completed ? '#f59e0b' : '#10b981', color: '#fff', border: 'none', padding: '6px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                    {task.completed ? 'إلغاء الإكمال ↩️' : 'إكمال المهمة ✓'}
                  </button>
                  <button type="button" onClick={() => openEditModal(task)} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                    تعديل ✏️
                  </button>
                  <button type="button" onClick={() => deleteTask(task.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                    حذف 🗑️
                  </button>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* قسم الإحصائيات العامة */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px' }}>
        <div style={{ background: 'rgba(17, 24, 39, 0.65)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.06)', padding: '18px', borderRadius: '16px' }}>
          <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>إجمالي المهام المسجلة</span>
          <span style={{ color: '#38bdf8', fontSize: '20px', fontWeight: 'bold' }}>{totalTasks}</span>
        </div>
        <div style={{ background: 'rgba(17, 24, 39, 0.65)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.06)', padding: '18px', borderRadius: '16px' }}>
          <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>المهام المكتملة بنجاح</span>
          <span style={{ color: '#34d399', fontSize: '20px', fontWeight: 'bold' }}>{completedTasks}</span>
        </div>
        <div style={{ background: 'rgba(17, 24, 39, 0.65)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.06)', padding: '18px', borderRadius: '16px' }}>
          <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>المهام قيد الانتظار</span>
          <span style={{ color: '#facc15', fontSize: '20px', fontWeight: 'bold' }}>{pendingTasks}</span>
        </div>
      </div>

      {/* نافذة منبثقة لتعديل المهمة بتصميم زجاجي */}
      {editingTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'rgba(17, 24, 39, 0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', width: '100%', maxWidth: '450px', padding: '30px', position: 'relative', display: 'flex', flexDirection: 'column', gap: '15px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }} onClick={(e) => e.stopPropagation()}>
            
            <button type="button" onClick={() => setEditingTask(null)} style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(31, 41, 55, 0.8)', color: '#fff', border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold' }}>
              ✕
            </button>

            <h3 style={{ margin: '0 0 10px 0', color: '#38bdf8', fontSize: '18px' }}>✏️ تعديل تفاصيل المهمة</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontSize: '12px', color: '#94a3b8' }}>عنوان المهمة</label>
              <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', borderRadius: '10px', color: '#fff', ...inputStyle }} />

              <label style={{ fontSize: '12px', color: '#94a3b8' }}>وصف المهمة</label>
              <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} style={{ background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', borderRadius: '10px', color: '#fff', ...inputStyle }} />

              <label style={{ fontSize: '12px', color: '#94a3b8' }}>تاريخ الاستحقاق</label>
              <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} style={{ background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', borderRadius: '10px', color: '#fff', ...inputStyle }} />

              <label style={{ fontSize: '12px', color: '#94a3b8' }}>القسم المسؤول</label>
              <select value={editDept} onChange={(e) => setEditDept(e.target.value)} style={{ background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', borderRadius: '10px', color: '#fff', ...inputStyle }}>
                <option value="المبيعات">المبيعات</option>
                <option value="الدعم الفني">الدعم الفني</option>
                <option value="التقنية">التقنية</option>
                <option value="الإدارة">الإدارة</option>
              </select>
            </div>

            <button type="button" onClick={handleSaveEdit} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}>
              حفظ التعديلات عبر الخادم ✅
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default Tasks;