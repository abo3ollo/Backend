const Course = require("../models/courses.models");
const httpStatusText = require("../utils/httpStatusText");
const appError = require('../utils/appError');
const asyncWrapper = require("../middlewares/asyncWrapper");
const Enrollment = require("../models/enrollment.models"); 


const getAllCourse = asyncWrapper(async (req, res) => {
    const query = req.query;
    const limit = query.limit || 10;
    const page = query.page || 1;
    const skip = (page - 1) * limit;

    const courses = await Course.find({}, { "__v": false })
        .populate("instructor", "firstName lastName avatar")
        .limit(limit)
        .skip(skip);

    res.json({ status: httpStatusText.SUCCESS, data: { courses } });
});

const getSingleCourse = asyncWrapper(async (req, res, next) => {
    const courseId = req.params.courseId;
    
    // بنجيب الكورس
    const course = await Course.findById(courseId).populate(
        "instructor", 
        "firstName lastName avatar"
    );

    if (!course) {
        return next(appError.create("Course not found", 404, httpStatusText.FAIL));
    }

    let isAuthorized = false;

    // لو فيه يوزر مسجل دخول (عشان لو حد مش مسجل يشوف الصفحة الأساسية)
    if (req.user) {
        // لو هو المدرس صاحب الكورس أو أدمن
        if (
            course.instructor._id.toString() === req.user.id.toString() || 
            req.user.role === "ADMIN"
        ) {
            isAuthorized = true;
        } else {
            // لو طالب، نشوف مشترك ولا لأ
            const enrollment = await Enrollment.findOne({
                user: req.user.id,
                course: courseId,
            });
            if (enrollment) isAuthorized = true;
        }
    }

    // نسخة من الكورس عشان نعدل عليها
    let courseData = course.toObject();

    // ✅ لو مش مصرح له، هنشيل لينكات الفيديوهات
    if (!isAuthorized) {
        if (courseData.sections) {
            courseData.sections = courseData.sections.map((section) => ({
                ...section,
                videoUrl: undefined, // بنخفي الفيديو
            }));
        }
    }

    res.status(200).json({
        status: httpStatusText.SUCCESS,
        data: { course: courseData, isAuthorized }, // بنبعت isAuthorized عشان الفرونت يعرف
    });
});

const getMyCourses = asyncWrapper(async (req, res, next) => {
    // بنجيب كل الكورسات اللي الطالب ده مشترك فيها
    const enrollments = await Enrollment.find({ user: req.user.id })
        .populate({
            path: "course",
            populate: {
                path: "instructor",
                select: "firstName lastName avatar",
            },
        });

    // بنستخرج الكورسات بس من الـ Enrollments
    const courses = enrollments.map((enrollment) => enrollment.course);

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
    deleteSection
};