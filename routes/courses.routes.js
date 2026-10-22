const express = require("express");
const courseController = require("../controllers/courses.controllers");
const verifyToken = require("../middlewares/verifyToken");
const userRoles = require("../utils/userRoles");
const allowedTo = require("../middlewares/allowedTo");
const cloudinaryUpload = require ("../middlewares/cloudinaryUpload");
const optionalAuth = require("../middlewares/optionalAuth");

const router = express.Router();

router.route("/")
    .get(courseController.getAllCourse)
    .post(
        verifyToken, 
        allowedTo(userRoles.INSTRUCTOR, userRoles.ADMIN), // بس المدرس أو الأدمن
        cloudinaryUpload.single("thumbnail"), // 👈 استقبال الصورة
        courseController.CreateCourse
    );
    
router.route("/my-courses")
    .get(verifyToken, courseController.getMyCourses);

router.route("/:courseId")
    .get(optionalAuth,courseController.getSingleCourse)
    .patch(
        verifyToken,
        allowedTo(userRoles.INSTRUCTOR, userRoles.ADMIN),
        cloudinaryUpload.single("thumbnail"), // 👈 استقبال الصورة لو هيتعدل
        courseController.updateCourse
    )
    .delete(
        verifyToken, 
        allowedTo(userRoles.INSTRUCTOR, userRoles.ADMIN), // الحذف للأدمن بس
        courseController.deleteCourse
    );

router.route("/:courseId/enroll")
    .post(
        verifyToken, 
        courseController.enrollCourse
    );

router.route("/:courseId/sections")
    .post(
        verifyToken,
        allowedTo(userRoles.INSTRUCTOR,userRoles.ADMIN),
        cloudinaryUpload.single("video"), 
        courseController.addSection
    )


router.route("/:courseId/sections/:sectionId") 
    .delete(
        verifyToken, 
        allowedTo(userRoles.INSTRUCTOR, userRoles.ADMIN), 
        courseController.deleteSection
    )


router.route("/:courseId/sections/:sectionId") 
    .patch(
        verifyToken, 
        allowedTo(userRoles.INSTRUCTOR, userRoles.ADMIN),
        cloudinaryUpload.single("video"), // لو هيعدل الفيديو
        courseController.updateSection
    )


module.exports = router;