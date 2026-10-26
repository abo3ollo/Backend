
require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const cookieParser = require('cookie-parser'); 
const mongoose = require("mongoose");

const httpStatusText = require("./utils/httpStatusText");

const app = express();

// Middleware
// CORS — مع credentials
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://course-project-ten-gules.vercel.app",
    "https://course-project-full.vercel.app",
    process.env.CLIENT_URL,
  ].filter(Boolean),
  credentials: true,   // ← مهم جدًا
}));

app.use(express.json());
app.use(cookieParser()); 

// Static uploads (temporary/local storage only on Vercel)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// MongoDB connection cache
let mongoPromise;

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!process.env.MONGO_URL) {
    throw new Error("MONGO_URL environment variable is missing");
  }

  if (!mongoPromise) {
    mongoPromise = mongoose
      .connect(process.env.MONGO_URL)
      .catch((error) => {
        mongoPromise = null;
        throw error;
      });
  }

  await mongoPromise;
}

// Connect to MongoDB before handling API requests
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});

// Welcome route
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "🎓 Courses API is running",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      courses: "/api/courses",
      users: "/api/users",
    },
  });
});

// Courses routes
const coursesRouter = require("./routes/courses.routes");
app.use("/api/courses", coursesRouter);

// Users routes
const userRouter = require("./routes/user.routes");
app.use("/api/users", userRouter);

// Authentication routes
const authRouter = require("./routes/auth.routes");
app.use("/api/auth", authRouter);

// Reviews routes
const reviewsRouter = require("./routes/reviews.routes");
app.use("/api/courses/:courseId/reviews", reviewsRouter);

// 404 handler
app.all(/.*/, (req, res) => {
  return res.status(404).json({
    status: httpStatusText.ERROR,
    message: "This resource is not available",
  });
});

// Global error handler
app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  return res.status(error.statusCode || 500).json({
    status: error.statusText || httpStatusText.ERROR,
    message: error.message || "Internal server error",
    code: error.statusCode || 500,
    data: null,
  });
});

// Export Express app for Vercel
module.exports = app;

// Run a regular server for local development
if (require.main === module) {
  const port = process.env.PORT || 5000;

  app.listen(port, () => {
    console.log("Listening on port:", port);
  });
}