const mongoose = require("mongoose");
const validator = require("validator");
const userRoles = require("../utils/userRoles");

const userSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: true,
        },
        lastName: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            validate: [validator.isEmail, 'Must be valid email'],
        },
        password: {
            type: String,
            required: true,
            select: false,
        },
        token: {
            type: String,
            // select: false,
        },
        role: {
            type: String,
            enum: [userRoles.ADMIN, userRoles.INSTRUCTOR, userRoles.USER],
            default: userRoles.USER,
        },
        avatar: {
            type: String,
            default: 'https://res.cloudinary.com/YOUR_CLOUD_NAME/image/upload/v1/default-avatar.png',
        },
        emailVerificationToken: {
            type: String,
            select: false,
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
            select: false,
        },
        passwordResetExpires: {
            type: Date,
            select: false,
        },
        tokenVersion: {
            type: Number,
            default: 0,
        },
        refreshToken: {
            type: String,
            select: false, // عشان ميبقاش ظاهر في أي response
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (doc, ret) => {
                delete ret.password;
                // delete ret.token;
                delete ret.__v;
                // delete ret.tokenVersion;
                // delete ret.emailVerificationToken;
                // delete ret.emailVerificationExpires;
                delete ret.passwordResetToken;
                delete ret.passwordResetExpires;
                return ret;
            },
        },
    }
);

module.exports = mongoose.model('User', userSchema);