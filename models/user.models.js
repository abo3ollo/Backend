const mongoose = require("mongoose");
const validator = require("validator");
const userRoles = require("../utils/userRoles");

const userSchenma = new mongoose.Schema({
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        validate: [validator.isEmail, 'Must be valid email']
    },
    password: {
        type: String,
        required: true,
    },
    token: {
        type: String,
    },
    role: {
        type: String,
        enum: [userRoles.ADMIN, userRoles.INSTRUCTOR, userRoles.USER],
        default: userRoles.USER,
    },
    avatar: {
        type: String,
        default: 'uploads/default-avatar.png'
    },
    emailVerificationToken: {
        type: String,
        select: false,   // مش هيترجع في الـ queries بالافتراضي
    },
    emailVerificationExpires: {
        type: Date,
        select: false,
    },
    isVerified: {
        type: Boolean,
        default: false,
    },

    passwordResetToken: { 
        type: String,
        select: false
    },
    passwordResetExpires: {
        type: Date, 
        select: false 
    },

    tokenVersion: {
        type: Number, 
        default: 0 
    },

})

module.exports = mongoose.model('User', userSchenma)