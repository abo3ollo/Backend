const jwt = require('jsonwebtoken');
const appError = require('../utils/appError');
const httpStatusText = require("../utils/httpStatusText");
const User = require("../models/user.models");

const verifyToken = async (req, res, next) => {
    // ✅ اقرأ من الـ cookie (مش الـ header)
    const token = req.cookies?.token;

    if (!token) {
        return next(appError.create('Token is required', 401, httpStatusText.FAIL));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

        // ✅ تأكد إن المستخدم لسه موجود
        const user = await User.findById(decoded.id);
        if (!user) {
            return next(appError.create('User no longer exists', 401, httpStatusText.FAIL));
        }

        // ✅ وحّد الاسم على req.user
        req.user = {
            id: user._id,
            email: user.email,
            role: user.role,
        };

        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return next(appError.create('Token expired', 401, 'TOKEN_EXPIRED'));
        }
        return next(appError.create('Invalid token', 401, httpStatusText.FAIL));
    }
};

module.exports = verifyToken;