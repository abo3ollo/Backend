const jwt = require("jsonwebtoken");

const generateAccessToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_SECRET_KEY, { expiresIn: "15m" }); // 15 دقيقة
};

const generateRefreshToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" }); // 7 أيام
};

module.exports = { generateAccessToken, generateRefreshToken };