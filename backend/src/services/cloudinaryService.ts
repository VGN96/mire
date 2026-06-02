import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export function cloudinaryUpload(buffer: Buffer, options: UploadApiOptions = {}): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, r) => {
      if (err || !r) reject(err); else resolve(r);
    });
    stream.end(buffer);
  });
}

export async function cloudinaryDelete(publicId: string) {
  return cloudinary.uploader.destroy(publicId);
}

export default cloudinary;
