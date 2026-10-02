const express = require("express");
const usersController = require("../controllers/users.controllers");
const verifyToken = require("../middlewares/verifyToken");


const router = express.Router();

router.route("/")
            .get(verifyToken, usersController.getAllusers)


module.exports = router 