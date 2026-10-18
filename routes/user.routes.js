const express = require("express");
const usersController = require("../controllers/users.controllers");
const verifyToken = require("../middlewares/verifyToken");
const cloudinaryUpload = require("../middlewares/cloudinaryUpload");

const multer = require('multer');
const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, 'uploads') },
  filename: function (req, file, cb) {
    const ext = file.mimetype.split('/')[1];
    cb(null, `user-${Date.now()}.${ext}`)
  }
})
const upload = multer({ storage: diskStorage });


const router = express.Router();

router.route("/")
            .get(verifyToken, usersController.getAllusers)
    
router.route("/me")
            .get(verifyToken, usersController.getMe)
            .patch(verifyToken, usersController.updateMe);

router.route("/me/password")
            .post(verifyToken, usersController.changePassword)

router.route("/me/avatar")
            .post(verifyToken, cloudinaryUpload.single("avatar"), usersController.uploadAvatar)

module.exports = router 