const User = require("../models/user.models");
const asyncWrapper = require("../middlewares/asyncWrapper");
const httpStatusText = require("../utils/httpStatusText")



const getAllusers = asyncWrapper(
    async (req, res) => {

        const query = req.query;
        const limit = query.limit || 10;
        const page = query.page || 1;
        const skip = (page - 1) * limit;

        // get all users from db using user model
        const users = await User.find({}, { "__v": false, "password": false }).limit(limit).skip(skip);
        res.json({ status: httpStatusText.SUCCESS, data: { users } });
});


const getMe = asyncWrapper(async (req, res, next) => {
    const user = await User.findById(req.user.id);
    if (!user) {
        return next(appError.create("User not found", 404, httpStatusText.FAIL));
    }

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        data: { user },
    });
});


const updateMe = asyncWrapper(async (req, res, next) => {
    const { firstName, lastName } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
        return next(appError.create("User not found", 404, httpStatusText.FAIL));
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;

    const updatedUser = await user.save({ validateBeforeSave: false });

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        data: { user: updatedUser },
    });
});


const changePassword = asyncWrapper(async (req, res, next) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return next(appError.create("Passwords are required", 400, httpStatusText.FAIL));
    }

    // بنجيب اليوزر بالباسورد
    const user = await User.findById(req.user.id).select("+password");

    const matchedPassword = await bcrypt.compare(currentPassword, user.password);
    if (!matchedPassword) {
        return next(appError.create("Incorrect current password", 401, httpStatusText.FAIL));
    }

    user.password = await bcrypt.hash(newPassword, 10);
    
    // اقتل كل الجلسات القديمة
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    
    await user.save({ validateBeforeSave: false });

    // امسح الكوكي عشان يدخل تاني
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
    });

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        message: "Password changed successfully. Please log in again.",
    });
});


const uploadAvatar = asyncWrapper(async (req, res, next) => {
    if (!req.file) {
        return next(appError.create("Please upload an image", 400, httpStatusText.FAIL));
    }

    const imageUrl = req.file.secure_url || req.file.url || req.file.path;

    const user = await User.findByIdAndUpdate(
        req.user.id,
        { avatar: imageUrl },
        { new: true, runValidators: true }
    );

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        data: { user },
    });
});

// ── Update User Role (Admin) ──
const updateUserRole = asyncWrapper(async (req, res, next) => {
    const { userId } = req.params;
    const { role } = req.body;

    // تأكد إن الـ role صالح (بناءً على الـ enum اللي في الموديل)
    const validRoles = ["USER", "INSTRUCTOR", "ADMIN"];
    if (!validRoles.includes(role)) {
        return next(appError.create("Invalid role", 400, httpStatusText.FAIL));
    }

    const user = await User.findByIdAndUpdate(
        userId,
        { role },
        { new: true, runValidators: true }
    );

    if (!user) {
        return next(appError.create("User not found", 404, httpStatusText.FAIL));
    }

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        data: { user },
    });
});

// ── Delete User (Admin) ──
const deleteUser = asyncWrapper(async (req, res, next) => {
    const { userId } = req.params;

    // منع الأدمن إنه يمسح نفسه
    if (userId === req.user.id.toString()) {
        return next(appError.create("You cannot delete your own account", 400, httpStatusText.FAIL));
    }

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
        return next(appError.create("User not found", 404, httpStatusText.FAIL));
    }

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        message: "User deleted successfully"
    });
});


module.exports = {
    getAllusers,
    getMe,
    updateMe,
    changePassword,
    uploadAvatar,
    updateUserRole,
    deleteUser,
}