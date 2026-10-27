const express = require("express");
const courseController = require("../controllers/courses.controllers");
const verifyToken = require("../middlewares/verifyToken");
const userRoles = require("../utils/userRoles");
const allowedTo = require("../middlewares/allowedTo");
const cloudinaryUpload = require("../middlewares/cloudinaryUpload");
const optionalAuth = require("../middlewares/optionalAuth");

const router = express.Router();

// 1️⃣ المسارات الثابتة (لازم تكون فوق خالص)
router.route("/my-courses")
    .get(verifyToken, courseController.getMyCourses);

router.route("/dashboard-stats")
    .get(verifyToken, courseController.getDashboardStats);

    
router.route("/instructor-stats")
    .get(verifyToken,allowedTo(userRoles.INSTRUCTOR , userRoles.ADMIN), courseController.getInstructorStats);


router.route("/admin/dashboard-stats")
    .get(verifyToken, allowedTo(userRoles.ADMIN), courseController.getAdminStats);    

// 2️⃣ المسارات اللي بتستخدم الـ /:courseId
router.route("/")
    .get(courseController.getAllCourse)
    .post(
        verifyToken, 
        allowedTo(userRoles.INSTRUCTOR, userRoles.ADMIN),
        cloudinaryUpload.single("thumbnail"),
        courseController.CreateCourse
    );

router.route("/:courseId")
    .get(optionalAuth, courseController.getSingleCourse)
    .patch(
        verifyToken,
        allowedTo(userRoles.INSTRUCTOR, userRoles.ADMIN),
        cloudinaryUpload.single("thumbnail"),
        courseController.updateCourse
    )
    .delete(
        verifyToken, 
        allowedTo(userRoles.INSTRUCTOR, userRoles.ADMIN),
        courseController.deleteCourse
    );

router.route("/:courseId/enroll")
    .post(
        verifyToken, 
        cloudinaryUpload.single("receipt"), 
        courseController.enrollCourse
    );

router.route("/:courseId/sections")
    .post(
        verifyToken,
        allowedTo(userRoles.INSTRUCTOR, userRoles.ADMIN),
        cloudinaryUpload.single("video"), 
        courseController.addSection
    );

router.route("/:courseId/sections/:sectionId") 
    .delete(
        verifyToken, 
        allowedTo(userRoles.INSTRUCTOR, userRoles.ADMIN), 
        courseController.deleteSection
    )
    .patch(
        verifyToken, 
        allowedTo(userRoles.INSTRUCTOR, userRoles.ADMIN),
        cloudinaryUpload.single("video"),
        courseController.updateSection
    );

router.route("/:courseId/sections/:sectionId/complete")
    .post(
        verifyToken,
        courseController.completeSection
    );

// courses.routes.js
router.route("/admin/pending-enrollments")
    .get(
        verifyToken, 
        allowedTo(userRoles.ADMIN), 
        courseController.getPendingEnrollments
    );

router.route("/admin/enrollments/:enrollmentId")
    .patch(
        verifyToken,
        allowedTo(userRoles.ADMIN),
        courseController.updateEnrollmentStatus
    );
    
router.route("/instructor/revenue")
    .get(
        verifyToken,
        allowedTo(userRoles.INSTRUCTOR),
        courseController.getInstructorRevenue
    );

module.exports = router;