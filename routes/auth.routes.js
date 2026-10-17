const express = require("express");
const authController = require("../controllers/auth.controllers");
const verifyToken = require("../middlewares/verifyToken");
const appError = require("../utils/appError");
const rateLimit = require("express-rate-limit");

const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 3,
  message: {
    status: "FAIL",
    message: "Too many attempts. Try again later.",
  },
});

const multer  = require('multer');
const { registerValidator, loginValidator, forgotPasswordValidator, validate, resetPasswordValidator } = require("../middlewares/validationsSchema");

const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads')
  },
  filename: function (req, file, cb) {
    const ext = file.mimetype.split('/')[1];
    const filename = `user-${Date.now()}.${ext}`;
      
      cb(null, filename)
    
  }
})

const fileFilter = (req, file, cb)=>{
  const imageType = file.mimetype.split('/')[0];
  if(imageType === 'image'){
    return cb(null , true)
  }else{
    cb(appError.create('Only image files are allowed!' , 400), false)
  }

}
const upload = multer({ storage : diskStorage , fileFilter: fileFilter })


const router = express.Router();



router.route("/register")
            .post( registerValidator,upload.single('avatar'), authController.register)

router.route("/login")
            .post(loginValidator, authController.login)

router.route("/verify-email/:token")
            .get(authController.verifyEmail);

router.route("/resend-verification")
            .post(resendLimiter, authController.resendVerification);

router.route("/forgot-password")
            .post(forgotPasswordValidator,validate, authController.forgotPassword);

router.route("/reset-password/:token")
            .patch(resetPasswordValidator, validate, authController.resetPassword);

router.route("/logout")
    .post(verifyToken, authController.logout);

router.route("/logout-all")
    .post(verifyToken, authController.logoutAll);


module.exports = router 