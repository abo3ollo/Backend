const Course = require("../models/courses.models");
const { validationResult } = require("express-validator")
const httpStatusText = require("../utils/httpStatusText")
const appError = require('../utils/appError');
const asyncWrapper = require("../middlewares/asyncWrapper");

const getAllCourse = asyncWrapper(
    async (req, res) => {

        const query = req.query;
        const limit = query.limit || 10;
        const page = query.page || 1;
        const skip = (page - 1) * limit;

        // get all courses from db using course model
        const courses = await Course.find({}, { "__v": false }).limit(limit).skip(skip);
        res.json({ status: httpStatusText.SUCCESS, data: { courses } });
    });

const getSingleCourse = asyncWrapper(
    async (req, res, next) => {
        // console.log(req.params.courseId);

        const course = await Course.findById(req.params.courseId);
        if (!course) {
            const error = appError.create("Course Not Found", 404, httpStatusText.FAIL)
            return next(error);
        }
        return res.json({ status: httpStatusText.SUCCESS, data: { course } });

    });

const CreateCourse = asyncWrapper(
    async (req, res , next) => {
        // console.log(req.body);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const error = appError.create(errors.array(), 400, httpStatusText.FAIL)
            return next(error)
        }
        const newCourse = new Course(req.body);
        await newCourse.save();
        res.status(201).json({ status: httpStatusText.SUCCESS, data: { course: newCourse } });
    });

const updateCourse = asyncWrapper(
    async (req, res) => {
        const courseId = req.params.courseId;
        // update
        const updateCourse = await Course.updateOne(
            { _id: courseId },
            { $set: { ...req.body } },
        );
        res.status(200).json({ status: httpStatusText.SUCCESS, data: { course: updateCourse } });

    });

const deleteCourse = asyncWrapper(
    async (req, res) => {

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
