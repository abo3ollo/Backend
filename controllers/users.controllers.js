const User = require("../models/user.models");
const asyncWrapper = require("../middlewares/asyncWrapper");
const httpStatusText = require("../utils/httpStatusText")



const getAllusers = asyncWrapper(
    async (req, res) => {

        const query = req.query;
        const limit = query.limit || 10;
        const page = query.page || 1;
        const skip = (page - 1) * limit;

        // get all users from db using user model
        const users = await User.find({}, { "__v": false, "password": false }).limit(limit).skip(skip);
        res.json({ status: httpStatusText.SUCCESS, data: { users } });
    });


module.exports = {
    getAllusers,

}