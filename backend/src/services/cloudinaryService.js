import { v2 as cloudinary } from 'cloudinary';
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});
export function cloudinaryUpload(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, r) => {
      if (err) reject(err); else resolve(r);
    });
    stream.end(buffer);
  });
}
export async function cloudinaryDelete(publicId) { return cloudinary.uploader.destroy(publicId); }
export default cloudinary;
