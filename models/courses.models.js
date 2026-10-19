const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Course title is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Course description is required"],
    },
    price: {
      type: Number,
      required: [true, "Course price is required"],
      min: 0,
    },
    thumbnail: {
      type: String,
      default: "https://res.cloudinary.com/demo/image/upload/default-course.jpg", // صورة افتراضية
    },
    category: {
      type: String,
      required: [true, "Category is required"],
    },
    level: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced"],
      default: "Beginner",
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isPublished: {
      type: Boolean,
      default: false, // الكورس بيتنشر لما المدرس يخلصه
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Course", courseSchema);