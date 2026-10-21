const cloudinary = require("../cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // ✅ لو الملف فيديو، نخلي النوع video
    const isVideo = file.mimetype.startsWith("video");
    
    return {
      folder: isVideo ? "courses-app/videos" : "courses-app/users",
      resource_type: isVideo ? "video" : "image", // 👈 المفتاح هنا
      allowed_formats: isVideo 
        ? ["mp4", "mov", "webm"] 
        : ["jpg", "jpeg", "png", "webp"],
    };
  },
});

const cloudinaryUpload = multer({ storage });
module.exports = cloudinaryUpload;