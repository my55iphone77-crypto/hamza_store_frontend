require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const nodemailer = require('nodemailer');
const passport = require('passport');
const Groq = require('groq-sdk');
const http = require('http'); // 🔌 مكتبة الاتصال المباشر للـ WebSocket
const { Server } = require('socket.io'); // 🔌 استيراد Socket.IO

const buildAuthCoreRouter = require('./auth-core.cjs');
const buildAuthSocialRouter = require('./auth-social.cjs');
const buildStoreRouter = require('./store-routes.cjs');

const app = express();
app.set('trust proxy', 1);

// 🔌 إعداد خادم الـ HTTP وربطه مع Express و Socket.IO لتزامن جزء من الثانية
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] },
  transports: ['websocket', 'polling'], // إجبار الاتصال على أسرع وسيلة نقل
  pingTimeout: 60000,
  pingInterval: 25000
});

// حفظ الـ io في الـ app ليتم استخدامها داخل الـ Routes عند إضافة أو حذف قسم/منتج
app.set('io', io);

io.on('connection', (socket) => {
  console.log('⚡ User connected for live sync:', socket.id);

  // استقبال أي حدث تحديث يدوي وبثه فوراً لكل العملاء المتصلين
  socket.on('TRIGGER_UPDATE', (data) => {
    io.emit('UPDATE_DATA', data || { type: 'REFRESH_ALL', timestamp: Date.now() });
  });

  socket.on('disconnect', () => {
    // console.log('User disconnected:', socket.id);
  });
});

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET missing');
  process.exit(1);
}

const FRONTEND_URL = process.env.FRONTEND_URL;
if (!FRONTEND_URL) {
  console.error('FRONTEND_URL missing');
  process.exit(1);
}

const OWNER_EMAIL = (process.env.OWNER_EMAIL || '').trim();
if (!OWNER_EMAIL) {
  console.error('OWNER_EMAIL missing');
  process.exit(1);
}

const APP_NAME = process.env.APP_NAME || 'متجر حمزة';

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

if (!SMTP_USER || !SMTP_PASS) {
  console.error('SMTP_USER/SMTP_PASS missing');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
});

async function sendStoreEmail(toEmail, subject, htmlContent) {
  try {
    const info = await transporter.sendMail({
      from: `"متجر حمزة" <${SMTP_FROM}>`,
      to: toEmail,
      subject,
      html: htmlContent
    });
    console.log('email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('email error:', error);
    return false;
  }
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS blocked'));
    }
  },
  credentials: true
}));

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI missing');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB error:', err));

mongoose.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

// ------------------------------------------------------------------
// نماذج قاعدة البيانات (Schemas & Models)
// ------------------------------------------------------------------
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, default: 'عام' },
  price: { type: Number, required: true },
  discountPrice: { type: Number },
  image: { type: String },
  status: { type: String, default: 'منشور' },
  scheduledDate: { type: Date },
  deliveryType: { type: String, enum: ['code', 'id_topup', 'subscription'], default: 'code' },
  codes: [{ type: String }],
  stock: { type: Number, default: 0 },
  lowStockThreshold: { type: Number, default: 3 },
  maxStockThreshold: { type: Number, default: 50 },
  description: { type: String }
}, { strict: false, timestamps: true });
const Product = mongoose.model('Product', productSchema);

const orderSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true },
  customerAddress: { type: String, required: true },
  items: [{ id: String, name: String, price: Number, quantity: Number }],
  totalAmount: { type: Number, required: true },
  date: { type: Date, default: Date.now }
}, { strict: false });
const Order = mongoose.model('Order', orderSchema);

const supportSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  customerEmail: { type: String },
  phone: { type: String },
  location: { type: String },
  issue: { type: String, required: true },
  reply: { type: String, default: '' },
  status: { type: String, default: 'قيد المراجعة' },
  date: { type: Date, default: Date.now }
}, { strict: false });
const Support = mongoose.model('Support', supportSchema);

const mailSchema = new mongoose.Schema({
  title: String,
  message: String,
  date: { type: Date, default: Date.now }
}, { strict: false });
const Mail = mongoose.model('Mail', mailSchema);

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true }
}, { timestamps: true });
const Category = mongoose.model('Category', categorySchema);

const NOTIFY_EMAILS = (process.env.NOTIFY_EMAILS || OWNER_EMAIL)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const notificationSchema = new mongoose.Schema({
  type: { type: String, enum: ['low_stock', 'full_stock'], required: true },
  productId: { type: String },
  productName: { type: String },
  message: { type: String },
  read: { type: Boolean, default: false },
  date: { type: Date, default: Date.now }
});
const Notification = mongoose.model('Notification', notificationSchema);

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  image: { type: String }
}, { strict: false, timestamps: true });
const Customer = mongoose.model('Customer', customerSchema);

const transactionSchema = new mongoose.Schema({
  type: { type: String, enum: ['income', 'expense'], required: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  date: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', transactionSchema);

const ticketSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  status: { type: String, default: 'مفتوحة' },
  priority: { type: String, default: 'متوسطة' },
  department: { type: String, default: 'الدعم الفني' },
  assignedTo: { type: String, default: '' },
  date: { type: String }
}, { timestamps: true });
const Ticket = mongoose.model('Ticket', ticketSchema);

const saleSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  product: { type: String, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  total: { type: Number, required: true },
  date: { type: String }
}, { timestamps: true });
const Sale = mongoose.model('Sale', saleSchema);

const achievementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  date: { type: Date, default: Date.now }
}, { timestamps: true });
const Achievement = mongoose.model('Achievement', achievementSchema);

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  audience: { type: String, default: 'employees' },
  date: { type: Date, default: Date.now }
}, { timestamps: true });
const Announcement = mongoose.model('Announcement', announcementSchema);

const userSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, default: 'customer' },
  isOwner: { type: Boolean, default: false },
  emailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String },
  emailVerificationExpires: { type: Date },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String },
  twoFactorTempSecret: { type: String },
  googleId: { type: String },
  facebookId: { type: String },
  appleId: { type: String },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  date: { type: Date, default: Date.now }
}, { strict: false });
const User = mongoose.model('User', userSchema);

const EmployeeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'manager', 'stock'], default: 'stock' },
  salary: { type: Number, default: 0 },
  phone: { type: String, default: 'غير متوفر' },
  age: { type: String, default: 'غير متوفر' },
  nationalId: { type: String, default: 'غير متوفر' },
  idCardImage: { type: String, default: '' },
  bankAccount: { type: String, default: 'غير متوفر' },
  image: { type: String, default: '' },
  hireDate: { type: String },
  status: { type: String, default: 'نشط' },
  isActive: { type: Boolean, default: true },
  // 🆕 حقول الحضور والانصراف (تُستخدم من Attendance.js)
  attendanceStatus: { type: String, default: '' },
  lastCheckIn: { type: String, default: '' },
  lastCheckOut: { type: String, default: '' }
}, { timestamps: true, strict: false });
const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema);

// 🆕 موديل سجلات ساعات الدوام (مستخدم من WorkHours.js)
// ملاحظة: هذا الموديل كان يُستورد بملف store-routes.cjs (WorkHour) لكنه لم يكن
// مُعرّفاً هنا ولا يتم تمريره، فكانت كل الطلبات لـ /api/work-hours ترجع 500
// بسبب استدعاء .find() على متغيّر undefined.
const workHourSchema = new mongoose.Schema({
  name: { type: String, required: true },
  department: { type: String, required: true },
  date: { type: String, required: true },
  start: { type: String, required: true },
  end: { type: String, required: true }
}, { timestamps: true });
const WorkHour = mongoose.model('WorkHour', workHourSchema);

// 🆕 موديل سجل أحداث الحضور والانصراف (مستخدم من Attendance.js)
// نفس المشكلة: AttendanceLog كان undefined بملف store-routes.cjs
const attendanceLogSchema = new mongoose.Schema({
  log: { type: String, required: true }
}, { timestamps: true });
const AttendanceLog = mongoose.model('AttendanceLog', attendanceLogSchema);

// 🆕 موديل تخزين عام key-value (يستخدمه أي Hook زي useSyncedState)
const appStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed
}, { timestamps: true });
const AppState = mongoose.model('AppState', appStateSchema);

// 🆕 موديل الإعدادات العامة للمتجر (مستخدم من AppContext.js -> /api/settings)
// وثيقة واحدة فقط (Singleton) تُحفظ فيها كل إعدادات النظام العامة.
const settingsSchema = new mongoose.Schema({
  storeName: { type: String, default: 'متجر حمزة' },
  currency: { type: String, default: 'JOD' },
  maintenanceMode: { type: Boolean, default: false },
  contactEmail: { type: String, default: '' },
  contactPhone: { type: String, default: '' }
}, { strict: false, timestamps: true });
const Settings = mongoose.model('Settings', settingsSchema);

// 🆕 موديل الرواتب (مستخدم من AppContext.js -> /api/salaries)
const salarySchema = new mongoose.Schema({
  employeeId: { type: String },
  employeeName: { type: String, required: true },
  amount: { type: Number, required: true },
  month: { type: String },
  status: { type: String, default: 'قيد الانتظار' },
  date: { type: Date, default: Date.now }
}, { timestamps: true });
const Salary = mongoose.model('Salary', salarySchema);

// 🆕 موديل المهام الداخلية (مستخدم من AppContext.js -> /api/tasks)
const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  assignedTo: { type: String, default: '' },
  status: { type: String, default: 'قيد التنفيذ' },
  dueDate: { type: String, default: '' },
  date: { type: Date, default: Date.now }
}, { timestamps: true });
const Task = mongoose.model('Task', taskSchema);

// 🆕 موديل الوثائق/المستندات (مستخدم من AppContext.js -> /api/documents)
// تسميته DocumentModel لتجنّب التعارض مع كائن Document المدمج بلغة جافاسكريبت
const documentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  fileUrl: { type: String, default: '' },
  category: { type: String, default: 'عام' },
  date: { type: Date, default: Date.now }
}, { timestamps: true });
const DocumentModel = mongoose.model('Document', documentSchema);

// 🆕 موديل الكوبونات (مستخدم من Coupons.js -> /api/coupons)
const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  discount: { type: Number, required: true },
  audience: { type: String, default: 'customers' },
  expiry: { type: Date, required: true },
  date: { type: String },
  usageCount: { type: Number, default: 0 },
  users: [{ type: String }],
  maxUsage: { type: Number, default: 1 }
}, { timestamps: true });
const Coupon = mongoose.model('Coupon', couponSchema);

const checkOwnerAccess = (email) => {
  return OWNER_EMAIL && email && email.trim().toLowerCase() === OWNER_EMAIL.toLowerCase();
};

const getUserFromAuthHeader = async (authHeader) => {
  if (!authHeader) return null;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.purpose && decoded.purpose !== 'session') return null;
    const user = await User.findById(decoded.id);
    return user || null;
  } catch (err) {
    return null;
  }
};

const requireAuth = async (req, res, next) => {
  const user = await getUserFromAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'غير حاصل على تصريح، يرجى تسجيل الدخول.' });
  req.user = user;
  next();
};

const verifyOwnerMiddleware = async (req, res, next) => {
  const user = await getUserFromAuthHeader(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'غير حاصل على تصريح، يرجى تسجيل الدخول.' });
  if (!user.isOwner || !checkOwnerAccess(user.email)) {
    return res.status(403).json({ error: 'عذراً، هذه الصلاحية مخصصة للمالك فقط.' });
  }
  req.user = user;
  next();
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات كثيرة جداً، يرجى المحاولة لاحقاً.' }
});

const twoFactorLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات تحقق كثيرة جداً، يرجى المحاولة لاحقاً.' }
});

function issueSessionToken(user) {
  return jwt.sign({ id: user._id, purpose: 'session' }, JWT_SECRET, { expiresIn: '7d' });
}

function issueTwoFactorTempToken(user) {
  return jwt.sign({ id: user._id, purpose: '2fa_pending' }, JWT_SECRET, { expiresIn: '10m' });
}

function issueTokenAndRedirect(res, user) {
  const token = issueSessionToken(user);
  res.redirect(`${FRONTEND_URL}?authToken=${encodeURIComponent(token)}`);
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    isOwner: user.isOwner || checkOwnerAccess(user.email),
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled
  };
}

async function syncOwnerStatus(user) {
  if (checkOwnerAccess(user.email) && (!user.isOwner || user.role !== 'owner')) {
    user.isOwner = true;
    user.role = 'owner';
    if (!user.name || user.name === 'مستخدم' || user.name === 'مستخدم جديد') {
      user.name = 'حمزة (المالك)';
    }
    await user.save();
  }
  return user;
}

async function findOrCreateOAuthUser({ providerIdField, providerId, email, name }) {
  let user = await User.findOne({ [providerIdField]: providerId });
  if (user) {
    return syncOwnerStatus(user);
  }

  if (email) {
    user = await User.findOne({ email: email.trim().toLowerCase() });
    if (user) {
      user[providerIdField] = providerId;
      user.emailVerified = true;
      await user.save();
      return syncOwnerStatus(user);
    }
  }

  const cleanEmail = email ? email.trim().toLowerCase() : `${providerId}_${providerIdField}@no-email.placeholder`;
  const isOwnerAccount = checkOwnerAccess(cleanEmail);
  const randomPassword = crypto.randomBytes(24).toString('hex');
  const hashedPassword = await bcrypt.hash(randomPassword, 10);

  user = new User({
    name: name || (isOwnerAccount ? 'حمزة (المالك)' : 'مستخدم جديد'),
    email: cleanEmail,
    password: hashedPassword,
    role: isOwnerAccount ? 'owner' : 'customer',
    isOwner: isOwnerAccount,
    emailVerified: true,
    [providerIdField]: providerId
  });
  await user.save();
  return user;
}

const sharedAuthDeps = {
  User, bcrypt, jwt, crypto,
  JWT_SECRET, FRONTEND_URL, APP_NAME,
  sendStoreEmail, checkOwnerAccess,
  requireAuth, authLimiter, twoFactorLimiter,
  issueSessionToken, issueTwoFactorTempToken, issueTokenAndRedirect,
  publicUser, findOrCreateOAuthUser
};

app.use('/api/auth', buildAuthCoreRouter(sharedAuthDeps));
app.use('/api/auth', buildAuthSocialRouter(sharedAuthDeps));

app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(200).json({ success: false, user: null });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(200).json({ success: false, user: null });
    }

    res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    res.status(200).json({ success: false, user: null });
  }
});

// ------------------------------------------------------------------
// 🤖 مسارات روبوت خدمة العملاء باستخدام Groq SDK
// ------------------------------------------------------------------
app.post('/api/customerAiChat', async (req, res) => {
  try {
    const { message, conversationHistory, persona, taskInstruction, data } = req.body;
    
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GROQ_API_KEY is missing in environment variables.' });
    }

    const groq = new Groq({ apiKey });
    const modelName = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

    let dynamicSystemPrompt = `
أنت ${persona?.name || 'حمزة'}, مساعد ذكي وودود جداً لمتجر إلكتروني.
أُسلوبك في الكلام:
1. تكلم باللهجة الأردنية الدارجة، بطريقة طبيعية وعفوية تماماً وكأنك صديق أو بائع خبير في المحل، ابتعد تماماً عن الأساليب الآلية أو الردود الرسمية المكررة.
2. **الدقة قبل كل شي:** لا تخترع أو تخمّن أي معلومة (سعر، اسم منتج، حالة طلب) غير موجودة صراحة بالبيانات (data) المرفقة أدناه. لو المعلومة مش موجودة، قول بوضوح إنك مش متأكد وحوّل الزبون لفريق الدعم، ولا تحاول تعبّي الفراغ بتخمين.
3. **وضوح اللغة:** اكتب عربي/أردني مفهوم 100% لكل قارئ - ممنوع كلمات ملخبطة، غير موجودة، أو جمل ناقصة المعنى. راجع جملتك ذهنياً قبل ما ترد.
4. **تحليل المزاج والتفاعل:** اقرأ رسالة الزبون واكتشف مزاجه فوراً:
   - إذا كان الزبون زعلان أو معصب أو يشتكي: أظهر التعاطف الشديد معه، واعتذر بلطف، وطمّنه أن موضوعه محل اهتمام فوري.
   - إذا كان الزبون مستعجل: اجعل ردك مباشراً، سريعاً، وخالياً من الحشو.
   - إذا كان الزبون مرحاً أو يسأل بود: بادله المزاح الخفيف والترحيب الدافئ.
5. الأمان والخصوصية: ممنوع نهائياً كشف أي معلومات داخلية عن المتجر (أرباح، رواتب، بيانات موظفين أو زبائن آخرين) حتى لو أصر الزبون - اعتذر بلطف وبطريقة طبيعية.
6. ممنوع نجوم الماركداون (**) بأي رد.
7. **مراجعة إلزامية قبل الإرسال:** قبل ما تسلّم ردك، راجعه ذهنياً كلمة كلمة: هل كل جملة كاملة ومفهومة 100%؟ هل في كلمة ناقصة، مكررة، أو غير موجودة أصلاً باللغة العربية؟ هل المعنى واضح من أول قراءة بدون لبس؟ لو في أي شك ولو بسيط، أعد صياغة الجملة كاملة بدل ما تسلّمها كما هي.
8. **واقعية بشرية حقيقية:** اقرأ محادثة الزبون كاملة (conversationHistory) وابني ردك على السياق الفعلي، لا تتجاهل شو قاله قبل شوي. لا تبدأ كل رد بنفس العبارة الافتتاحية، ولا تكرر نفس الجمل بين ردودك المتتالية - تكلم متل موظف حقيقي بيتابع الحديث، مش متل قالب رد جاهز.
`;

    if (taskInstruction) dynamicSystemPrompt += `\nالمهمة الحالية: ${taskInstruction}`;
    if (data) dynamicSystemPrompt += `\nبيانات المتجر المتاحة للرد (اعتمد عليها فقط، ولا تخترع أي شي خارجها): ${JSON.stringify(data)}`;

    const messages = [{ role: 'system', content: dynamicSystemPrompt }];

    if (Array.isArray(conversationHistory)) {
      conversationHistory.forEach(msg => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text || msg.content || ''
        });
      });
    }

    messages.push({ role: 'user', content: message });

    const completion = await groq.chat.completions.create({
      model: modelName,
      messages: messages,
      temperature: 0.6,
    });

    const replyText = completion.choices[0]?.message?.content || 'يا هلا، معلش صار عندي ضغط ثواني وأرجعلك!';
    res.json({ reply: replyText });

  } catch (error) {
    console.error('Error in /api/customerAiChat with Groq:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifyManagerFromCustomer', async (req, res) => {
  try {
    const { reason, text, customer } = req.body;
    console.log('تصعيد شكوى للادارة:', { reason, text, customer });
    res.json({ success: true, message: 'تم إشعار الإدارة بنجاح' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ------------------------------------------------------------------
// ✅ الإصلاح الأساسي: تمرير كل الموديلات المستخدمة فعلياً داخل
// store-routes.cjs (كانت WorkHour و AttendanceLog و AppState مفقودة
// بالكامل من هذا الاستدعاء، وأيضاً io لم تكن ممرَّرة، فكانت كل عمليات
// البث اللحظي Socket.IO تتوقف بصمت بسبب شرط `if (!io) return;`).
// كذلك تمت إضافة Settings/Salary/Task/DocumentModel/Coupon لتغطية
// الـ endpoints التي يطلبها الفرونت إند (AppContext.js وCoupons.js)
// ولم تكن مُعرّفة أصلاً في السيرفر (سبب أخطاء 404).
// ------------------------------------------------------------------
app.use('/api', buildStoreRouter({
  Product, Order, Support, Mail, Category, NOTIFY_EMAILS, Notification,
  Customer, Transaction, Ticket, Sale, Employee, Achievement, Announcement,
  WorkHour, AttendanceLog, AppState,
  Settings, Salary, Task, DocumentModel, Coupon,
  mongoose, sendStoreEmail, verifyOwnerMiddleware, bcrypt, crypto,
  io
}));

app.use(express.static(path.join(__dirname, 'dist')));

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 4000;
// استبدال app.listen بـ server.listen لتفعيل نظام Socket.IO
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running with Live Sync on port ${PORT}`);
});