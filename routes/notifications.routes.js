const express = require("express");
const notificationController = require("../controllers/notifications.controllers");
const verifyToken = require("../middlewares/verifyToken");

const router = express.Router();

router.get("/", verifyToken, notificationController.getMyNotifications);
router.patch("/read-all", verifyToken, notificationController.markAllAsRead);
router.patch("/:id/read", verifyToken, notificationController.markAsRead);

module.exports = router;