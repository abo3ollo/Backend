const User = require("../models/user.models");
const asyncWrapper = require("../middlewares/asyncWrapper");
const httpStatusText = require("../utils/httpStatusText")
const appError = require('../utils/appError');
const bcrypt = require('bcryptjs');
const generateJWT = require("../utils/generateJWT");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");



const register = asyncWrapper(
    async (req, res, next) => {
        const { firstName, lastName, email, password, role } = req.body;
        const avatar = req.file ? req.file.filename : 'uploads/default-avatar.png';

        const oldUser = await User.findOne({ email: email })

        if (oldUser) {
            const error = appError.create('Email already exists', 400, httpStatusText.FAIL)
            return next(error)
        }

        //password hashing
        const hashedPassword = await bcrypt.hash(password, 10)

        // ── email verification token ──
        const rawVerifyToken = crypto.randomBytes(32).toString("hex");
        const hashedVerifyToken = crypto
            .createHash("sha256")
            .update(rawVerifyToken)
            .digest("hex");

        const newUser = new User({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            role,
            avatar,
            emailVerificationToken: hashedVerifyToken,
            emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000, // 24h
        })

        //generate JWT token 
        const token = await generateJWT({ email: newUser.email, id: newUser._id, role: newUser.role })
        newUser.token = token

        await newUser.save()


        // ── send verification email ──
        const verifyUrl = `${req.protocol}://${req.get("host")}/api/auth/verify-email/${rawVerifyToken}`;

        if (process.env.SMTP_HOST) {
            try {
                await sendEmail({
                    to: newUser.email,
                    subject: "Verify your email",
                    html: `
                        <p>Hi ${firstName},</p>
                        <p>Click <a href="${verifyUrl}">here</a> to verify your email.</p>
                        <p>This link expires in 24 hours.</p>
                    `,
                });
            } catch (err) {
                console.warn("Email send failed:", err.message);
            }
        } else {
            // dev only — no SMTP configured
            console.log("🔗 Verify URL (dev):", verifyUrl);
        }
        res.status(201).json({ status: httpStatusText.SUCCESS, data: { user: newUser } });
    });


const login = asyncWrapper(
    async (req, res, next) => {
        const { email, password } = req.body

        if (!email && password) {
            const error = appError.create('Email & password are required', 400, httpStatusText.FAIL)
            return next(error)
        }

        const user = await User.findOne({ email: email })
        if (!user) {
            const error = appError.create('user not found', 400, httpStatusText.FAIL)
            return next(error)
        }

        const matchedPassword = await bcrypt.compare(password, user.password)

        if (user && matchedPassword) {

            const token = await generateJWT({ email: user.email, id: user._id, role: user.role })
            res.status(201).json({ status: httpStatusText.SUCCESS, data: { token } });
        } else {
            const error = appError.create('Email & password are not matched', 500, httpStatusText.FAIL)
            return next(error)
        }
    })


const verifyEmail = asyncWrapper(async (req, res, next) => {
    const { token } = req.params;

    const hashed = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
        emailVerificationToken: hashed,
        emailVerificationExpires: { $gt: Date.now() },
    }).select("+emailVerificationToken +emailVerificationExpires");

    if (!user) {
        return next(appError.create("Token is invalid or has expired", 400, httpStatusText.FAIL));
    }

    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        message: "Email verified successfully",
    });
});


const forgotPassword = asyncWrapper(async (req, res, next) => {
    const { email } = req.body;

    // 1. دوّر على المستخدم
    const user = await User.findOne({ email });

    // 2. رد عام في كل الحالات (منع user enumeration)
    const genericResponse = {
        status: httpStatusText.SUCCESS,
        message: "If that email exists, a reset link has been sent.",
    };

    if (!user) {
        // مش بنقول إن الإيميل مش موجود
        return res.status(200).json(genericResponse);
    }

    // 3. اعمل توكن عشوائي + هاش
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

    // 4. خزّن الهاش + تاريخ الانتهاء (15 دقيقة)
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 15 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    // 5. ابعت الإيميل بالتوكن الخام
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${rawToken}`;

    if (process.env.SMTP_HOST) {
        try {
            await sendEmail({
                to: user.email,
                subject: "Password Reset Request",
                html: `
                    <p>Hi ${user.firstName},</p>
                    <p>You requested to reset your password.</p>
                    <p>Click <a href="${resetUrl}">here</a> to set a new password.</p>
                    <p>This link expires in 15 minutes.</p>
                    <p>If you didn't request this, ignore this email.</p>
                `,
            });
        } catch (err) {
            console.warn("Email send failed:", err.message);
            // اختياري: لو الإيميل فشل، نمسح التوكن
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            await user.save({ validateBeforeSave: false });
        }
    } else {
        console.log("🔗 Reset URL (dev):", resetUrl);
    }

    res.status(200).json(genericResponse);
});

const resetPassword = asyncWrapper(async (req, res, next) => {
    const { token } = req.params;      // من الـ URL
    const { password } = req.body;     // من الفورم/Postman

    // 1. hash للتوكن
    const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    // 2. دوّر على المستخدم بالهاش + التوكن لسه صالح
    const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() },
    }).select("+passwordResetToken +passwordResetExpires");

    if (!user) {
        return next(appError.create(
            "Token is invalid or has expired",
            400,
            httpStatusText.FAIL
        ));
    }

    // 3. hash الباسورد الجديد
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;

    // 4. امسح التوكن
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    // 5. اقتل كل الجلسات القديمة
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.token = undefined;

    await user.save({ validateBeforeSave: false });

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        message: "Password updated successfully. Please log in again.",
    });
});


const logout = asyncWrapper(async (req, res) => {
    const user = await User.findById(req.currentUser.id);
    if (user) {
        user.refreshTokenHash = undefined;
        await user.save({ validateBeforeSave: false });
    }
    res.status(200).json({ status: httpStatusText.SUCCESS, data: null });
});

const logoutAll = asyncWrapper(async (req, res) => {
    const user = await User.findById(req.currentUser.id);
    if (user) {
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        user.refreshTokenHash = undefined;
        await user.save({ validateBeforeSave: false });
    }
    res.status(200).json({
        status: httpStatusText.SUCCESS,
        message: "Logged out from all devices",
    });
});

module.exports = {
    register,
    login,
    verifyEmail,
    forgotPassword,
    resetPassword,
    logout,
    logoutAll
}