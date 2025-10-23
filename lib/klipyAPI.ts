/**
 * Klipy GIF API Integration
 * Website: https://klipy.com/developers
 * 
 * Features: GIFs, Stickers, Memes, Clips + Revenue Generation
 * 
 * NOTE: Exact API endpoints to be confirmed after getting API key
 * This is based on standard GIF API patterns
 */

const KLIPY_API_KEY = process.env.NEXT_PUBLIC_KLIPY_API_KEY || '6vXxnAAWsFE2MkGlOlVVozkhPI8BAEKubYjLBAqGSAWIDF6MKGMCP1QbjYTxnYUc';
// Fallback: Use Tenor since Klipy docs unavailable
const TENOR_API_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';
const USE_TENOR_FALLBACK = true; // Switch to Klipy when docs available

export interface KlipyGIF {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  type?: 'gif' | 'sticker' | 'meme' | 'clip';
}

/**
 * Search for GIFs
 * Endpoint pattern: /v1/gifs/search (standard GIF API pattern)
 */
export async function searchGIFs(query: string, limit: number = 20): Promise<KlipyGIF[]> {
  // Temporary: Use Tenor until Klipy API docs available
  if (USE_TENOR_FALLBACK) {
    try {
      const response = await fetch(
        `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_API_KEY}&client_key=napalmsky&limit=${limit}`
      );
    
    if (!response.ok) {
      console.error('[Klipy] Search failed:', response.status);
      return [];
    }
    
    const data = await response.json();
    
    // Parse response (adjust based on actual Klipy response format)
    const results = data.results || data.data || [];
    
    return results.map((item: any) => ({
      id: item.id,
      title: item.title || item.description || 'GIF',
      url: item.url || item.gif_url || item.media?.gif?.url,
      previewUrl: item.preview_url || item.preview || item.media?.tinygif?.url || item.url,
      width: item.width || item.media?.gif?.width || 498,
      height: item.height || item.media?.gif?.height || 280,
      type: 'gif',
    }));
  } catch (error) {
    console.error('[Klipy] Search failed:', error);
    return [];
  }
}

/**
 * Get trending GIFs
 */
export async function getTrendingGIFs(limit: number = 20): Promise<KlipyGIF[]> {
  // Temporary: Use Tenor until Klipy API docs available
  if (USE_TENOR_FALLBACK) {
    try {
      const response = await fetch(
        `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&client_key=napalmsky&limit=${limit}`
      );
    
    if (!response.ok) {
      console.error('[Klipy] Trending failed:', response.status);
      return [];
    }
    
    const data = await response.json();
    const results = data.results || data.data || [];
    
    return results.map((item: any) => ({
      id: item.id,
      title: item.title || 'Trending GIF',
      url: item.url || item.gif_url || item.media?.gif?.url,
      previewUrl: item.preview_url || item.preview || item.media?.tinygif?.url || item.url,
      width: item.width || 498,
      height: item.height || 280,
      type: 'gif',
    }));
  } catch (error) {
    console.error('[Klipy] Trending failed:', error);
    return [];
  }
}

/**
 * Get GIF categories
 */
export async function getGIFCategories(): Promise<string[]> {
  // Popular categories (same as before)
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

/**
 * REVENUE FEATURE: Track GIF impression for monetization
 * Call this when GIF is displayed to user
 */
export async function trackGIFImpression(gifId: string): Promise<void> {
  if (!KLIPY_API_KEY) return;

  try {
    // Klipy's revenue API - tracks impressions for monetization
    await fetch(`${KLIPY_BASE_URL}/revenue/impression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: KLIPY_API_KEY,
        gif_id: gifId,
        timestamp: Date.now(),
      }),
    });
  } catch (error) {
    // Silent fail - don't block UX for analytics
  }
}

