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
    const course = await Course.findById(req.params.courseId)
        .populate("instructor", "firstName lastName avatar");

    if (!course) {
        const error = appError.create("Course Not Found", 404, httpStatusText.FAIL);
        return next(error);
    }
    return res.json({ status: httpStatusText.SUCCESS, data: { course } });
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

const updateCourse = asyncWrapper(async (req, res) => {
    const courseId = req.params.courseId;
    const updateData = { ...req.body };
    if (req.file) {
        updateData.thumbnail = req.file.secure_url || req.file.path;
    }

    const updatedCourse = await Course.findByIdAndUpdate(
        courseId,
        { $set: updateData },
        { new: true, runValidators: true }
    );

    res.status(200).json({ status: httpStatusText.SUCCESS, data: { course: updatedCourse } });
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
    
    // بنجيب الكورس
    const course = await Course.findById(courseId);
    if (!course) {
        return next(appError.create("Course not found", 404, httpStatusText.FAIL));
    }

    // التأكد إن اللي بيضيف القسم هو صاحب الكورس
    if (course.instructor.toString() !== req.user.id && req.user.role !== 'ADMIN') {
        return next(appError.create("You are not authorized to add sections to this course", 403, httpStatusText.FAIL));
    }

    // بنضيف القسم
    course.sections.push(req.body);
    await course.save();

    res.status(200).json({ 
        status: httpStatusText.SUCCESS, 
        message: "Section added successfully",
        data: { course } 
    });
});

module.exports = {
    getAllCourse,
    getSingleCourse,
    CreateCourse,
    updateCourse,
    deleteCourse,
    enrollCourse,
    addSection
};