/**
 * Instagram Photo Extractor
 * Uses Instagram's oEmbed API to extract photo URLs from posts
 */

export interface InstagramPhoto {
  url: string;
  postUrl: string;
  index: number; // Index within the post (0, 1, 2...)
  totalInPost: number; // Total photos in this post
}

/**
 * Extract photo URLs from Instagram post using oEmbed API
 * Returns array of photo URLs (one per photo in the post)
 */
export async function extractInstagramPhotos(postUrl: string): Promise<InstagramPhoto[]> {
  try {
    console.log('[PhotoExtractor] 📸 Extracting photos from:', postUrl);
    
    // Instagram oEmbed API (public, no auth required)
    const oembedUrl = `https://graph.instagram.com/oembed?url=${encodeURIComponent(postUrl)}`;
    
    const response = await fetch(oembedUrl);
    
    if (!response.ok) {
      console.error('[PhotoExtractor] ❌ oEmbed API failed:', response.status);
      
      // Fallback: Return single photo using direct method
      const postId = postUrl.split('/p/')[1]?.split('/')[0] || postUrl.split('/reel/')[1]?.split('/')[0];
      if (postId) {
        return [{
          url: `https://www.instagram.com/p/${postId}/media/?size=l`,
          postUrl,
          index: 0,
          totalInPost: 1
        }];
      }
      
      return [];
    }
    
    const data = await response.json();
    console.log('[PhotoExtractor] ✅ oEmbed data:', data);
    
    // Instagram oEmbed returns thumbnail_url (single photo)
    // For multi-photo posts, we need to extract from HTML
    if (data.thumbnail_url) {
      // For now, return single photo
      // TODO: Parse HTML to get all photos in carousel
      return [{
        url: data.thumbnail_url,
        postUrl,
        index: 0,
        totalInPost: 1
      }];
    }
    
    return [];
  } catch (error) {
    console.error('[PhotoExtractor] ❌ Failed to extract photos:', error);
    return [];
  }
}

/**
 * Build flat array of all photos from all Instagram posts
 * Example: Post 1 (3 photos) + Post 2 (2 photos) = 5 photo slides
 */
export async function buildPhotoSlides(postUrls: string[]): Promise<InstagramPhoto[]> {
  console.log('[PhotoExtractor] 🎬 Building photo slides from', postUrls.length, 'posts');
  
  const allPhotos: InstagramPhoto[] = [];
  
  for (const postUrl of postUrls) {
    const photos = await extractInstagramPhotos(postUrl);
    allPhotos.push(...photos);
  }
  
  console.log('[PhotoExtractor] ✅ Total photos extracted:', allPhotos.length);
  return allPhotos;
}

/**
 * Direct Instagram photo URL (works for single-photo posts)
 * Format: https://www.instagram.com/p/{POST_ID}/media/?size=l
 */
export function getDirectPhotoUrl(postUrl: string): string {
  const postId = postUrl.split('/p/')[1]?.split('/')[0] || postUrl.split('/reel/')[1]?.split('/')[0];
  return `https://www.instagram.com/p/${postId}/media/?size=l`;
}

