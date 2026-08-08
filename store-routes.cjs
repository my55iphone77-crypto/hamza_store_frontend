const express = require('express');

module.exports = function buildStoreRouter(deps) {
  const {
    Product, Order, Support, Mail, Category, NOTIFY_EMAILS, Notification,
    Customer, Transaction, Ticket, Sale, Employee, Achievement, Announcement,
    WorkHour, AttendanceLog, AppState,
    // ✅ موديلات جديدة تمت إضافتها لتغطية الـ endpoints التي كانت
    // ترجع 404 لأنها غير موجودة بالسيرفر أصلاً (settings, salaries, tasks, documents, coupons)
    Settings, Salary, Task, DocumentModel, Coupon,
    mongoose, sendStoreEmail, verifyOwnerMiddleware, bcrypt, crypto,
    io
  } = deps;

  const router = express.Router();

  // ------------------------------------------------------------------
  // 📡 دوال البث اللحظي الفوري — تحديث كل الواجهات فوراً بأجزاء من الثانية
  // ------------------------------------------------------------------
  async function broadcastProducts() {
    if (!io) return;
    try {
      const all = await Product.find().sort({ createdAt: -1 });
      io.emit('UPDATE_DATA', { type: 'PRODUCTS', payload: all });
    } catch (e) {
      console.error('[broadcast] فشل بث المنتجات:', e.message);
    }
  }

  async function broadcastOrders() {
    if (!io) return;
    try {
      const all = await Order.find().sort({ date: -1 });
      io.emit('UPDATE_DATA', { type: 'ORDERS', payload: all });
    } catch (e) {
      console.error('[broadcast] فشل بث الطلبات:', e.message);
    }
  }

  async function broadcastEmployees() {
    if (!io) return;
    try {
      const all = await Employee.find().select('-password').sort({ createdAt: -1 });
      io.emit('UPDATE_DATA', { type: 'EMPLOYEES', payload: all });
    } catch (e) {
      console.error('[broadcast] فشل بث الموظفين:', e.message);
    }
  }

  async function broadcastTickets() {
    if (!io) return;
    try {
      const all = await Ticket.find().sort({ createdAt: -1 });
      io.emit('UPDATE_DATA', { type: 'TICKETS', payload: all });
    } catch (e) {
      console.error('[broadcast] فشل بث التذاكر:', e.message);
    }
  }

  function broadcastRefreshAll() {
    if (!io) return;
    io.emit('UPDATE_DATA', { type: 'REFRESH_ALL' });
  }

  async function broadcastWorkHours() {
    if (!io || !WorkHour) return;
    try {
      const all = await WorkHour.find().sort({ createdAt: -1 });
      io.emit('UPDATE_DATA', { type: 'WORK_HOURS', payload: all });
    } catch (e) {
      console.error('[broadcast] فشل بث سجلات الدوام:', e.message);
    }
  }

  async function broadcastAttendanceLogs() {
    if (!io || !AttendanceLog) return;
    try {
      const all = await AttendanceLog.find().sort({ createdAt: -1 }).limit(300);
      io.emit('UPDATE_DATA', { type: 'ATTENDANCE_LOGS', payload: all.map(l => l.log) });
    } catch (e) {
      console.error('[broadcast] فشل بث سجل الحضور:', e.message);
    }
  }

  async function broadcastTasks() {
    if (!io || !Task) return;
    try {
      const all = await Task.find().sort({ createdAt: -1 });
      io.emit('UPDATE_DATA', { type: 'TASKS', payload: all });
    } catch (e) {
      console.error('[broadcast] فشل بث المهام:', e.message);
    }
  }

  // ------------------------------------------------------------------
  // فحص تلقائي لحدود المخزون (منخفض/ممتلئ) وإرسال التنبيهات
  // ------------------------------------------------------------------
  async function checkStockThresholds(product, oldStock) {
    const newStock = typeof product.stock === 'number' ? product.stock : 0;
    const low = typeof product.lowStockThreshold === 'number' ? product.lowStockThreshold : 3;
    const max = typeof product.maxStockThreshold === 'number' ? product.maxStockThreshold : 50;

    const crossedLow = oldStock > low && newStock <= low;
    const crossedFull = oldStock < max && newStock >= max;

    if (!crossedLow && !crossedFull) return;

    if (crossedLow) {
      await new Notification({
        type: 'low_stock',
        productId: product._id,
        productName: product.name,
        message: `⚠️ مخزون منتج "${product.name}" منخفض — تبقّى ${newStock} فقط (الحد الأدنى: ${low}).`
      }).save();

      for (const email of NOTIFY_EMAILS) {
        sendStoreEmail(
          email,
          `⚠️ مخزون منخفض: ${product.name}`,
          `<h3>تنبيه مخزون منخفض</h3><p>المنتج: <strong>${product.name}</strong></p><p>الكمية المتبقية: <strong>${newStock}</strong></p><p>الحد الأدنى المحدد: ${low}</p>`
        );
      }
    }

    if (crossedFull) {
      await new Notification({
        type: 'full_stock',
        productId: product._id,
        productName: product.name,
        message: `📦 مخزون منتج "${product.name}" وصل الحد الأقصى (${newStock}).`
      }).save();

      for (const email of NOTIFY_EMAILS) {
        sendStoreEmail(
          email,
          `📦 المخزون امتلأ: ${product.name}`,
          `<h3>تنبيه امتلاء المخزون</h3><p>المنتج: <strong>${product.name}</strong></p><p>الكمية الحالية: <strong>${newStock}</strong></p><p>الحد الأقصى المحدد: ${max}</p>`
        );
      }
    }
  }

  // ------------------------------------------------------------------
  // دالة الاتصال الموحدة مع Google Gemini
  // ------------------------------------------------------------------
  async function callGemini({ message, conversationHistory, persona, taskInstruction, data }) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY مفقود بمتغيرات البيئة');
    }

    const botName = (persona && persona.name) || 'المساعد';
    const styleInstructions = (persona && persona.styleInstructions) || '';

    const systemPrompt = [
      `اسمك ${botName}.`,
      styleInstructions,
      taskInstruction ? `المطلوب منك تحديداً بهذا الرد: ${taskInstruction}` : '',
      data ? `بيانات حقيقية اعتمد عليها فقط، بدون اختراع أرقام:\n${JSON.stringify(data)}` : ''
    ].filter(Boolean).join('\n\n');

    const contents = [
      ...(Array.isArray(conversationHistory) ? conversationHistory.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: String(m.text || '') }]
      })) : []),
      { role: 'user', parts: [{ text: message }] }
    ];

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: systemPrompt }] } }),
        signal: AbortSignal.timeout(20000)
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '');
      console.error('[Gemini] error:', geminiRes.status, errBody);
      throw new Error(`Gemini responded with status ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json();
    return geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  // ============================= المنتجات =============================

  router.get('/products', async (req, res) => {
    try {
      const { search } = req.query;
      let query = {};
      if (search && search.trim() !== '') {
        const term = search.toLowerCase();
        query = {
          $or: [
            { name: { $regex: term, $options: 'i' } },
            { description: { $regex: term, $options: 'i' } },
            { category: { $regex: term, $options: 'i' } }
          ]
        };
      }
      const products = await Product.find(query).sort({ createdAt: -1 });
      res.json(products);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب المنتجات' });
    }
  });

  router.post('/products', verifyOwnerMiddleware, async (req, res) => {
    try {
      const body = { ...req.body };
      if ((body.deliveryType === 'code' || body.deliveryType === 'subscription') && Array.isArray(body.codes)) {
        body.stock = body.codes.length;
      }
      const newProduct = new Product(body);
      await newProduct.save();
      await checkStockThresholds(newProduct, 0);
      await broadcastProducts();
      res.json(newProduct);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حفظ المنتج الجديد' });
    }
  });

  router.put('/products/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      const existing = await Product.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'المنتج غير موجود' });

      const oldStock = existing.stock || 0;
      Object.assign(existing, req.body);

      if ((existing.deliveryType === 'code' || existing.deliveryType === 'subscription') && Array.isArray(existing.codes)) {
        existing.stock = existing.codes.length;
      }

      await existing.save();
      await checkStockThresholds(existing, oldStock);
      await broadcastProducts();
      res.json(existing);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث المنتج' });
    }
  });

  router.delete('/products/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      const deleted = await Product.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'المنتج غير موجود' });
      await broadcastProducts();
      res.json({ success: true, message: 'تم حذف المنتج بنجاح' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حذف المنتج' });
    }
  });

  router.patch('/products/:id/status', verifyOwnerMiddleware, async (req, res) => {
    try {
      const { status } = req.body;
      const updated = await Product.findByIdAndUpdate(req.params.id, { status }, { new: true });
      if (!updated) return res.status(404).json({ error: 'المنتج غير موجود' });
      await broadcastProducts();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث الحالة' });
    }
  });

  router.post('/products/:id/codes', verifyOwnerMiddleware, async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });

      const oldStock = product.stock || 0;
      const { code, codes } = req.body;

      if (code) product.codes.push(code);
      if (Array.isArray(codes)) product.codes.push(...codes);

      product.stock = product.codes.length;
      await product.save();
      await checkStockThresholds(product, oldStock);
      await broadcastProducts();
      res.json(product);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في إضافة الكود' });
    }
  });

  router.delete('/products/:id/codes', verifyOwnerMiddleware, async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });

      const oldStock = product.stock || 0;
      const { code } = req.body;
      product.codes = product.codes.filter(c => c !== code);
      product.stock = product.codes.length;

      await product.save();
      await checkStockThresholds(product, oldStock);
      await broadcastProducts();
      res.json(product);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حذف الكود' });
    }
  });

  router.patch('/products/:id/stock', verifyOwnerMiddleware, async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });

      const oldStock = product.stock || 0;
      const { stock } = req.body;
      product.stock = typeof stock === 'number' ? stock : parseInt(stock) || 0;

      await product.save();
      await checkStockThresholds(product, oldStock);
      await broadcastProducts();
      res.json(product);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث الكمية' });
    }
  });

  router.put('/products', verifyOwnerMiddleware, async (req, res) => {
    try {
      const newProducts = req.body;
      await Product.deleteMany({});
      if (Array.isArray(newProducts) && newProducts.length > 0) {
        const cleanedProducts = newProducts.map(({ _id, ...rest }) => rest);
        await Product.insertMany(cleanedProducts);
      }
      await broadcastProducts();
      res.json({ success: true, message: 'تم تحديث وحفظ المنتجات بنجاح' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث المنتجات' });
    }
  });

  // ============================= الفئات =============================

  router.get('/categories', async (req, res) => {
    try {
      const categories = await Category.find().sort({ name: 1 });
      res.json(categories);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب الفئات' });
    }
  });

  router.post('/categories', verifyOwnerMiddleware, async (req, res) => {
    try {
      const name = (req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'اسم الفئة مطلوب' });

      const exists = await Category.findOne({ name });
      if (exists) return res.status(400).json({ error: 'هذه الفئة موجودة أصلاً' });

      const newCategory = new Category({ name });
      await newCategory.save();
      broadcastRefreshAll();
      res.json(newCategory);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في إضافة الفئة' });
    }
  });

  router.delete('/categories/:name', verifyOwnerMiddleware, async (req, res) => {
    try {
      const name = decodeURIComponent(req.params.name);
      await Category.findOneAndDelete({ name });
      await Product.updateMany({ category: name }, { category: 'غير مصنف' });
      await broadcastProducts();
      broadcastRefreshAll();
      res.json({ success: true, message: 'تم حذف الفئة ونقل منتجاتها إلى (غير مصنف)' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حذف الفئة' });
    }
  });

  // ============================= العملاء =============================

  router.get('/customers', verifyOwnerMiddleware, async (req, res) => {
    try {
      const customers = await Customer.find().sort({ createdAt: -1 });
      res.json(customers);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب العملاء' });
    }
  });

  router.post('/customers', verifyOwnerMiddleware, async (req, res) => {
    try {
      const { name, email, phone, image } = req.body;
      if (!name || !email || !phone) return res.status(400).json({ error: 'بيانات ناقصة' });
      const newCustomer = new Customer({ name, email, phone, image });
      await newCustomer.save();
      broadcastRefreshAll();
      res.json(newCustomer);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في إضافة العميل' });
    }
  });

  router.put('/customers/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      const updated = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updated) return res.status(404).json({ error: 'العميل غير موجود' });
      broadcastRefreshAll();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث العميل' });
    }
  });

  router.delete('/customers/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      await Customer.findByIdAndDelete(req.params.id);
      broadcastRefreshAll();
      res.json({ success: true, message: 'تم حذف العميل' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حذف العميل' });
    }
  });

  // ============================= الموظفون =============================

  router.get('/employees', verifyOwnerMiddleware, async (req, res) => {
    try {
      const employees = await Employee.find().select('-password').sort({ createdAt: -1 });
      res.json({ success: true, employees });
    } catch (err) {
      res.status(500).json({ success: false, error: 'خطأ في جلب الموظفين' });
    }
  });

  router.post('/employees', verifyOwnerMiddleware, async (req, res) => {
    try {
      const body = { ...req.body };
      const rawPassword = body.password && body.password.trim() ? body.password : crypto.randomBytes(9).toString('hex');
      body.password = await bcrypt.hash(rawPassword, 10);
      if (!body.hireDate) body.hireDate = new Date().toISOString().split('T')[0];

      const newEmployee = new Employee(body);
      await newEmployee.save();

      const { password, ...safeEmployee } = newEmployee.toObject();
      await broadcastEmployees();
      res.json({ success: true, employee: safeEmployee });
    } catch (err) {
      res.status(400).json({ success: false, error: 'فشل إضافة الموظف (ربما البريد مستخدم مسبقاً)' });
    }
  });

  router.put('/employees/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.password && body.password.trim() !== '') {
        body.password = await bcrypt.hash(body.password, 10);
      } else {
        delete body.password;
      }
      const updated = await Employee.findByIdAndUpdate(req.params.id, body, { new: true }).select('-password');
      if (!updated) return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
      await broadcastEmployees();
      res.json({ success: true, employee: updated });
    } catch (err) {
      res.status(400).json({ success: false, error: 'فشل تحديث بيانات الموظف' });
    }
  });

  router.delete('/employees/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      const deleted = await Employee.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
      await broadcastEmployees();
      res.json({ success: true, message: 'تم حذف الموظف بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: 'فشل حذف الموظف' });
    }
  });

  // ============================= الإنجازات =============================

  router.get('/achievements', verifyOwnerMiddleware, async (req, res) => {
    try {
      const achievements = await Achievement.find().sort({ date: -1 });
      res.json(achievements);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب الإنجازات' });
    }
  });

  router.post('/achievements', verifyOwnerMiddleware, async (req, res) => {
    try {
      const { title, description } = req.body;
      if (!title || !description) return res.status(400).json({ error: 'بيانات ناقصة' });
      const newAchievement = new Achievement({ title, description });
      await newAchievement.save();
      broadcastRefreshAll();
      res.json(newAchievement);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حفظ الإنجاز' });
    }
  });

  router.put('/achievements/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      const updated = await Achievement.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updated) return res.status(404).json({ error: 'الإنجاز غير موجود' });
      broadcastRefreshAll();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث الإنجاز' });
    }
  });

  router.delete('/achievements/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      await Achievement.findByIdAndDelete(req.params.id);
      broadcastRefreshAll();
      res.json({ success: true, message: 'تم حذف الإنجاز' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حذف الإنجاز' });
    }
  });

  // ============================= الإعلانات =============================

  router.get('/announcements', verifyOwnerMiddleware, async (req, res) => {
    try {
      const announcements = await Announcement.find().sort({ date: -1 });
      res.json(announcements);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب الإعلانات' });
    }
  });

  router.post('/announcements', verifyOwnerMiddleware, async (req, res) => {
    try {
      const { title, message, audience } = req.body;
      if (!title || !message) return res.status(400).json({ error: 'بيانات ناقصة' });
      const newAnnouncement = new Announcement({ title, message, audience: audience || 'employees' });
      await newAnnouncement.save();
      broadcastRefreshAll();
      res.json(newAnnouncement);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في نشر الإعلان' });
    }
  });

  router.delete('/announcements/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      await Announcement.findByIdAndDelete(req.params.id);
      broadcastRefreshAll();
      res.json({ success: true, message: 'تم حذف الإعلان' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حذف الإعلان' });
    }
  });

  // ============================= المحاسبة =============================

  router.get('/accounting/transactions', verifyOwnerMiddleware, async (req, res) => {
    try {
      const transactions = await Transaction.find().sort({ date: -1 });
      res.json(transactions);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب المعاملات المالية' });
    }
  });

  router.post('/accounting/transactions', verifyOwnerMiddleware, async (req, res) => {
    try {
      const { type, amount, description } = req.body;
      if (!type || !amount || !description) return res.status(400).json({ error: 'بيانات ناقصة' });
      const newTransaction = new Transaction({ type, amount, description });
      await newTransaction.save();
      broadcastRefreshAll();
      res.json(newTransaction);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حفظ المعاملة المالية' });
    }
  });

  router.delete('/accounting/transactions/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      await Transaction.findByIdAndDelete(req.params.id);
      broadcastRefreshAll();
      res.json({ success: true, message: 'تم حذف المعاملة المالية' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حذف المعاملة المالية' });
    }
  });

  // ============================= تذاكر الدعم الداخلي =============================

  router.get('/tickets', verifyOwnerMiddleware, async (req, res) => {
    try {
      const tickets = await Ticket.find().sort({ createdAt: -1 });
      res.json(tickets);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب التذاكر' });
    }
  });

  router.post('/tickets', verifyOwnerMiddleware, async (req, res) => {
    try {
      const newTicket = new Ticket(req.body);
      await newTicket.save();
      await broadcastTickets();
      res.json(newTicket);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في إنشاء التذكرة' });
    }
  });

  router.patch('/tickets/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      const updated = await Ticket.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updated) return res.status(404).json({ error: 'التذكرة غير موجودة' });
      await broadcastTickets();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث التذكرة' });
    }
  });

  router.delete('/tickets/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      await Ticket.findByIdAndDelete(req.params.id);
      await broadcastTickets();
      res.json({ success: true, message: 'تم حذف التذكرة' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حذف التذكرة' });
    }
  });

  // ============================= سجل المبيعات اليدوي =============================

  router.get('/sales', verifyOwnerMiddleware, async (req, res) => {
    try {
      const sales = await Sale.find().sort({ createdAt: -1 });
      res.json(sales);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب المبيعات' });
    }
  });

  router.post('/sales', verifyOwnerMiddleware, async (req, res) => {
    try {
      const newSale = new Sale(req.body);
      await newSale.save();
      broadcastRefreshAll();
      res.json(newSale);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حفظ عملية البيع' });
    }
  });

  router.put('/sales/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      const updated = await Sale.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updated) return res.status(404).json({ error: 'العملية غير موجودة' });
      broadcastRefreshAll();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث عملية البيع' });
    }
  });

  router.delete('/sales/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      await Sale.findByIdAndDelete(req.params.id);
      broadcastRefreshAll();
      res.json({ success: true, message: 'تم حذف عملية البيع' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حذف عملية البيع' });
    }
  });

  // ============================= الطلبات =============================

  router.post('/orders', async (req, res) => {
    try {
      const { customerName, customerEmail, customerAddress, items, totalAmount } = req.body;

      if (!items || items.length === 0) {
        return res.status(400).json({ error: 'السلة فارغة.' });
      }

      for (let cartItem of items) {
        const prodId = cartItem.id || cartItem._id;
        if (mongoose.Types.ObjectId.isValid(prodId)) {
          const product = await Product.findById(prodId);
          if (!product || product.stock < cartItem.quantity) {
            return res.status(400).json({ error: 'عذراً، الكمية غير كافية أو المنتج نفد.' });
          }
        }
      }

      for (let cartItem of items) {
        const prodId = cartItem.id || cartItem._id;
        if (mongoose.Types.ObjectId.isValid(prodId)) {
          const product = await Product.findById(prodId);
          const oldStock = product.stock || 0;

          if ((product.deliveryType === 'code' || product.deliveryType === 'subscription') && Array.isArray(product.codes)) {
            product.codes.splice(0, cartItem.quantity);
            product.stock = product.codes.length;
          } else {
            product.stock = Math.max(0, oldStock - cartItem.quantity);
          }

          await product.save();
          await checkStockThresholds(product, oldStock);
        }
      }

      const newOrder = new Order({ customerName, customerEmail, customerAddress, items, totalAmount });
      await newOrder.save();

      await broadcastProducts();
      await broadcastOrders();

      sendStoreEmail(
        customerEmail,
        'تأكيد طلبك من متجر حمزة',
        `<h3>مرحباً ${customerName}،</h3><p>تم استلام طلبك بنجاح وجاري تجهيزه.</p><p>المبلغ الإجمالي: ${totalAmount}</p>`
      );

      res.json({ success: true, message: 'تم إتمام الطلب بنجاح', order: newOrder });
    } catch (err) {
      res.status(500).json({ error: 'حدث خطأ أثناء معالجة الطلب' });
    }
  });

  router.get('/orders', verifyOwnerMiddleware, async (req, res) => {
    try {
      const orders = await Order.find().sort({ date: -1 });
      res.json(orders);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب الطلبات' });
    }
  });

  // ✅ endpoint ناقص كان الفرونت إند (Storefront.js) يستدعيه لتتبع طلب معيّن
  // برقمه: GET /orders/:id — بدونه كان الطلب يفشل بـ 404 عند "تتبع الطلب"
  router.get('/orders/:id', async (req, res) => {
    try {
      const order = await Order.findById(req.params.id).catch(() => null);
      if (!order) return res.status(404).json({ error: 'لم يتم العثور على طلب بهذا الرقم' });
      res.json(order);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب حالة الطلب' });
    }
  });

  // ============================= الدعم الفني (الزبون) =============================

  router.post('/support', async (req, res) => {
    try {
      const { customerName, customerEmail, phone, location, issue } = req.body;

      if (!customerName || !issue || !customerEmail) {
        return res.status(400).json({ error: 'يرجى إدخال البيانات والبريد الإلكتروني المطلوبة.' });
      }

      const newRequest = new Support({
        customerName,
        customerEmail: customerEmail.trim().toLowerCase(),
        phone,
        location,
        issue,
        status: 'قيد المراجعة',
        reply: ''
      });

      await newRequest.save();
      broadcastRefreshAll();

      sendStoreEmail(
        customerEmail,
        'تم استلام بلاغك بنجاح',
        `<h3>مرحباً ${customerName}،</h3><p>لقد تلقينا بلاغك وسنقوم بمراجعته والرد عليك في أقرب وقت.</p>`
      );

      res.json({ success: true, message: 'تم إرسال البلاغ بنجاح', request: newRequest });
    } catch (err) {
      res.status(500).json({ error: 'حدث خطأ أثناء إرسال البلاغ' });
    }
  });

  router.get('/support/customer', async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: 'البريد الإلكتروني مطلوب.' });
      const tickets = await Support.find({ customerEmail: email.trim().toLowerCase() }).sort({ date: -1 });
      res.json(tickets);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب حالة البلاغات' });
    }
  });

  // ============================= طلبات/شكاوى خدمة العملاء (الموظف) =============================

  router.get('/requests', verifyOwnerMiddleware, async (req, res) => {
    try {
      const requests = await Support.find().sort({ date: -1 });
      res.json(requests);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب طلبات الدعم' });
    }
  });

  router.post('/requests', verifyOwnerMiddleware, async (req, res) => {
    try {
      const newRequest = new Support(req.body);
      await newRequest.save();
      broadcastRefreshAll();
      res.json(newRequest);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في إنشاء الطلب' });
    }
  });

  router.patch('/requests/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      const updated = await Support.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updated) return res.status(404).json({ error: 'الطلب غير موجود' });
      broadcastRefreshAll();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث الطلب' });
    }
  });

  router.put('/requests', verifyOwnerMiddleware, async (req, res) => {
    try {
      const newReqs = req.body;
      await Support.deleteMany({});
      if (Array.isArray(newReqs) && newReqs.length > 0) {
        const cleanedReqs = newReqs.map(({ _id, ...rest }) => rest);
        await Support.insertMany(cleanedReqs);
      }
      broadcastRefreshAll();
      res.json({ success: true, message: 'تم تحديث الطلبات بنجاح' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث الطلبات' });
    }
  });

  // ============================= المعاملات (طلبات المتجر القديمة) =============================

  router.get('/transactions', verifyOwnerMiddleware, async (req, res) => {
    try {
      const orders = await Order.find().sort({ date: -1 });
      res.json(orders);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب المعاملات' });
    }
  });

  router.put('/transactions', verifyOwnerMiddleware, async (req, res) => {
    try {
      const newTrans = req.body;
      await Order.deleteMany({});
      if (Array.isArray(newTrans) && newTrans.length > 0) {
        const cleanedTrans = newTrans.map(({ _id, ...rest }) => rest);
        await Order.insertMany(cleanedTrans);
      }
      await broadcastOrders();
      res.json({ success: true, message: 'تم تحديث المعاملات بنجاح' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث المعاملات' });
    }
  });

  // ============================= البريد الداخلي/الخارجي =============================

  router.get('/mails', verifyOwnerMiddleware, async (req, res) => {
    try {
      const mails = await Mail.find().sort({ date: -1 });
      res.json(mails);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب الرسائل' });
    }
  });

  router.put('/mails', verifyOwnerMiddleware, async (req, res) => {
    try {
      const newMails = req.body;
      await Mail.deleteMany({});
      if (Array.isArray(newMails) && newMails.length > 0) {
        const cleanedMails = newMails.map(({ _id, ...rest }) => rest);
        await Mail.insertMany(cleanedMails);
      }
      broadcastRefreshAll();
      res.json({ success: true, message: 'تم تحديث البريد بنجاح' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث البريد' });
    }
  });

  router.post('/mails', verifyOwnerMiddleware, async (req, res) => {
    try {
      Object.assign(req.body, { role: 'owner', isOwner: true });
      const newMail = new Mail(req.body);
      await newMail.save();
      broadcastRefreshAll();
      res.json(newMail);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في إرسال البريد' });
    }
  });

  router.post('/sendExternalMail', verifyOwnerMiddleware, async (req, res) => {
    try {
      const { to, subject, body } = req.body;
      if (!to || !subject) return res.status(400).json({ error: 'بيانات البريد ناقصة' });
      const sent = await sendStoreEmail(to, subject, `<div style="direction:rtl;font-family:Tajawal,sans-serif;">${body || ''}</div>`);
      res.json({ success: sent });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في إرسال البريد الخارجي' });
    }
  });

  // ============================= مساعد AiBot والصلاحيات =============================

  router.post('/verifyManagerAccess', verifyOwnerMiddleware, async (req, res) => {
    res.json({ allowed: true });
  });

  router.post('/notifyManager', verifyOwnerMiddleware, async (req, res) => {
    try {
      const { reason, text } = req.body;
      for (const email of NOTIFY_EMAILS) {
        sendStoreEmail(email, `🚨 تنبيه إداري: ${reason || 'غير محدد'}`, `<p>${text || ''}</p>`);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في إرسال التنبيه' });
    }
  });

  router.post('/notifyManagerFromCustomer', async (req, res) => {
    try {
      const { reason, text, customer } = req.body;
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'نص الشكوى مطلوب' });
      }
      for (const email of NOTIFY_EMAILS) {
        sendStoreEmail(
          email,
          `🚨 شكوى زبون: ${reason || 'غير محدد'}`,
          `<h3>🚨 شكوى زبون تحتاج متابعة</h3><p>${text}</p>${customer ? `<p>معرّف الزبون: ${customer}</p>` : ''}`
        );
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في إرسال التنبيه' });
    }
  });

  // ============================= ساعات الدوام (WorkHours.js) =============================

  router.get('/work-hours', verifyOwnerMiddleware, async (req, res) => {
    try {
      const records = await WorkHour.find().sort({ createdAt: -1 });
      res.json(records);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب سجلات الدوام' });
    }
  });

  router.post('/work-hours', verifyOwnerMiddleware, async (req, res) => {
    try {
      const { name, department, date, start, end } = req.body;
      if (!name || !department || !date || !start || !end) {
        return res.status(400).json({ error: 'بيانات ناقصة' });
      }
      const record = new WorkHour({ name, department, date, start, end });
      await record.save();
      await broadcastWorkHours();
      res.json(record);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حفظ سجل الدوام' });
    }
  });

  router.delete('/work-hours/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      const deleted = await WorkHour.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'السجل غير موجود' });
      await broadcastWorkHours();
      res.json({ success: true, message: 'تم حذف السجل' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حذف السجل' });
    }
  });

  // ============================= الحضور والانصراف (Attendance.js) =============================

  router.post('/employees/:id/check-in', verifyOwnerMiddleware, async (req, res) => {
    try {
      const employee = await Employee.findById(req.params.id);
      if (!employee) return res.status(404).json({ error: 'الموظف غير موجود' });
      employee.attendanceStatus = 'حاضر';
      employee.lastCheckIn = req.body.checkIn || new Date().toISOString();
      await employee.save();
      await broadcastEmployees();
      res.json({ success: true, employee });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تسجيل الحضور' });
    }
  });

  router.post('/employees/:id/check-out', verifyOwnerMiddleware, async (req, res) => {
    try {
      const employee = await Employee.findById(req.params.id);
      if (!employee) return res.status(404).json({ error: 'الموظف غير موجود' });
      employee.attendanceStatus = 'غادر';
      employee.lastCheckOut = req.body.checkOut || new Date().toISOString();
      await employee.save();
      await broadcastEmployees();
      res.json({ success: true, employee });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تسجيل الانصراف' });
    }
  });

  router.get('/attendance-logs', verifyOwnerMiddleware, async (req, res) => {
    try {
      const logs = await AttendanceLog.find().sort({ createdAt: -1 }).limit(300);
      res.json(logs.map(l => l.log));
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب سجل الأحداث' });
    }
  });

  router.post('/attendance-logs', verifyOwnerMiddleware, async (req, res) => {
    try {
      const { log } = req.body;
      if (!log || typeof log !== 'string' || !log.trim()) {
        return res.status(400).json({ error: 'نص السجل مطلوب' });
      }
      const newLog = new AttendanceLog({ log: log.trim() });
      await newLog.save();
      await broadcastAttendanceLogs();
      res.json({ log: newLog.log });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حفظ السجل' });
    }
  });

  
// ✅ endpoints إضافية — كان الفرونت يطلب /attendance ويرجع 404
// (Attendance.js يستخدم /attendance وليس /attendance-logs)

router.get('/attendance', verifyOwnerMiddleware, async (req, res) => {
  try {
    const logs = await AttendanceLog.find().sort({ createdAt: -1 }).limit(300);
    res.json(logs.map(l => l.log));
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب سجل الحضور' });
  }
});

router.post('/attendance', verifyOwnerMiddleware, async (req, res) => {
  try {
    const { log } = req.body;
    if (!log || typeof log !== 'string' || !log.trim()) {
      return res.status(400).json({ error: 'نص السجل مطلوب' });
    }
    const newLog = new AttendanceLog({ log: log.trim() });
    await newLog.save();
    await broadcastAttendanceLogs();
    res.json({ log: newLog.log });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في حفظ السجل' });
  }
});

// ============================= الإعدادات العامة (AppContext.js -> /settings) =============================
  // ✅ endpoint جديد بالكامل — كان مفقوداً من السيرفر خالصاً وهذا سبب 404 المتكرر
  // على /api/settings بالـ Console. نستخدم نمط Singleton: وثيقة واحدة فقط دائماً.

  router.get('/settings', verifyOwnerMiddleware, async (req, res) => {
    try {
      let settings = await Settings.findOne();
      if (!settings) {
        settings = await new Settings({}).save(); // إنشاء وثيقة افتراضية أول مرة
      }
      res.json(settings);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب الإعدادات' });
    }
  });

  router.put('/settings', verifyOwnerMiddleware, async (req, res) => {
    try {
      let settings = await Settings.findOne();
      if (!settings) {
        settings = new Settings(req.body);
      } else {
        Object.assign(settings, req.body);
      }
      await settings.save();
      broadcastRefreshAll();
      res.json(settings);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث الإعدادات' });
    }
  });

  // ============================= الرواتب (AppContext.js -> /salaries) =============================
  // ✅ endpoint جديد بالكامل — كان مفقوداً وهذا سبب 404 على /api/salaries

  router.get('/salaries', verifyOwnerMiddleware, async (req, res) => {
    try {
      const salaries = await Salary.find().sort({ date: -1 });
      res.json(salaries);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب الرواتب' });
    }
  });

  router.post('/salaries', verifyOwnerMiddleware, async (req, res) => {
    try {
      const { employeeName, amount } = req.body;
      if (!employeeName || !amount) return res.status(400).json({ error: 'بيانات ناقصة' });
      const newSalary = new Salary(req.body);
      await newSalary.save();
      broadcastRefreshAll();
      res.json(newSalary);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حفظ الراتب' });
    }
  });

  router.put('/salaries/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      const updated = await Salary.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updated) return res.status(404).json({ error: 'السجل غير موجود' });
      broadcastRefreshAll();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث الراتب' });
    }
  });

  router.delete('/salaries/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      await Salary.findByIdAndDelete(req.params.id);
      broadcastRefreshAll();
      res.json({ success: true, message: 'تم حذف سجل الراتب' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حذف الراتب' });
    }
  });

  // ============================= المهام الداخلية (AppContext.js -> /tasks) =============================
  // ✅ endpoint جديد بالكامل — كان مفقوداً وهذا سبب 404 على /api/tasks

  router.get('/tasks', verifyOwnerMiddleware, async (req, res) => {
    try {
      const tasks = await Task.find().sort({ createdAt: -1 });
      res.json(tasks);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب المهام' });
    }
  });

  router.post('/tasks', verifyOwnerMiddleware, async (req, res) => {
    try {
      const { title } = req.body;
      if (!title) return res.status(400).json({ error: 'عنوان المهمة مطلوب' });
      const newTask = new Task(req.body);
      await newTask.save();
      await broadcastTasks();
      res.json(newTask);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في إنشاء المهمة' });
    }
  });

  router.put('/tasks/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      const updated = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updated) return res.status(404).json({ error: 'المهمة غير موجودة' });
      await broadcastTasks();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث المهمة' });
    }
  });

  router.delete('/tasks/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      await Task.findByIdAndDelete(req.params.id);
      await broadcastTasks();
      res.json({ success: true, message: 'تم حذف المهمة' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حذف المهمة' });
    }
  });

  // ============================= الوثائق/المستندات (AppContext.js -> /documents) =============================
  // ✅ endpoint جديد بالكامل — كان مفقوداً وهذا سبب 404 على /api/documents

  router.get('/documents', verifyOwnerMiddleware, async (req, res) => {
    try {
      const documents = await DocumentModel.find().sort({ createdAt: -1 });
      res.json(documents);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب الوثائق' });
    }
  });

  router.post('/documents', verifyOwnerMiddleware, async (req, res) => {
    try {
      const { title } = req.body;
      if (!title) return res.status(400).json({ error: 'عنوان الوثيقة مطلوب' });
      const newDoc = new DocumentModel(req.body);
      await newDoc.save();
      broadcastRefreshAll();
      res.json(newDoc);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حفظ الوثيقة' });
    }
  });

  router.delete('/documents/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      await DocumentModel.findByIdAndDelete(req.params.id);
      broadcastRefreshAll();
      res.json({ success: true, message: 'تم حذف الوثيقة' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حذف الوثيقة' });
    }
  });

  // ============================= الكوبونات (Coupons.js -> /coupons) =============================
  // ✅ endpoint جديد بالكامل — كان مفقوداً وهذا سبب 404 على /api/coupons

  router.get('/coupons', verifyOwnerMiddleware, async (req, res) => {
    try {
      const coupons = await Coupon.find().sort({ createdAt: -1 });
      res.json(coupons);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب الكوبونات' });
    }
  });

  router.post('/coupons', verifyOwnerMiddleware, async (req, res) => {
    try {
      const { code, discount, expiry, maxUsage } = req.body;
      if (!code || !discount || !expiry || !maxUsage) {
        return res.status(400).json({ error: 'بيانات ناقصة' });
      }
      const newCoupon = new Coupon(req.body);
      await newCoupon.save();
      broadcastRefreshAll();
      res.json(newCoupon);
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(400).json({ error: 'كود الكوبون مستخدم مسبقاً' });
      }
      res.status(500).json({ error: 'خطأ في إضافة الكوبون' });
    }
  });

  router.put('/coupons/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      const updated = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updated) return res.status(404).json({ error: 'الكوبون غير موجود' });
      broadcastRefreshAll();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'خطأ في تحديث الكوبون' });
    }
  });

  router.delete('/coupons/:id', verifyOwnerMiddleware, async (req, res) => {
    try {
      await Coupon.findByIdAndDelete(req.params.id);
      broadcastRefreshAll();
      res.json({ success: true, message: 'تم حذف الكوبون' });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حذف الكوبون' });
    }
  });

  // ============================= تخزين عام key-value (useSyncedState) =============================

  router.get('/state/:key', verifyOwnerMiddleware, async (req, res) => {
    try {
      const doc = await AppState.findOne({ key: req.params.key });
      if (!doc) return res.status(404).json({ error: 'غير موجود' });
      res.json({ value: doc.value });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في جلب الحالة' });
    }
  });

  router.put('/state/:key', verifyOwnerMiddleware, async (req, res) => {
    try {
      const { value } = req.body;
      const updated = await AppState.findOneAndUpdate(
        { key: req.params.key },
        { key: req.params.key, value },
        { new: true, upsert: true }
      );
      if (io) io.emit('STATE_UPDATE', { key: req.params.key, value: updated.value });
      res.json({ value: updated.value });
    } catch (err) {
      res.status(500).json({ error: 'خطأ في حفظ الحالة' });
    }
  });

  // ============================= بوت ذكاء اصطناعي للزبائن (Customer AI Chat) =============================

  router.post('/customerAiChat', async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'الرسالة مطلوبة' });
      }
      const reply = await callGemini(req.body);
      res.json({ reply: reply || 'ما قدرت أفكر برد مناسب هلق، جرب تسأل بشكل تاني.' });
    } catch (err) {
      console.error('[customerAiChat] failed:', err?.message || err);
      res.status(503).json({ error: 'تعذر الاتصال بخدمة الذكاء الاصطناعي حالياً، حاول لاحقاً.' });
    }
  });

  return router;
};
