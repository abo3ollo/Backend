const Review = require("../models/review.models");
const Course = require("../models/courses.models");
const Enrollment = require("../models/enrollment.models");
const asyncWrapper = require("../middlewares/asyncWrapper");
const appError = require("../utils/appError");
const httpStatusText = require("../utils/httpStatusText");

// إضافة مراجعة جديدة
const createReview = asyncWrapper(async (req, res, next) => {
  const { courseId } = req.params;
  const { rating, comment } = req.body;
  const userId = req.user.id;

  // 1. التأكد إن الكورس موجود
  const course = await Course.findById(courseId);
  if (!course) return next(appError.create("Course not found", 404, httpStatusText.FAIL));

  // 2. التأكد إن الطالب مشترك في الكورس
  const enrollment = await Enrollment.findOne({ user: userId, course: courseId });
  if (!enrollment) {
    return next(appError.create("You must be enrolled to review this course", 403, httpStatusText.FAIL));
  }

  // 3. التأكد إنه مش هو المدرس
  if (course.instructor.toString() === userId) {
    return next(appError.create("Instructors cannot review their own course", 400, httpStatusText.FAIL));
  }

  // 4. إنشاء المراجعة
  const review = await Review.create({
    user: userId,
    course: courseId,
    rating: Number(rating),
    comment,
  });

  res.status(201).json({
    status: httpStatusText.SUCCESS,
    data: { review },
  });
});

// جلب كل مراجعات كورس معين
const getCourseReviews = asyncWrapper(async (req, res) => {
  const { courseId } = req.params;
  
  const reviews = await Review.find({ course: courseId })
    .populate("user", "firstName lastName avatar") // بنجيب بيانات اليوزر عشان نعرض اسمه
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: httpStatusText.SUCCESS,
    results: reviews.length,
    data: { reviews },
  });
});

module.exports = {
  createReview,
  getCourseReviews,
};