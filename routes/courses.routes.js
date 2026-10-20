const express = require("express");
const courseController = require("../controllers/courses.controllers");
const verifyToken = require("../middlewares/verifyToken");
const userRoles = require("../utils/userRoles");
const allowedTo = require("../middlewares/allowedTo");
const cloudinaryUpload = require ("../middlewares/cloudinaryUpload")

const router = express.Router();

router.route("/")
    .get(courseController.getAllCourse)
    .post(
        verifyToken, 
        allowedTo(userRoles.INSTRUCTOR, userRoles.ADMIN), // بس المدرس أو الأدمن
        cloudinaryUpload.single("thumbnail"), // 👈 استقبال الصورة
        courseController.CreateCourse
    );

router.route("/:courseId")
    .get(courseController.getSingleCourse)
    .patch(
        verifyToken,
        allowedTo(userRoles.INSTRUCTOR, userRoles.ADMIN),
        cloudinaryUpload.single("thumbnail"), // 👈 استقبال الصورة لو هيتعدل
        courseController.updateCourse
    )
    .delete(
        verifyToken, 
        allowedTo(userRoles.ADMIN), // الحذف للأدمن بس
        courseController.deleteCourse
    );

router.route("/:courseId/enroll")
    .post(
        verifyToken, 
        courseController.enrollCourse
    );

module.exports = router;