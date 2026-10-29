const User = require("../models/user.models");
const asyncWrapper = require("../middlewares/asyncWrapper");
const httpStatusText = require("../utils/httpStatusText");
const appError = require('../utils/appError');
const bcrypt = require('bcryptjs');
const jwt = require("jsonwebtoken"); 
const { generateAccessToken, generateRefreshToken } = require("../utils/generateJWT"); 
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");

const register = asyncWrapper(
    async (req, res, next) => {
        const { firstName, lastName, email, password, role } = req.body;
        const avatar = req.file ? (req.file.secure_url || req.file.url || req.file.path) : 'https://res.cloudinary.com/demo/image/upload/default-avatar.png';

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

        // ✅ التوكن هنا مش محتاج نخزنه في الداتابيز دلوقتي (بنستخدمه بس عشان اللينك)
        await newUser.save()

        // ── send verification email ──
        const verifyUrl = `${process.env.CLIENT_URL}/verify-email/${rawVerifyToken}`;

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

const login = asyncWrapper(async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return next(appError.create('Email & password are required', 400, httpStatusText.FAIL));
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
        return next(appError.create('Invalid credentials', 401, httpStatusText.FAIL));
    }

    const matchedPassword = await bcrypt.compare(password, user.password);
    if (!matchedPassword) {
        return next(appError.create('Invalid credentials', 401, httpStatusText.FAIL));
    }

    if (!user.isVerified) {
        return next(appError.create(
            'Please verify your email first. Check your inbox.',
            403,
            httpStatusText.FAIL
        ));
    }

    // ✅ إصدار التوكنات
    const payload = { email: user.email, id: user._id, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // ✅ حفظ الـ Refresh Token في الداتابيز
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    user.password = undefined;

    // ✅ حط الـ Access Token في كوكي (15 دقيقة)
    res.cookie("token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000, // 15 دقيقة
        path: "/",
    });

    // ✅ حط الـ Refresh Token في كوكي (7 أيام)
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 أيام
        path: "/",
    });

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        data: { user },
    });
});

const refresh = asyncWrapper(async (req, res, next) => {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
        return next(appError.create("Refresh token is required", 401, httpStatusText.FAIL));
    }

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        
        const user = await User.findById(decoded.id).select("+refreshToken");
        
        // تأكد إن الـ Refresh Token اللي في الكوكي هو نفسه اللي في الداتابيز
        if (!user || user.refreshToken !== refreshToken) {
            return next(appError.create("Invalid refresh token", 401, httpStatusText.FAIL));
        }

        // أصدر Access Token جديد
        const newAccessToken = generateAccessToken({ 
            email: user.email, 
            id: user._id, 
            role: user.role 
        });

        // حدث الكوكي
        res.cookie("token", newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 15 * 60 * 1000,
            path: "/",
        });

        res.status(200).json({ status: httpStatusText.SUCCESS, message: "Token refreshed" });
    } catch (err) {
        return next(appError.create("Invalid refresh token", 401, httpStatusText.FAIL));
    }
});

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

const resendVerification = asyncWrapper(async (req, res, next) => {
    const { email } = req.body;

    if (!email) {
        return next(appError.create("Email is required", 400, httpStatusText.FAIL));
    }

    const user = await User.findOne({ email });

    const genericResponse = {
        status: httpStatusText.SUCCESS,
        message: "If that email exists and is not verified, a verification link has been sent.",
    };

    if (!user || user.isVerified) {
        return res.status(200).json(genericResponse);
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashed = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.emailVerificationToken = hashed;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    const verifyUrl = `${process.env.CLIENT_URL}/verify-email/${rawToken}`;

    if (process.env.SMTP_HOST) {
        try {
            await sendEmail({
                to: user.email,
                subject: "Verify your email",
                html: `
                    <p>Hi ${user.firstName},</p>
                    <p>Click <a href="${verifyUrl}">here</a> to verify your email.</p>
                    <p>This link expires in 24 hours.</p>
                `,
            });
        } catch (err) {
            console.warn("Email send failed:", err.message);
        }
    } else {
        console.log("🔗 Verify URL (dev):", verifyUrl);
    }

    res.status(200).json(genericResponse);
});

const forgotPassword = asyncWrapper(async (req, res, next) => {
    const { email } = req.body;

    const user = await User.findOne({ email });

    const genericResponse = {
        status: httpStatusText.SUCCESS,
        message: "If that email exists, a reset link has been sent.",
    };

    if (!user) {
        return res.status(200).json(genericResponse);
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 15 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

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
    const { token } = req.params;
    const { password } = req.body;

    const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

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

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;

    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.refreshToken = undefined; // ✅ امسح الـ Refresh Token برضه
    user.token = undefined;

    await user.save({ validateBeforeSave: false });

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        message: "Password updated successfully. Please log in again.",
    });
});

const logout = asyncWrapper(async (req, res) => {
    const { refreshToken } = req.cookies;

    // ✅ لو فيه Refresh Token، بنمسحه من الداتابيز
    if (refreshToken) {
        try {
            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            const user = await User.findById(decoded.id);
            if (user) {
                user.refreshToken = undefined;
                await user.save({ validateBeforeSave: false });
            }
        } catch (err) {
            // لو التوكن بايظ، مش مشكلة، هنمسح الكوكيز وخلاص
        }
    }

    // ✅ امسح الكوكيز
    res.clearCookie("token");
    res.clearCookie("refreshToken");

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        message: "Logged out successfully",
    });
});

const logoutAll = asyncWrapper(async (req, res) => {
    const user = await User.findById(req.user.id);

    if (user) {
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        user.refreshToken = undefined; // ✅ امسح الـ Refresh Token برضه
        await user.save({ validateBeforeSave: false });
    }

    res.clearCookie("token");
    res.clearCookie("refreshToken");

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        message: "Logged out from all devices",
    });
});

module.exports = {
    register,
    login,
    refresh,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    logout,
    logoutAll,
}