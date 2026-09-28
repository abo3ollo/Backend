require('dotenv').config()
const httpStatusText = require("./utils/httpStatusText")

const express = require("express");
const path = require('path')
const cors = require('cors')
const app = express();

app.use('/uploads' , express.static(path.join(__dirname,'uploads')))

// Adds headers: Access-Control-Allow-Origin: *
app.use(cors())
app.use(express.json());
// app.use(exprees.body-parser.json())


const coursesRouter = require('./routes/courses.routes')
app.use('/api/courses' , coursesRouter)

//users
const userRouter = require('./routes/user.routes')
app.use('/api/users' , userRouter)

app.all(/.*/ , (req , res , next )=>{
   return res.status(404).json({ status: httpStatusText.ERROR , message: "This resourse is not available" })
})

app.use(( error , req ,res ,next)=>{
    res.status(error.statusCode || 500).json({ status: error.statusText || httpStatusText.ERROR , message: error.message , code: error.statusCode ||500 , data : null})
})

const mangoose = require("mongoose");
const url = process.env.MONGO_URL

mangoose.connect(url).then(()=>{
    console.log("Mangodb server started");
    
})



const port = process.env.PORT || 5000
// run server
app.listen(port, () => {
    console.log("listening on port:" , port);
});
