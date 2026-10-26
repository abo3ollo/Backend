const Course = require("../models/courses.models");
const httpStatusText = require("../utils/httpStatusText");
const appError = require('../utils/appError');
const asyncWrapper = require("../middlewares/asyncWrapper");
const Enrollment = require("../models/enrollment.models"); 


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
        data: { courses } 
    });
});

const getSingleCourse = asyncWrapper(async (req, res, next) => {
    const courseId = req.params.courseId;
    
    const course = await Course.findById(courseId).populate(
        "instructor", 
        "firstName lastName avatar"
    );

    if (!course) {
        return next(appError.create("Course not found", 404, httpStatusText.FAIL));
    }

    let isAuthorized = false;
    let completedSections = [];

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
                isAuthorized = true;
                // ✅ بنبعت الأقسام المكتملة
                completedSections = enrollment.completedSections; 
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
        data: { course: courseData, isAuthorized, completedSections }, 
    });
});

const getMyCourses = asyncWrapper(async (req, res, next) => {
    const enrollments = await Enrollment.find({ user: req.user.id })
        .populate({
            path: "course",
            populate: {
                path: "instructor",
                select: "firstName lastName avatar",
            },
        });

    // ✅ بنحسب نسبة التقدم لكل كورس
    const courses = enrollments.map((enrollment) => {
        const course = enrollment.course.toObject();
        const totalSections = course.sections ? course.sections.length : 0;
        const completedCount = enrollment.completedSections.length;
        
        const progress = totalSections === 0 ? 0 : Math.round((completedCount / totalSections) * 100);

        return {
            ...course,
            progress, // النسبة المئوية
            completedCount,
            totalSections
        };
    });

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        results: courses.length,
        data: { courses },
    });
});

const CreateCourse = asyncWrapper(async (req, res, next) => {
    // ✅ استقبلنا الحقول الجديدة كلها
    const { 
        title, description, price, category, level, isPublished,
        subtitle, language, promoVideo, promotionalPrice, sections 
    } = req.body;

    const thumbnail = req.file 
        ? (req.file.secure_url || req.file.path) 
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
        isPublished: isPublished === 'true' || isPublished === true,
        thumbnail,
        instructor: req.user.id,
        sections: parsedSections, // ✅ حفظ الأقسام
    });

    res.status(201).json({ status: httpStatusText.SUCCESS, data: { course: newCourse } });
});

const updateCourse = asyncWrapper(async (req, res, next) => {
    const courseId = req.params.courseId;
    
    const course = await Course.findById(courseId);
    if (!course) {
        return next(appError.create("Course not found", 404, httpStatusText.FAIL));
    }

    // التأكد إن اللي بيعدل هو صاحب الكورس أو أدمن
    if (course.instructor.toString() !== req.user.id.toString() && req.user.role !== 'ADMIN') {
        return next(appError.create("Unauthorized", 403, httpStatusText.FAIL));
    }

    const updateData = { ...req.body };

    // لو المدرس رفع صورة جديدة، نحدث اللينك
    if (req.file) {
        updateData.thumbnail = req.file.secure_url || req.file.path;
    }

    // تحويل الأسعار لأرقام لو جت كـ string
    if (updateData.price) updateData.price = Number(updateData.price);
    if (updateData.promotionalPrice) updateData.promotionalPrice = Number(updateData.promotionalPrice);

    const updatedCourse = await Course.findByIdAndUpdate(
        courseId,
        { $set: updateData },
        { new: true, runValidators: true }
    );

    res.status(200).json({ 
        status: httpStatusText.SUCCESS, 
        data: { course: updatedCourse } 
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
    if (!course) {
        return next(appError.create("Course not found", 404, httpStatusText.FAIL));
    }

    // التأكد إن المستخدم مش متسجل بالفعل
    const existingEnrollment = await Enrollment.findOne({ user: userId, course: courseId });
    if (existingEnrollment) {
        return next(appError.create("You are already enrolled in this course", 400, httpStatusText.FAIL));
    }

    // إنشاء التسجيل
    const enrollment = await Enrollment.create({
        user: userId,
        course: courseId,
    });

    res.status(201).json({
        status: httpStatusText.SUCCESS,
        message: "Enrolled successfully!",
        data: { enrollment },
    });
});

const addSection = asyncWrapper(async (req, res, next) => {
    const courseId = req.params.courseId;
    const course = await Course.findById(courseId);
    
    if (!course) {
        return next(appError.create("Course not found", 404, httpStatusText.FAIL));
    }

    if (course.instructor.toString() !== req.user.id.toString() && req.user.role !== 'ADMIN') {
        return next(appError.create("Unauthorized", 403, httpStatusText.FAIL));
    }

    // ✅ لو فيه فيديو مرفوع، خد اللينك بتاعه
    const videoUrl = req.file ? req.file.path : undefined;

    // نضيف القسم مع الفيديو
    course.sections.push({
        ...req.body,
        videoUrl: videoUrl, // اللينك من Cloudinary
    });
    
    await course.save();

    res.status(200).json({ 
        status: httpStatusText.SUCCESS, 
        data: { course } 
    });
});

// ── تحديث قسم (لو عايز تعدل اسمه أو الفيديو) ──
const updateSection = asyncWrapper(async (req, res, next) => {
    const { courseId, sectionId } = req.params;
    const course = await Course.findById(courseId);

    if (!course) return next(appError.create("Course not found", 404, httpStatusText.FAIL));
    if (course.instructor.toString() !== req.user.id && req.user.role !== 'ADMIN') {
        return next(appError.create("Unauthorized", 403, httpStatusText.FAIL));
    }

    const section = course.sections.id(sectionId);
    if (!section) return next(appError.create("Section not found", 404, httpStatusText.FAIL));

    // تحديث البيانات (سواء نصية أو الفيديو لو اترفع جديد)
    section.title = req.body.title || section.title;
    section.learningObjective = req.body.learningObjective || section.learningObjective;
    section.duration = req.body.duration || section.duration;
    
    // لو فيه فيديو جديد
    if (req.file) {
        section.videoUrl = req.file.secure_url || req.file.path;
    }

    await course.save();
    res.status(200).json({ status: httpStatusText.SUCCESS, data: { course } });
});


// ── حذف قسم ──
const deleteSection = asyncWrapper(async (req, res, next) => {
    const { courseId, sectionId } = req.params;
    const course = await Course.findById(courseId);

    if (!course) return next(appError.create("Course not found", 404, httpStatusText.FAIL));
    if (course.instructor.toString() !== req.user.id && req.user.role !== 'ADMIN') {
        return next(appError.create("Unauthorized", 403, httpStatusText.FAIL));
    }

    // بنشيل القسم من المصفوفة
    course.sections = course.sections.filter(
        (sec) => sec._id.toString() !== sectionId
    );

    await course.save();
    res.status(200).json({ status: httpStatusText.SUCCESS, data: { course } });
});

const completeSection = asyncWrapper(async (req, res, next) => {
    const { courseId, sectionId } = req.params;
    const userId = req.user.id;

    // 1. التأكد إن الطالب مشترك
    const enrollment = await Enrollment.findOne({ user: userId, course: courseId });
    if (!enrollment) {
        return next(appError.create("You are not enrolled in this course", 403, httpStatusText.FAIL));
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
            const progress = totalSections === 0 ? 0 : Math.round((completedCount / totalSections) * 100);
            continueLearningCourse = {
                ...course.toObject(),
                progress,
                completedCount,
                totalSections
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
    getDashboardStats
};