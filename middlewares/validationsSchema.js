const { body, validationResult } = require("express-validator");

const ValidationSchema = () => {
  return [
    body("title")
      .notEmpty().withMessage("title is required")
      .isLength({ min: 2 }).withMessage("title must be at least 2 chars"),
    body("price")
      .notEmpty().withMessage("price is required")
      .isNumeric().withMessage("price must be a number"),
  ];
};

// ── Auth validators ──
const registerValidator = [
  body("firstName").notEmpty().withMessage("firstName is required"),
  body("lastName").notEmpty().withMessage("lastName is required"),
  body("email").isEmail().withMessage("Must be valid email"),
  body("password")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
    .matches(/\d/).withMessage("Password must contain a number"),
  body("role")
    .optional()
    .isIn(["USER", "INSTRUCTOR"]).withMessage("Role must be USER or INSTRUCTOR"),
];

const loginValidator = [
  body("email").isEmail().withMessage("Must be valid email"),
  body("password").notEmpty().withMessage("Password is required"),
];

const forgotPasswordValidator = [
  body("email").isEmail().withMessage("Must be valid email"),
];

const resetPasswordValidator = [
  body("password")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
    .matches(/\d/).withMessage("Password must contain a number"),
];

// Generic error handler
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const appError = require("../utils/appError");
    const httpStatusText = require("../utils/httpStatusText");
    return next(appError.create(errors.array(), 400, httpStatusText.FAIL));
  }
  next();
};



module.exports = {
  ValidationSchema,
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  validate,
};