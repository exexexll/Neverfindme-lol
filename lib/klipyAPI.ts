/**
 * Klipy GIF API Integration
 * Docs: https://docs.klipy.com/gifs-api
 * App Key: 6vXxnAAWsFE2MkGlOlVVozkhPI8BAEKubYjLBAqGSAWIDF6MKGMCP1QbjYTxnYUc
 * 
 * CORRECT endpoint structure from docs:
 * https://api.klipy.com/api/v1/{app_key}/gifs/trending
 */

const KLIPY_APP_KEY = '6vXxnAAWsFE2MkGlOlVVozkhPI8BAEKubYjLBAqGSAWIDF6MKGMCP1QbjYTxnYUc';
const KLIPY_BASE_URL = `https://api.klipy.com/api/v1/${KLIPY_APP_KEY}`;

function getCustomerId(): string {
  if (typeof window === 'undefined') return 'server-user';
  
  let customerId = localStorage.getItem('klipy_customer_id');
  if (!customerId) {
    customerId = 'user-' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('klipy_customer_id', customerId);
  }
  return customerId;
}

export interface KlipyGIF {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
}

/**
 * Search for GIFs
 * Endpoint: GET /api/v1/{app_key}/gifs/search
 * Docs: https://docs.klipy.com/gifs-api#getgif-search-api
 */
export async function searchGIFs(query: string, limit: number = 20): Promise<KlipyGIF[]> {
  try {
    const customerId = getCustomerId();
    const url = `${KLIPY_BASE_URL}/gifs/search?q=${encodeURIComponent(query)}&per_page=${limit}&customer_id=${customerId}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      return [];
    }
    
    const text = await response.text();
    if (!text || text.trim() === '') {
      return [];
    }
    
    const json = JSON.parse(text);
    
    if (!json.result || !json.data?.data) {
      return [];
    }
    
    return json.data.data.map((item: any) => ({
      id: item.slug || item.id?.toString(),
      title: item.title || 'GIF',
      url: item.file?.md?.gif?.url || item.file?.hd?.gif?.url,
      previewUrl: item.file?.sm?.gif?.url || item.file?.xs?.gif?.url,
      width: item.file?.md?.gif?.width || 498,
      height: item.file?.md?.gif?.height || 280,
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Get trending GIFs
 * Endpoint: GET /api/v1/{app_key}/gifs/trending
 * Docs: https://docs.klipy.com/gifs-api#getgif-trending-api
 */
export async function getTrendingGIFs(limit: number = 20): Promise<KlipyGIF[]> {
  try {
    const customerId = getCustomerId();
    const url = `${KLIPY_BASE_URL}/gifs/trending?per_page=${limit}&customer_id=${customerId}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      return [];
    }
    
    const text = await response.text();
    if (!text || text.trim() === '') {
      return [];
    }
    
    const json = JSON.parse(text);
    
    if (!json.result || !json.data?.data) {
      console.error('[Klipy] Unexpected response structure:', json);
      return [];
    }
    
    return json.data.data.map((item: any) => ({
      id: item.slug || item.id?.toString(),
      title: item.title || 'Trending GIF',
      url: item.file?.md?.gif?.url || item.file?.hd?.gif?.url,
      previewUrl: item.file?.sm?.gif?.url || item.file?.xs?.gif?.url,
      width: item.file?.md?.gif?.width || 498,
      height: item.file?.md?.gif?.height || 280,
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Get GIF categories
 * Endpoint: GET /api/v1/{app_key}/gifs/categories
 * Docs: https://docs.klipy.com/gifs-api#getgif-categories-api
 */
export async function getGIFCategories(): Promise<string[]> {
  try {
    const response = await fetch(
      `${KLIPY_BASE_URL}/gifs/categories?locale=en_US`
    );
    
    if (response.ok) {
      const json = await response.json();
      
      if (json.result && json.data?.categories) {
        return json.data.categories.map((cat: any) => cat.category || cat.query);
      }
    }
  } catch (error) {
    // Use fallback
  }
  
  // Fallback categories
  return [
    'Happy', 'Love', 'Funny', 'Excited', 'Thinking',
    'Wow', 'Sad', 'Confused', 'Dancing', 'Agree',
  ];
}

/**
 * Track GIF share for Klipy monetization
 * Endpoint: POST /api/v1/{app_key}/gifs/share/{slug}
 * Docs: https://docs.klipy.com/gifs-api#postgif-share-trigger-api
 */
export async function trackGIFImpression(gifSlug: string): Promise<void> {
  try {
    const customerId = getCustomerId();
    await fetch(`${KLIPY_BASE_URL}/gifs/share/${gifSlug}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer_id: customerId,
        q: '',
      }),
    });
  } catch (error) {
    // Silent fail
  }
}
