/**
 * Tenor GIF API Integration
 * Free tier: 1M requests/month
 * Docs: https://developers.google.com/tenor
 */

const TENOR_API_KEY = process.env.NEXT_PUBLIC_TENOR_API_KEY || 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ'; // Public API key
const CLIENT_KEY = 'napalmsky';

export interface TenorGIF {
  id: string;
  title: string;
  url: string; // Full size
  previewUrl: string; // Small preview
  width: number;
  height: number;
}

/**
 * Search for GIFs
 */
export async function searchGIFs(query: string, limit: number = 20): Promise<TenorGIF[]> {
  try {
    const response = await fetch(
      `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_API_KEY}&client_key=${CLIENT_KEY}&limit=${limit}&media_filter=gif,tinygif`
    );
    
    if (!response.ok) {
      throw new Error('GIF search failed');
    }
    
    const data = await response.json();
    
    return data.results.map((gif: any) => ({
      id: gif.id,
      title: gif.content_description || gif.title || 'GIF',
      url: gif.media_formats.gif?.url || gif.media_formats.tinygif?.url,
      previewUrl: gif.media_formats.tinygif?.url || gif.media_formats.nanogif?.url,
      width: gif.media_formats.gif?.dims?.[0] || 300,
      height: gif.media_formats.gif?.dims?.[1] || 300,
    }));
  } catch (error) {
    console.error('[GIF] Search failed:', error);
    return [];
  }
}

/**
 * Get trending GIFs
 */
export async function getTrendingGIFs(limit: number = 20): Promise<TenorGIF[]> {
  try {
    const response = await fetch(
      `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&client_key=${CLIENT_KEY}&limit=${limit}&media_filter=gif,tinygif`
    );
    
    if (!response.ok) {
      throw new Error('Failed to get trending GIFs');
    }
    
    const data = await response.json();
    
    return data.results.map((gif: any) => ({
      id: gif.id,
      title: gif.content_description || 'GIF',
      url: gif.media_formats.gif?.url || gif.media_formats.tinygif?.url,
      previewUrl: gif.media_formats.tinygif?.url || gif.media_formats.nanogif?.url,
      width: gif.media_formats.gif?.dims?.[0] || 300,
      height: gif.media_formats.gif?.dims?.[1] || 300,
    }));
  } catch (error) {
    console.error('[GIF] Failed to get trending:', error);
    return [];
  }
}

/**
 * Get GIF categories
 */
export async function getGIFCategories(): Promise<string[]> {
  // Popular categories for text chat
  return [
    'Happy',
    'Love',
    'Funny',
    'Excited',
    'Thinking',
    'Wow',
    'Sad',
    'Confused',
    'Dancing',
    'Agree',
  ];
}

