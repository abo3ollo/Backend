const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

// منع المستخدم من كتابة أكتر من مراجعة لنفس الكورس
reviewSchema.index({ user: 1, course: 1 }, { unique: true });

// دالة بتتحدث أوتوماتيك لحساب متوسط التقييم (Rating) في الكورس
reviewSchema.statics.calcAverageRatings = async function (courseId) {
  const stats = await this.aggregate([
    { $match: { course: courseId } },
    {
      $group: {
        _id: "$course",
        nRating: { $sum: 1 },
        avgRating: { $avg: "$rating" },
      },
    },
  ]);

  if (stats.length > 0) {
    await mongoose.model("Course").findByIdAndUpdate(courseId, {
      ratingsQuantity: stats[0].nRating,
      ratingsAverage: stats[0].avgRating,
    });
  } else {
    await mongoose.model("Course").findByIdAndUpdate(courseId, {
      ratingsQuantity: 0,
      ratingsAverage: 4.5, // قيمة افتراضية لو مفيش تقييمات
    });
  }
};

// نشغل الحساب بعد كل إضافة أو تعديل أو مسح
reviewSchema.post("save", function () {
  this.constructor.calcAverageRatings(this.course);
});

reviewSchema.post(/^findOneAnd/, async function (doc) {
  if (doc) await doc.constructor.calcAverageRatings(doc.course);
});

module.exports = mongoose.model("Review", reviewSchema);