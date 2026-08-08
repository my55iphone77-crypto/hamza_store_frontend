const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const AppleStrategy = require('passport-apple');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

module.exports = function buildAuthSocialRouter(deps) {
  const {
    User, bcrypt, jwt,
    JWT_SECRET, FRONTEND_URL, APP_NAME,
    checkOwnerAccess, requireAuth, twoFactorLimiter,
    issueSessionToken, issueTokenAndRedirect,
    publicUser, findOrCreateOAuthUser
  } = deps;

  const router = express.Router();

  router.post('/2fa/setup', requireAuth, async (req, res) => {
    try {
      const user = req.user;
      if (user.twoFactorEnabled) {
        return res.status(400).json({ error: 'التحقق بخطوتين مفعّل بالفعل على حسابك.' });
      }

      const secret = speakeasy.generateSecret({ name: `${APP_NAME} (${user.email})` });
      user.twoFactorTempSecret = secret.base32;
      await user.save();

      const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

      res.json({ success: true, qrCode: qrCodeDataUrl, manualEntryKey: secret.base32 });
    } catch (err) {
      res.status(500).json({ error: 'تعذّر بدء إعداد التحقق بخطوتين.' });
    }
  });

  router.post('/2fa/enable', requireAuth, twoFactorLimiter, async (req, res) => {
    try {
      const { code } = req.body;
      const user = req.user;

      if (!user.twoFactorTempSecret) {
        return res.status(400).json({ error: 'يجب بدء عملية الإعداد أولاً.' });
      }
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'يرجى إدخال كود التحقق بصيغة صحيحة.' });
      }

      const isValid = speakeasy.totp.verify({
        secret: user.twoFactorTempSecret,
        encoding: 'base32',
        token: code.trim(),
        window: 1
      });

      if (!isValid) {
        return res.status(400).json({ error: 'كود التحقق غير صحيح.' });
      }

      user.twoFactorSecret = user.twoFactorTempSecret;
      user.twoFactorTempSecret = undefined;
      user.twoFactorEnabled = true;
      await user.save();

      res.json({ success: true, message: 'تم تفعيل التحقق بخطوتين بنجاح.' });
    } catch (err) {
      res.status(500).json({ error: 'تعذّر تفعيل التحقق بخطوتين.' });
    }
  });

  router.post('/2fa/disable', requireAuth, async (req, res) => {
    try {
      const { password } = req.body;
      const user = req.user;

      if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: 'يرجى إدخال كلمة المرور لتأكيد التعطيل.' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'كلمة المرور غير صحيحة.' });
      }

      user.twoFactorEnabled = false;
      user.twoFactorSecret = undefined;
      user.twoFactorTempSecret = undefined;
      await user.save();

      res.json({ success: true, message: 'تم تعطيل التحقق بخطوتين.' });
    } catch (err) {
      res.status(500).json({ error: 'تعذّر تعطيل التحقق بخطوتين.' });
    }
  });

  router.post('/2fa/login-verify', twoFactorLimiter, async (req, res) => {
    try {
      const { tempToken, code } = req.body;
      if (!tempToken || !code || typeof tempToken !== 'string' || typeof code !== 'string') {
        return res.status(400).json({ error: 'بيانات ناقصة أو غير صالحة.' });
      }

      let decoded;
      try {
        decoded = jwt.verify(tempToken, JWT_SECRET);
      } catch (err) {
        return res.status(401).json({ error: 'انتهت صلاحية الجلسة المؤقتة، يرجى تسجيل الدخول من جديد.' });
      }

      if (decoded.purpose !== '2fa_pending' || !decoded.id) {
        return res.status(401).json({ error: 'توكن غير صالح.' });
      }

      const user = await User.findById(decoded.id);
      if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
        return res.status(401).json({ error: 'الحساب غير موجود أو التحقق بخطوتين غير مفعّل عليه.' });
      }

      const isValid = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: code.trim(),
        window: 1
      });

      if (!isValid) {
        return res.status(400).json({ error: 'كود التحقق غير صحيح.' });
      }

      if (checkOwnerAccess(user.email)) {
        user.role = 'owner';
        user.isOwner = true;
        await user.save();
      }

      const token = issueSessionToken(user);

      res.json({
        success: true,
        message: 'تم تسجيل الدخول بنجاح',
        user: publicUser(user),
        token
      });
    } catch (err) {
      res.status(500).json({ error: 'حدث خطأ أثناء التحقق.' });
    }
  });

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || `${FRONTEND_URL.replace(/\/$/, '')}/api/auth/google/callback`,
      passReqToCallback: true
    }, async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        const user = await findOrCreateOAuthUser({
          providerIdField: 'googleId',
          providerId: profile.id,
          email,
          name: profile.displayName
        });
        done(null, user);
      } catch (err) {
        done(err);
      }
    }));

    // تفعيل منع هجمات CSRF عبر استخدام خاصية state في المصادقة الاجتماعية
    router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false, state: true }));

    router.get('/google/callback',
      passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND_URL}?authError=google`, state: true }),
      (req, res) => issueTokenAndRedirect(res, req.user)
    );
  } else {
    router.get('/google', (req, res) => res.redirect(`${FRONTEND_URL}?authError=google_not_configured`));
  }

  if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
    passport.use(new FacebookStrategy({
      clientID: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL || `${FRONTEND_URL.replace(/\/$/, '')}/api/auth/facebook/callback`,
      profileFields: ['id', 'displayName', 'emails'],
      passReqToCallback: true
    }, async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        const user = await findOrCreateOAuthUser({
          providerIdField: 'facebookId',
          providerId: profile.id,
          email,
          name: profile.displayName
        });
        done(null, user);
      } catch (err) {
        done(err);
      }
    }));

    router.get('/facebook', passport.authenticate('facebook', { scope: ['email'], session: false, state: true }));

    router.get('/facebook/callback',
      passport.authenticate('facebook', { session: false, failureRedirect: `${FRONTEND_URL}?authError=facebook`, state: true }),
      (req, res) => issueTokenAndRedirect(res, req.user)
    );
  } else {
    router.get('/facebook', (req, res) => res.redirect(`${FRONTEND_URL}?authError=facebook_not_configured`));
  }

  if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY) {
    passport.use(new AppleStrategy({
      clientID: process.env.APPLE_CLIENT_ID,
      teamID: process.env.APPLE_TEAM_ID,
      keyID: process.env.APPLE_KEY_ID,
      privateKeyString: process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      callbackURL: process.env.APPLE_CALLBACK_URL || `${FRONTEND_URL.replace(/\/$/, '')}/api/auth/apple/callback`,
      scope: ['name', 'email'],
      passReqToCallback: true
    }, async (req, accessToken, refreshToken, idToken, profile, done) => {
      try {
        let name = null;
        if (req.body && req.body.user) {
          try {
            const parsed = JSON.parse(req.body.user);
            if (parsed.name) {
              name = [parsed.name.firstName, parsed.name.lastName].filter(Boolean).join(' ');
            }
          } catch (e) {}
        }

        const user = await findOrCreateOAuthUser({
          providerIdField: 'appleId',
          providerId: profile.id,
          email: profile.email,
          name
        });
        done(null, user);
      } catch (err) {
        done(err);
      }
    }));

    router.get('/apple', passport.authenticate('apple', { session: false, state: true }));

    router.post('/apple/callback',
      passport.authenticate('apple', { session: false, failureRedirect: `${FRONTEND_URL}?authError=apple`, state: true }),
      (req, res) => issueTokenAndRedirect(res, req.user)
    );
  } else {
    router.get('/apple', (req, res) => res.redirect(`${FRONTEND_URL}?authError=apple_not_configured`));
  }

  return router;
};