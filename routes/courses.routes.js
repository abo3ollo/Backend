const express = require("express");


const courseController = require("../controllers/courses.controllers");
const { ValidationSchema } = require("../middlewares/validationsSchema");
const verifyToken = require("../middlewares/verifyToken");
const userRoles = require("../utils/userRoles");
const allowedTo = require("../middlewares/allowedTo");

const router = express.Router();

router.route("/")
            .get(courseController.getAllCourse)
            .post(verifyToken, ValidationSchema(),
                courseController.CreateCourse,
            );

router.route("/:courseId")
            .get(courseController.getSingleCourse)
            .patch(courseController.updateCourse)
            .delete(verifyToken, allowedTo(userRoles.ADMIN), courseController.deleteCourse)


module.exports = router;
