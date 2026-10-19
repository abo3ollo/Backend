const Course = require("../models/courses.models");
const httpStatusText = require("../utils/httpStatusText");
const appError = require('../utils/appError');
const asyncWrapper = require("../middlewares/asyncWrapper");

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
    const { title, description, price, category, level, isPublished } = req.body;

    const thumbnail = req.file 
        ? (req.file.secure_url || req.file.path) 
        : "https://res.cloudinary.com/demo/image/upload/default-course.jpg";

    const newCourse = await Course.create({
        title,
        description,
        price,
        category,
        level,
        isPublished: isPublished === 'true' || isPublished === true,
        thumbnail,
        instructor: req.user.id,
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

module.exports = {
    getAllCourse,
    getSingleCourse,
    CreateCourse,
    updateCourse,
    deleteCourse,
};