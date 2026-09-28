const express = require("express");
const usersController = require("../controllers/users.controllers");
const verifyToken = require("../middlewares/verifyToken");
const appError = require("../utils/appError");

const multer  = require('multer');
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

router.route("/")
            .get(verifyToken, usersController.getAllusers)

router.route("/register")
            .post(upload.single('avatar'), usersController.register)

router.route("/login")
            .post(usersController.login)


module.exports = router 