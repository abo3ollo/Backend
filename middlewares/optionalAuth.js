const jwt = require("jsonwebtoken");

const optionalAuth = (req, res, next) => {
    const token = req.cookies?.token;
    
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
            req.user = decoded; // بنحط بيانات اليوزر لو التوكن صالح
        } catch (err) {
            // لو التوكن غلط أو منتهي، بنكمل عادي كزائر
        }
    }
    next();
};

module.exports = optionalAuth;