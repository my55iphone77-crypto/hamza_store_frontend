const express = require('express');
const passport = require('passport');

module.exports = function buildAuthCoreRouter(deps) {
  const {
    User, bcrypt, crypto,
    JWT_SECRET, jwt,
    FRONTEND_URL, APP_NAME,
    sendStoreEmail, checkOwnerAccess,
    requireAuth, authLimiter,
    issueSessionToken, issueTwoFactorTempToken,
    publicUser
  } = deps;

  const router = express.Router();

  router.get('/me', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        return res.status(200).json({ success: false, user: null });
      }

      const token = authHeader.split(' ')[1];
      if (!token || typeof token !== 'string') {
        return res.status(200).json({ success: false, user: null });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        return res.status(200).json({ success: false, user: null });
      }

      if (!decoded || decoded.purpose && decoded.purpose !== 'session' || !decoded.id) {
        return res.status(200).json({ success: false, user: null });
      }

      const user = await User.findById(decoded.id).lean();
      if (!user) {
        return res.status(200).json({ success: false, user: null });
      }

      const isRealOwner = checkOwnerAccess(user.email);
      if (isRealOwner && (!user.isOwner || user.role !== 'owner')) {
        await User.findByIdAndUpdate(user._id, { isOwner: true, role: 'owner' });
        user.isOwner = true;
        user.role = 'owner';
      }

      res.json({ success: true, user: publicUser(user) });
    } catch (err) {
      res.status(200).json({ success: false, user: null });
    }
  });

  router.post('/register', authLimiter, async (req, res) => {
    try {
      const { name, email, password } = req.body;

      if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const existingUser = await User.findOne({ email: cleanEmail });
      if (existingUser) {
        return res.status(400).json({ error: 'البريد الإلكتروني مستخدم مسبقاً.' });
      }

      const isOwnerAccount = checkOwnerAccess(cleanEmail);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const rawVerifyToken = crypto.randomBytes(32).toString('hex');
      const hashedVerifyToken = crypto.createHash('sha256').update(rawVerifyToken).digest('hex');

      const cleanName = name && typeof name === 'string' ? name.trim() : (isOwnerAccount ? 'حمزة (المالك)' : 'مستخدم');

      const newUser = new User({
        name: cleanName,
        email: cleanEmail,
        password: hashedPassword,
        role: isOwnerAccount ? 'owner' : 'customer',
        isOwner: isOwnerAccount,
        emailVerified: false,
        emailVerificationToken: hashedVerifyToken,
        emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      await newUser.save();

      const verifyLink = `${FRONTEND_URL}/verify-email?email=${encodeURIComponent(cleanEmail)}&token=${rawVerifyToken}`;
      sendStoreEmail(
        cleanEmail,
        'تفعيل حسابك - متجر حمزة',
        `<h3>مرحباً ${newUser.name}،</h3><p>اضغط الرابط التالي لتفعيل بريدك الإلكتروني:</p><p><a href="${verifyLink}">تفعيل الحساب الآن</a></p><p>هذا الرابط صالح لمدة 24 ساعة.</p>`
      );

      const token = issueSessionToken(newUser);

      res.json({
        success: true,
        message: 'تم إنشاء الحساب بنجاح، تحقق من بريدك الإلكتروني لتفعيله.',
        user: publicUser(newUser),
        token
      });
    } catch (err) {
      res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الحساب' });
    }
  });

  router.post('/login', authLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      let user = await User.findOne({ email: cleanEmail });

      if (!user) {
        return res.status(400).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
      }

      if (checkOwnerAccess(cleanEmail)) {
        user.role = 'owner';
        user.isOwner = true;
        if (!user.name || user.name === 'مستخدم') user.name = 'حمزة (المالك)';
        await user.save();
      }

      if (user.twoFactorEnabled) {
        const tempToken = issueTwoFactorTempToken(user);
        return res.json({ success: true, requires2FA: true, tempToken });
      }

      const token = issueSessionToken(user);

      res.json({
        success: true,
        message: 'تم تسجيل الدخول بنجاح',
        user: publicUser(user),
        token
      });
    } catch (err) {
      res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الدخول' });
    }
  });

  router.post('/forgot-password', authLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const user = await User.findOne({ email: cleanEmail });

      if (user) {
        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
        await user.save();

        const resetLink = `${FRONTEND_URL}/reset-password?email=${encodeURIComponent(cleanEmail)}&token=${rawToken}`;

        await sendStoreEmail(
          cleanEmail,
          'إعادة تعيين كلمة المرور - متجر حمزة',
          `<h3>مرحباً ${user.name || ''}،</h3><p><a href="${resetLink}">اضغط هنا لتعيين كلمة مرور جديدة</a></p><p>هذا الرابط صالح لمدة ساعة واحدة فقط.</p>`
        );
      }

      res.json({ success: true, message: 'إذا كان هذا البريد مسجلاً لدينا، تم إرسال رابط إعادة التعيين.' });
    } catch (err) {
      res.status(500).json({ error: 'حدث خطأ، حاول لاحقاً.' });
    }
  });

  router.post('/reset-password', authLimiter, async (req, res) => {
    try {
      const { email, token, newPassword } = req.body;
      if (!email || !token || !newPassword || typeof email !== 'string' || typeof token !== 'string' || typeof newPassword !== 'string') {
        return res.status(400).json({ error: 'بيانات ناقصة أو غير صالحة.' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      const user = await User.findOne({
        email: cleanEmail,
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: new Date() }
      });

      if (!user) {
        return res.status(400).json({ error: 'الرابط غير صالح أو انتهت صلاحيته، يرجى طلب رابط جديد.' });
      }

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح، يمكنك تسجيل الدخول الآن.' });
    } catch (err) {
      res.status(500).json({ error: 'تعذّر إعادة تعيين كلمة المرور.' });
    }
  });

  router.post('/change-password', authLimiter, requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword || typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        return res.status(400).json({ error: 'يرجى إدخال كلمة المرور الحالية والجديدة.' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'يجب أن تتكون كلمة المرور الجديدة من 8 أحرف على الأقل.' });
      }

      const user = req.user;
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة.' });
      }

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      await user.save();

      res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح.' });
    } catch (err) {
      res.status(500).json({ error: 'حدث خطأ أثناء تغيير كلمة المرور.' });
    }
  });

  router.post('/verify-email', authLimiter, async (req, res) => {
    try {
      const { email, token } = req.body;
      if (!email || !token || typeof email !== 'string' || typeof token !== 'string') {
        return res.status(400).json({ error: 'بيانات ناقصة أو غير صالحة.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      const user = await User.findOne({
        email: cleanEmail,
        emailVerificationToken: hashedToken,
        emailVerificationExpires: { $gt: new Date() }
      });

      if (!user) {
        return res.status(400).json({ error: 'رابط التفعيل غير صالح أو منتهي الصلاحية، يمكنك طلب رابط جديد.' });
      }

      user.emailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();

      res.json({ success: true, message: 'تم تفعيل بريدك الإلكتروني بنجاح.' });
    } catch (err) {
      res.status(500).json({ error: 'تعذّر تفعيل البريد الإلكتروني.' });
    }
  });

  router.post('/resend-verification', authLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const user = await User.findOne({ email: cleanEmail });

      if (user && !user.emailVerified) {
        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        user.emailVerificationToken = hashedToken;
        user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await user.save();

        const verifyLink = `${FRONTEND_URL}/verify-email?email=${encodeURIComponent(cleanEmail)}&token=${rawToken}`;
        await sendStoreEmail(
          cleanEmail,
          'تفعيل حسابك - متجر حمزة',
          `<h3>مرحباً ${user.name || ''}،</h3><p><a href="${verifyLink}">اضغط هنا لتفعيل حسابك</a></p><p>هذا الرابط صالح لمدة 24 ساعة.</p>`
        );
      }

      res.json({ success: true, message: 'إذا كان الحساب موجوداً وغير مفعّل، تم إرسال رابط التفعيل إليه.' });
    } catch (err) {
      res.status(500).json({ error: 'حدث خطأ، حاول لاحقاً.' });
    }
  });

  
  router.post('/welcome-email', async (req, res) => {
    try {
      const { email, name } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' });
      }

      await sendStoreEmail(
        email,
        `🎉 مرحباً بك في ${APP_NAME || 'متجر حمزة'}`,
        `<div dir="rtl" style="font-family:Tajawal,sans-serif;">
          <h2>أهلاً ${name || 'بك'}! 👋</h2>
          <p>تم إنشاء حسابك بنجاح في ${APP_NAME || 'متجر حمزة'}.</p>
          <p>يمكنك الآن تصفح منتجاتنا وإتمام طلباتك بكل سهولة.</p>
          <hr style="border-color:rgba(255,255,255,0.2);">
          <p style="color:#94a3b8;font-size:12px;">إذا لم تقم أنت بإنشاء هذا الحساب، يرجى تجاهل هذه الرسالة.</p>
        </div>`
      );

      res.json({ success: true, message: 'تم إرسال إيميل الترحيب' });
    } catch (err) {
      res.status(500).json({ error: 'تعذر إرسال إيميل الترحيب' });
    }
  });

return router;
};