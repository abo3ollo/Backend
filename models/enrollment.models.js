const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    completedSections: [{ type: mongoose.Schema.Types.ObjectId }],
    
    // ✅ حقول الدفع الجديدة
    paymentStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending", // الطالب بيدفع، فبيبقى معلق لحد ما الأدمن يوافق
    },
    receiptImage: {
      type: String, // لينك صورة الإيصال من Cloudinary
    },
    amountPaid: {
      type: Number,
      required: true,
    },
    // نسبة المنصة (15%) والمدرس (85%)
    platformFee: { type: Number },
    instructorEarnings: { type: Number },
  },
  { timestamps: true }
);

// منع المستخدم إنه يتسجل في نفس الكورس مرتين
enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });

module.exports = mongoose.model("Enrollment", enrollmentSchema);