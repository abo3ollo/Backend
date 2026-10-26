const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Course title is required"],
      trim: true,
    },
    subtitle: { type: String }, // ✅ جديد: العنوان الفرعي
    description: {
      type: String,
      required: [true, "Course description is required"],
    },
    price: {
      type: Number,
      required: [true, "Course price is required"],
      min: 0,
    },
    promotionalPrice: { type: Number }, // ✅ جديد: السعر المخفض
    language: { type: String, default: "English" }, // ✅ جديد: اللغة
    thumbnail: {
      type: String,
      default:
        "https://res.cloudinary.com/demo/image/upload/default-course.jpg",
    },
    promoVideo: { type: String }, // ✅ جديد: لينك فيديو ترويجي
    category: { type: String, required: [true, "Category is required"] },
    level: {
      type: String,
      enum: ["All Levels", "Beginner", "Intermediate", "Advanced"],
      default: "Beginner",
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isPublished: { type: Boolean, default: false },
    certificate: { type: Boolean, default: true }, // ✅ جديد: شهادة إتمام

    // ✅ جديد: هيكل الأقسام والدروس
    sections: [
      {
        title: { type: String, required: true },
        learningObjective: { type: String }, // ✅ جديد
        introVideoTitle: { type: String }, // ✅ جديد
        duration: { type: String }, // ✅ جديد
        videoUrl: { type: String }, // ✅ جديد
        isFreePreview: { type: Boolean, default: false }, // ✅ جديد
        isDraft: { type: Boolean, default: false }, // ✅ جديد
        lessons: [
          {
            title: { type: String, required: true },
            duration: { type: String },
            videoUrl: { type: String },
          },
        ],
      },
    ],

    ratingsAverage: {
      type: Number,
      default: 4.5,
    },
    ratingsQuantity: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Course", courseSchema);
