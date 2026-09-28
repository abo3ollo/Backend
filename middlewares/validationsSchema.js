const { body } = require("express-validator");

const ValidationSchema = () => {
    return [
        body("title")
            .notEmpty()
            .withMessage("title is required ")
            .isLength({ min: 2 })
            .withMessage("must be more than 2 char"),
        body("price")
            .notEmpty()
            .withMessage("price is required "),
    ];
};

module.exports= {
    ValidationSchema
}
