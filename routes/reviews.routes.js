const express = require("express");
const reviewController = require("../controllers/reviews.controllers");
const verifyToken = require("../middlewares/verifyToken");

const router = express.Router({ mergeParams: true }); // mergeParams عشان ناخد الـ courseId من الـ URL

router.route("/")
  .get(reviewController.getCourseReviews)
  .post(verifyToken, reviewController.createReview);

module.exports = router;