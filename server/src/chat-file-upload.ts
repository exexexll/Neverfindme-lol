/**
 * File Upload Handler for Chat
 * Handles image and file uploads in text/video chat
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';

// Auth middleware
const requireAuth = (req: any, res: any, next: any) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Token validation handled by parent middleware
  next();
};

const router = Router();

// Check if Cloudinary is configured
const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY);

// Multer configuration for chat files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/chat');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `chat-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and common document types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: images, PDF, documents'));
    }
  }
});

/**
 * POST /chat/upload-file
 * Upload file for chat (image or document)
 */
router.post('/upload-file', requireAuth, (req: any, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('[ChatUpload] Error:', err);
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      let fileUrl: string;
      let publicId: string = '';

      if (useCloudinary) {
        console.log('[ChatUpload] Uploading to Cloudinary...');
        
        // Determine resource type
        const isImage = /image\/(jpeg|jpg|png|gif)/.test(req.file.mimetype);
        
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'napalmsky/chat-files',
          resource_type: isImage ? 'image' : 'raw', // 'raw' for documents
        });
        
        fileUrl = result.secure_url;
        publicId = result.public_id;
        
        // Delete local file
        fs.unlinkSync(req.file.path);
        console.log('[ChatUpload] ✅ Uploaded to Cloudinary');
      } else {
        const apiBase = process.env.API_BASE || `${req.protocol}://${req.get('host')}`;
        fileUrl = `${apiBase}/uploads/chat/${req.file.filename}`;
        publicId = req.file.filename;
        console.log('[ChatUpload] ⚠️ Using local storage');
      }

      res.json({
        fileUrl,
        publicId,
        fileName: req.file.originalname,
        fileSizeBytes: req.file.size,
        fileType: req.file.mimetype,
      });

      console.log(`[ChatUpload] ✅ File uploaded: ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)}KB)`);
    } catch (error: any) {
      console.error('[ChatUpload] Failed:', error);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: 'Upload failed' });
    }
  });
});

export default router;

