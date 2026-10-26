const Notification = require("../models/notification.models");
const asyncWrapper = require("../middlewares/asyncWrapper");
const httpStatusText = require("../utils/httpStatusText");

// جلب إشعارات المستخدم
const getMyNotifications = asyncWrapper(async (req, res) => {
  const notifications = await Notification.find({ recipient: req.user.id })
    .populate("sender", "firstName lastName avatar")
    .sort({ createdAt: -1 })
    .limit(20); // بنجيب أحدث 20 إشعار

  const unreadCount = await Notification.countDocuments({ 
    recipient: req.user.id, 
    isRead: false 
  });

  res.status(200).json({
    status: httpStatusText.SUCCESS,
    data: { notifications, unreadCount },
  });
});

// تعليم إشعار كمقروء
const markAsRead = asyncWrapper(async (req, res) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user.id },
    { isRead: true }
  );

  res.status(200).json({ status: httpStatusText.SUCCESS, message: "Marked as read" });
});

// تعليم كل الإشعارات كمقروءة
const markAllAsRead = asyncWrapper(async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user.id, isRead: false },
    { isRead: true }
  );

  res.status(200).json({ status: httpStatusText.SUCCESS, message: "All marked as read" });
});

module.exports = {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
};