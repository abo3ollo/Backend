const Course = require("../models/courses.models");
const httpStatusText = require("../utils/httpStatusText");
const appError = require("../utils/appError");
const asyncWrapper = require("../middlewares/asyncWrapper");
const Enrollment = require("../models/enrollment.models");
const Review = require("../models/review.models");
const Notification = require("../models/notification.models");
const User = require("../models/user.models"); 
const crypto = require("crypto"); 


const getAllCourse = asyncWrapper(async (req, res) => {
    const queryObj = { ...req.query };

    // 1. شيل الحقول اللي مش بنفلتر بيها من الـ query
    const excludedFields = ["page", "sort", "limit", "fields", "search"];
    excludedFields.forEach((el) => delete queryObj[el]);

    // 2. فلترة الحقول العادية (زي category, level)
    let queryStr = JSON.stringify(queryObj);
    // تحويل العمليات زي gte, lte, gt, lt لصيغة Mongoose ($gte, $lte...)
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);

    let query = Course.find(JSON.parse(queryStr));

    // 3. البحث بالكلمة المفتاحية (Search by title)
    if (req.query.search) {
        query = query.find({
            title: { $regex: req.query.search, $options: "i" },
        });
    }

    // 4. الترتيب (Sorting)
    if (req.query.sort) {
        const sortBy = req.query.sort.split(",").join(" ");
        query = query.sort(sortBy);
    } else {
        query = query.sort("-createdAt"); // الافتراضي: الأحدث الأول
    }

    // 5. التقسيم لصفحات (Pagination)
    const limit = req.query.limit * 1 || 12;
    const page = req.query.page * 1 || 1;
    const skip = (page - 1) * limit;

    query = query.skip(skip).limit(limit);

    // 6. جلب بيانات المدرس مع الكورس
    query = query.populate("instructor", "firstName lastName avatar");

    const courses = await query;

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        results: courses.length,
        data: { courses },
    });
});

const getSingleCourse = asyncWrapper(async (req, res, next) => {
    const courseId = req.params.courseId;

    const course = await Course.findById(courseId).populate(
        "instructor",
        "firstName lastName avatar",
    );

    if (!course) {
        return next(appError.create("Course not found", 404, httpStatusText.FAIL));
    }

    let isAuthorized = false;
    let completedSections = [];
    let enrollmentStatus = null;

    if (req.user) {
        if (
            course.instructor._id.toString() === req.user.id.toString() ||
            req.user.role === "ADMIN"
        ) {
            isAuthorized = true;
        } else {
            // ✅ بنجيب الـ enrollment عشان نعرف هو مخلص إيه
            const enrollment = await Enrollment.findOne({
                user: req.user.id,
                course: courseId,
            });

            if (enrollment) {
                enrollmentStatus = enrollment.paymentStatus;
                if (enrollment.paymentStatus === "approved") {
                    isAuthorized = true;
                    completedSections = enrollment.completedSections;
                }
            }
        }
    }

    let courseData = course.toObject();

    if (!isAuthorized) {
        if (courseData.sections) {
            courseData.sections = courseData.sections.map((section) => ({
                ...section,
                videoUrl: undefined,
            }));
        }
    }

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        // ✅ ضفنا completedSections في الـ response
        data: { course: courseData, isAuthorized, completedSections , enrollmentStatus },
    });
});

const getMyCourses = asyncWrapper(async (req, res, next) => {
    const enrollments = await Enrollment.find({ user: req.user.id }).populate({
        path: "course",
        populate: {
            path: "instructor",
            select: "firstName lastName avatar",
        },
    });

    const courses = enrollments.map((enrollment) => {
        if (!enrollment.course) return null; // لو الكورس اتمسح
        
        const course = enrollment.course.toObject();
        const totalSections = course.sections ? course.sections.length : 0;
        const completedCount = enrollment.completedSections.length;
        const progress = totalSections === 0 ? 0 : Math.round((completedCount / totalSections) * 100);

        return {
            ...course,
            progress,
            completedCount,
            totalSections,
            paymentStatus: enrollment.paymentStatus, // ✅ بنبعت حالة الدفع
        };
    }).filter(Boolean);

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        results: courses.length,
        data: { courses },
    });
});

const CreateCourse = asyncWrapper(async (req, res, next) => {
    // ✅ استقبلنا الحقول الجديدة كلها
    const {
        title,
        description,
        price,
        category,
        level,
        isPublished,
        subtitle,
        language,
        promoVideo,
        promotionalPrice,
        sections,
    } = req.body;

    const thumbnail = req.file
        ? req.file.secure_url || req.file.path
        : "https://res.cloudinary.com/demo/image/upload/default-course.jpg";

    // ✅ بنعمل parse للـ sections لأنها بتيجي كـ String من الـ FormData
    let parsedSections = [];
    if (sections) {
        try {
            parsedSections = JSON.parse(sections);
        } catch (err) {
            console.error("Error parsing sections:", err);
        }
    }

    const newCourse = await Course.create({
        title,
        description,
        price,
        category,
        level,
        subtitle,
        language,
        promoVideo,
        promotionalPrice: promotionalPrice ? Number(promotionalPrice) : undefined,
        isPublished: isPublished === "true" || isPublished === true,
        thumbnail,
        instructor: req.user.id,
        sections: parsedSections, // ✅ حفظ الأقسام
    });

    res
        .status(201)
        .json({ status: httpStatusText.SUCCESS, data: { course: newCourse } });
});

const updateCourse = asyncWrapper(async (req, res, next) => {
    const courseId = req.params.courseId;

    const course = await Course.findById(courseId);
    if (!course) {
        return next(appError.create("Course not found", 404, httpStatusText.FAIL));
    }

    // التأكد إن اللي بيعدل هو صاحب الكورس أو أدمن
    if (
        course.instructor.toString() !== req.user.id.toString() &&
        req.user.role !== "ADMIN"
    ) {
        return next(appError.create("Unauthorized", 403, httpStatusText.FAIL));
    }

    const updateData = { ...req.body };

    // لو المدرس رفع صورة جديدة، نحدث اللينك
    if (req.file) {
        updateData.thumbnail = req.file.secure_url || req.file.path;
    }

    // تحويل الأسعار لأرقام لو جت كـ string
    if (updateData.price) updateData.price = Number(updateData.price);
    if (updateData.promotionalPrice)
        updateData.promotionalPrice = Number(updateData.promotionalPrice);

    const updatedCourse = await Course.findByIdAndUpdate(
        courseId,
        { $set: updateData },
        { new: true, runValidators: true },
    );

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        data: { course: updatedCourse },
    });
});

const deleteCourse = asyncWrapper(async (req, res) => {
    await Course.deleteOne({ _id: req.params.courseId });
    res.status(200).json({ status: httpStatusText.SUCCESS, data: null });
});

const enrollCourse = asyncWrapper(async (req, res, next) => {
    const courseId = req.params.courseId;
    const userId = req.user.id;

    const course = await Course.findById(courseId);
    if (!course)
        return next(appError.create("Course not found", 404, httpStatusText.FAIL));

    // ✅ التأكد إن المستخدم مش متسجل بالفعل أو عنده طلب معلق
    const existingEnrollment = await Enrollment.findOne({
        user: userId,
        course: courseId,
    });

    if (existingEnrollment) {
        if (existingEnrollment.paymentStatus === "pending") {
            return next(
                appError.create(
                    "Your enrollment request is already pending. Please wait for admin approval.",
                    400,
                    httpStatusText.FAIL
                )
            );
        }
        if (existingEnrollment.paymentStatus === "approved") {
            return next(
                appError.create(
                    "You are already enrolled in this course.",
                    400,
                    httpStatusText.FAIL
                )
            );
        }
        if (existingEnrollment.paymentStatus === "rejected") {
             // لو الطالب اترفض قبل كده، بنسمحله يرفع إيصال تاني (بنمسح القديم أو بنعدله)
             // الأسهل: نمسح الطلب القديم المرفوض ونكمل عشان ينشئ واحد جديد
             await Enrollment.findByIdAndDelete(existingEnrollment._id);
        }
    }

    // ... باقي كود رفع الإيصال زي ما هو
    if (!req.file) {
        return next(appError.create("Please upload a payment receipt", 400, httpStatusText.FAIL));
    }

    const receiptImage = req.file.path;
    const amountPaid = course.price;
    const platformFee = amountPaid * 0.15;
    const instructorEarnings = amountPaid - platformFee;

    const enrollment = await Enrollment.create({
        user: userId,
        course: courseId,
        receiptImage,
        amountPaid,
        platformFee,
        instructorEarnings,
        paymentStatus: "pending",
    });

    res.status(201).json({
        status: httpStatusText.SUCCESS,
        message: "Enrollment submitted successfully! Please wait for admin approval.",
        data: { enrollment },
    });
});

const addSection = asyncWrapper(async (req, res, next) => {
    const courseId = req.params.courseId;
    const course = await Course.findById(courseId);

    if (!course) {
        return next(appError.create("Course not found", 404, httpStatusText.FAIL));
    }

    if (
        course.instructor.toString() !== req.user.id.toString() &&
        req.user.role !== "ADMIN"
    ) {
        return next(appError.create("Unauthorized", 403, httpStatusText.FAIL));
    }

    // ✅ بنستقبل الـ videoId من الـ body
    const { videoId } = req.body;
    
    // ✅ بنبني لينك المشاهدة من Bunny Stream
    let videoUrl;
    if (videoId) {
        videoUrl = `https://iframe.mediadelivery.net/embed/${process.env.BUNNY_LIBRARY_ID}/${videoId}`;
    }

    // نضيف القسم مع الفيديو
    course.sections.push({
        ...req.body,
        videoUrl: videoUrl, // اللينك من Bunny
    });

    await course.save();

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        data: { course },
    });
});

// ── تحديث قسم (لو عايز تعدل اسمه أو الفيديو) ──
const updateSection = asyncWrapper(async (req, res, next) => {
    const { courseId, sectionId } = req.params;
    const course = await Course.findById(courseId);

    if (!course)
        return next(appError.create("Course not found", 404, httpStatusText.FAIL));
    if (
        course.instructor.toString() !== req.user.id &&
        req.user.role !== "ADMIN"
    ) {
        return next(appError.create("Unauthorized", 403, httpStatusText.FAIL));
    }

    const section = course.sections.id(sectionId);
    if (!section)
        return next(appError.create("Section not found", 404, httpStatusText.FAIL));

    // تحديث البيانات (سواء نصية أو الفيديو لو اترفع جديد)
    section.title = req.body.title || section.title;
    section.learningObjective =
        req.body.learningObjective || section.learningObjective;
    section.duration = req.body.duration || section.duration;

    // ✅ لو فيه videoId جديد، بنحدث لينك الفيديو
    const { videoId } = req.body;
    if (videoId) {
        section.videoUrl = `https://iframe.mediadelivery.net/embed/${process.env.BUNNY_LIBRARY_ID}/${videoId}`;
    }

    await course.save();
    res.status(200).json({ status: httpStatusText.SUCCESS, data: { course } });
});

// ── حذف قسم ──
const deleteSection = asyncWrapper(async (req, res, next) => {
    const { courseId, sectionId } = req.params;
    const course = await Course.findById(courseId);

    if (!course)
        return next(appError.create("Course not found", 404, httpStatusText.FAIL));
    if (
        course.instructor.toString() !== req.user.id &&
        req.user.role !== "ADMIN"
    ) {
        return next(appError.create("Unauthorized", 403, httpStatusText.FAIL));
    }

    // بنشيل القسم من المصفوفة
    course.sections = course.sections.filter(
        (sec) => sec._id.toString() !== sectionId,
    );

    await course.save();
    res.status(200).json({ status: httpStatusText.SUCCESS, data: { course } });
});

const completeSection = asyncWrapper(async (req, res, next) => {
    const { courseId, sectionId } = req.params;
    const userId = req.user.id;

    // 1. التأكد إن الطالب مشترك
    const enrollment = await Enrollment.findOne({
        user: userId,
        course: courseId,
    });
    if (!enrollment) {
        return next(
            appError.create(
                "You are not enrolled in this course",
                403,
                httpStatusText.FAIL,
            ),
        );
    }

    // 2. التأكد إنه مش مكرر
    if (!enrollment.completedSections.includes(sectionId)) {
        enrollment.completedSections.push(sectionId);
        await enrollment.save();
    }

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        message: "Section marked as completed",
        data: { completedSections: enrollment.completedSections },
    });
});

const getDashboardStats = asyncWrapper(async (req, res) => {
    // 1. بنجيب كل الكورسات اللي الطالب مشترك فيها
    const enrollments = await Enrollment.find({ user: req.user.id })
        .populate({
            path: "course",
            populate: {
                path: "instructor",
                select: "firstName lastName avatar",
            },
        })
        .sort({ updatedAt: -1 }); // بنجيب الأحدث الأول

    let completedCoursesCount = 0;
    let continueLearningCourse = null;

    // 2. بنحسب الإحصائيات
    enrollments.forEach((enrollment) => {
        const course = enrollment.course;
        if (!course) return;

        const totalSections = course.sections ? course.sections.length : 0;
        const completedCount = enrollment.completedSections.length;

        // لو عدد الأقسام المكتملة يساوي كل الأقسام (وكمان الكورس فيه أقسام)
        if (totalSections > 0 && completedCount === totalSections) {
            completedCoursesCount++;
        } else if (!continueLearningCourse) {
            // أول كورس مش مكتمل (وهو الأحدث بفضل الـ sort) هنخليه للـ Continue Learning
            const progress =
                totalSections === 0
                    ? 0
                    : Math.round((completedCount / totalSections) * 100);
            continueLearningCourse = {
                ...course.toObject(),
                progress,
                completedCount,
                totalSections,
            };
        }
    });

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        data: {
            enrolledCount: enrollments.length,
            completedCount: completedCoursesCount,
            continueLearningCourse, // ممكن يكون null لو كل الكورسات مكتملة أو مفيش كورسات
        },
    });
});

const getAdminStats = asyncWrapper(async (req, res) => {
    const totalUsers = await User.countDocuments({ role: "USER" });
    const totalInstructors = await User.countDocuments({ role: "INSTRUCTOR" });
    const totalCourses = await Course.countDocuments();

    // بنجيب كل الاشتراكات اللي اتدفعت واتوافق عليها عشان نحسب أرباح المنصة
    const approvedEnrollments = await Enrollment.find({ paymentStatus: "approved" });
    
    let platformRevenue = 0;
    approvedEnrollments.forEach((enrollment) => {
        platformRevenue += enrollment.platformFee;
    });

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        data: {
            totalUsers,
            totalInstructors,
            totalCourses,
            platformRevenue,
        },
    });
});

const getInstructorStats = asyncWrapper(async (req, res) => {
    const instructorId = req.user.id;

    // 1. بنجيب كل الكورسات بتاعة المدرس
    const courses = await Course.find({ instructor: instructorId });

    const totalCourses = courses.length;
    const courseIds = courses.map((course) => course._id);

    // 2. بنجيب عدد الطلاب المشتركين في كل الكورسات دي
    const totalStudents = await Enrollment.countDocuments({
        course: { $in: courseIds },
    });

    // 3. بنحسب متوسط التقييمات
    const reviews = await Review.find({ course: { $in: courseIds } });
    let avgRating = 0;
    if (reviews.length > 0) {
        const totalRating = reviews.reduce((acc, item) => item.rating + acc, 0);
        avgRating = (totalRating / reviews.length).toFixed(1);
    }

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        data: {
            totalCourses,
            totalStudents,
            avgRating,
            courses, // ممكن نبعت الكورسات كمان لو عايزين نعرضها
        },
    });
});


// للأدمن: جلب كل طلبات الاشتراك المعلقة
const getPendingEnrollments = asyncWrapper(async (req, res) => {
    const enrollments = await Enrollment.find({ paymentStatus: "pending" })
        .populate("user", "firstName lastName email")
        .populate("course", "title price");
    res.status(200).json({ status: httpStatusText.SUCCESS, data: { enrollments } });
});

// للأدمن: الموافقة أو الرفض
const updateEnrollmentStatus = asyncWrapper(async (req, res, next) => {
    const { enrollmentId } = req.params;
    const { status } = req.body; // approved أو rejected

    if (!["approved", "rejected"].includes(status)) {
        return next(appError.create("Invalid status", 400, httpStatusText.FAIL));
    }

    const enrollment = await Enrollment.findByIdAndUpdate(
        enrollmentId,
        { paymentStatus: status },
        { new: true }
    );

    res.status(200).json({ status: httpStatusText.SUCCESS, data: { enrollment } });
});

// للمدرس: كشف حساب
const getInstructorRevenue = asyncWrapper(async (req, res) => {
    const instructorId = req.user.id;
    
    // بنجيب كل الكورسات بتاعته
    const courses = await Course.find({ instructor: instructorId }).select("_id title price");
    const courseIds = courses.map(c => c._id);

    // بنجيب كل الاشتراكات اللي اتدفعت واتوافق عليها في الكورسات دي
    const enrollments = await Enrollment.find({
        course: { $in: courseIds },
        paymentStatus: "approved",
    });

    let totalRevenue = 0;
    let totalPlatformFee = 0;
    let netRevenue = 0;

    enrollments.forEach((enrollment) => {
        totalRevenue += enrollment.amountPaid;
        totalPlatformFee += enrollment.platformFee;
        netRevenue += enrollment.instructorEarnings;
    });

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        data: {
            totalCourses: courses.length,
            totalStudents: enrollments.length,
            totalRevenue,
            totalPlatformFee,
            netRevenue, // صافي أرباح المدرس
        },
    });
});

const getAllInstructorsFinancials = asyncWrapper(async (req, res) => {
    // 1. بنجيب كل المدرسين
    const instructors = await User.find({ role: "INSTRUCTOR" }).select("firstName lastName email avatar");

    const financials = await Promise.all(instructors.map(async (instructor) => {
        // 2. بنجيب كورسات المدرس ده
        const courses = await Course.find({ instructor: instructor._id }).select("_id");
        const courseIds = courses.map(c => c._id);

        // 3. بنجيب كل الاشتراكات المقبولة في الكورسات دي
        const enrollments = await Enrollment.find({
            course: { $in: courseIds },
            paymentStatus: "approved",
        });

        // 4. بنحسب الأرقام
        let totalSales = 0;
        let platformCut = 0;
        let instructorCut = 0;

        enrollments.forEach((enrollment) => {
            totalSales += enrollment.amountPaid;
            platformCut += enrollment.platformFee;
            instructorCut += enrollment.instructorEarnings;
        });

        return {
            _id: instructor._id,
            name: `${instructor.firstName} ${instructor.lastName}`,
            email: instructor.email,
            avatar: instructor.avatar,
            totalCourses: courses.length,
            totalStudents: enrollments.length,
            totalSales,
            platformCut,
            instructorCut,
        };
    }));

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        results: financials.length,
        data: { financials },
    });
});


const getBunnyUploadSignature = asyncWrapper(async (req, res, next) => {
    const { title } = req.body;
    
    // 1. إنشاء فيديو في Bunny Stream
    const createVideoRes = await fetch(`https://video.bunnycdn.com/library/${process.env.BUNNY_LIBRARY_ID}/videos`, {
        method: "POST",
        headers: {
            "AccessKey": process.env.BUNNY_API_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: title || "New Video" }),
    });

    if (!createVideoRes.ok) {
        return next(appError.create("Failed to create video in Bunny", 500, httpStatusText.FAIL));
    }

    const videoData = await createVideoRes.json();
    const videoId = videoData.guid;

    // 2. إنشاء التوقيع (Signature) للرفع
    const libraryId = process.env.BUNNY_LIBRARY_ID;
    const apiKey = process.env.BUNNY_API_KEY;
    const expirationTime = Math.floor(Date.now() / 1000) + 3600; // صالح لمدة ساعة
    
    // Bunny TUS بيحتاج التوقيع يكون بالشكل ده: sha256(library_id + api_key + expiration_time + video_id)
    const signatureString = `${libraryId}${apiKey}${expirationTime}${videoId}`;
    const signature = crypto.createHash('sha256').update(signatureString).digest('hex');

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        data: {
            videoId,
            libraryId,
            signature,
            expirationTime,
        },
    });
});


const getSignedBunnyUrl = asyncWrapper(async (req, res, next) => {
    const { videoId } = req.params;

    // التأكد إن المستخدم مشترك في الكورس اللي فيه الفيديو ده (اختياري بس مهم جداً)
    // هنفترض هنا إنك بتعمل check قبل كده أو هتعمله في دالة getSingleCourse

    const libraryId = process.env.BUNNY_LIBRARY_ID;
    const tokenAuthKey = process.env.BUNNY_TOKEN_AUTH_KEY;
    
    // اللينك هيبقى صالح لمدة ساعة (3600 ثانية)
    const expires = Math.floor(Date.now() / 1000) + 3600;

    // التوقيع (Hash) باستخدام SHA-256
    const token = crypto
        .createHash("sha256")
        .update(`${tokenAuthKey}${videoId}${expires}`)
        .digest("hex");

    const signedUrl = `https://player.mediadelivery.net/embed/${libraryId}/${videoId}?token=${token}&expires=${expires}`;

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        data: { signedUrl },
    });
});

module.exports = {
    getAllCourse,
    getSingleCourse,
    getMyCourses,
    CreateCourse,
    updateCourse,
    deleteCourse,
    enrollCourse,
    addSection,
    updateSection,
    deleteSection,
    completeSection,
    getDashboardStats,
    getAdminStats,
    getInstructorStats,
    getPendingEnrollments,
    updateEnrollmentStatus,
    getInstructorRevenue,
    getAllInstructorsFinancials,
    getBunnyUploadSignature,
    getSignedBunnyUrl

};
