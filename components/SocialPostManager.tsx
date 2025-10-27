'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SocialPostManagerProps {
  initialPosts?: string[];
  onSave: (posts: string[]) => Promise<void>;
}

/**
 * Instagram Post Manager - Simplified
 * Instagram posts only, shows in matchmaking carousel after intro video
 */
export function SocialPostManager({ initialPosts = [], onSave }: SocialPostManagerProps) {
  const [posts, setPosts] = useState<string[]>(initialPosts);
  const [newPostUrl, setNewPostUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Normalize and validate Instagram URL
  const normalizeInstagramUrl = (url: string): string => {
    // Remove trailing slashes and query parameters
    let normalized = url.trim().replace(/\/+$/, '').split('?')[0];
    
    // Extract shortcode (everything before 3rd dash or end)
    const match = normalized.match(/instagram\.com\/(p|reel)\/([\w-]+)/);
    if (match) {
      const shortcode = match[2];
      // Instagram shortcodes are usually 11 chars, but can be longer
      // Keep only the actual shortcode (before any tracking params)
      const cleanShortcode = shortcode.split('-').slice(0, 3).join('-');
      normalized = `https://www.instagram.com/${match[1]}/${cleanShortcode}/`;
      console.log('[SocialPostManager] Normalized:', url, '→', normalized);
    }
    
    return normalized;
  };
  
  const isValidInstagramUrl = (url: string): boolean => {
    const pattern = /^https?:\/\/(www\.)?instagram\.com\/(p|reel)\/[\w-]+\/?$/;
    const isValid = pattern.test(url);
    console.log('[SocialPostManager] URL validation:', url, '→', isValid);
    return isValid;
  };

  const handleAddPost = () => {
    setError(null);
    
    if (!newPostUrl.trim()) {
      setError('Please enter a URL');
      return;
    }

    const normalizedUrl = normalizeInstagramUrl(newPostUrl);
    
    if (!isValidInstagramUrl(normalizedUrl)) {
      setError('Invalid Instagram URL. Must be like: https://www.instagram.com/p/ABC123/');
      return;
    }

    if (posts.length >= 10) {
      setError('Maximum 10 posts allowed');
      return;
    }

    if (posts.includes(normalizedUrl)) {
      setError('This post is already added');
      return;
    }

    setPosts([...posts, normalizedUrl]);
    setNewPostUrl('');
    console.log('[Analytics] Instagram post added (normalized):', normalizedUrl);
  };

  const handleRemovePost = (index: number) => {
    setPosts(posts.filter((_, i) => i !== index));
    console.log('[Analytics] Instagram post removed');
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newPosts = [...posts];
    [newPosts[index - 1], newPosts[index]] = [newPosts[index], newPosts[index - 1]];
    setPosts(newPosts);
  };

  const handleMoveDown = (index: number) => {
    if (index === posts.length - 1) return;
    const newPosts = [...posts];
    [newPosts[index + 1], newPosts[index]] = [newPosts[index], newPosts[index + 1]];
    setPosts(newPosts);
  };

  const handleSave = async () => {
    console.log('[SocialPostManager] 🎯 handleSave clicked!');
    console.log('[SocialPostManager] Posts to save:', posts);
    
    setSaving(true);
    setError(null);
    
    try {
      console.log('[SocialPostManager] 📤 Calling onSave callback...');
      await onSave(posts);
      console.log('[SocialPostManager] ✅ Save complete! Posts:', posts.length);
    } catch (err: any) {
      console.error('[SocialPostManager] ❌ Save failed:', err);
      console.error('[SocialPostManager] Error details:', err.message);
      setError(`Failed to save: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
      console.log('[SocialPostManager] 🏁 Save process finished');
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <img src="/instagram.png" alt="Instagram" className="w-8 h-8 object-contain" />
          Instagram Posts
          <span className="text-sm font-normal px-3 py-1 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full">
            {posts.length}/10
          </span>
        </h2>
        <p className="text-gray-400">
          Add Instagram posts to your profile. They&apos;ll appear in your matchmaking carousel after your intro video.
        </p>
      </div>

      {/* Add Post Input */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            type="url"
            value={newPostUrl}
            onChange={(e) => {
              setNewPostUrl(e.target.value);
              setError(null);
            }}
            onKeyPress={(e) => e.key === 'Enter' && handleAddPost()}
            placeholder="Paste Instagram post URL (e.g., https://www.instagram.com/p/ABC123/)"
            className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20"
          />
          <button
            onClick={handleAddPost}
            disabled={posts.length >= 10}
            className="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-lg text-white font-medium hover:from-pink-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95"
          >
            Add
          </button>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </motion.div>
        )}

        <div className="flex items-center justify-between text-sm">
          <p className="text-gray-500">
            Carousel order: Video → Post 1 → Post 2 → ...
          </p>
          <p className="text-gray-400">
            {posts.length}/10 posts
          </p>
        </div>
      </div>

      {/* Post List */}
      <AnimatePresence mode="popLayout">
        {posts.length > 0 ? (
          <div className="space-y-3">
            {posts.map((postUrl, index) => (
              <motion.div
                key={postUrl}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                layout
                className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-xl hover:border-pink-500/30 hover:bg-white/10 transition-all group"
              >
                {/* Position Badge */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center text-white font-bold border-2 border-white/20">
                  {index + 1}
                </div>

                {/* URL */}
                <div className="flex-1 min-w-0">
                  <a
                    href={postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-white hover:text-pink-400 truncate transition-colors font-mono text-sm"
                  >
                    {postUrl}
                  </a>
                  <p className="text-xs text-gray-500 mt-1">
                    Will appear as slide {index + 2} (after intro video)
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-2 hover:bg-white/10 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move up"
                  >
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>

                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === posts.length - 1}
                    className="p-2 hover:bg-white/10 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move down"
                  >
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  <button
                    onClick={() => handleRemovePost(index)}
                    className="p-2 hover:bg-red-500/20 rounded-md transition-colors"
                    title="Remove"
                  >
                    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 space-y-4 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-xl border border-purple-500/10"
          >
            <div className="text-6xl mb-4">📷</div>
            <p className="text-gray-400 text-lg font-medium">
              No Instagram posts yet
            </p>
            <p className="text-gray-600 text-sm max-w-md mx-auto">
              Add Instagram posts to showcase your best content in the matchmaking carousel
            </p>
            
            {/* How to get URL */}
            <div className="mt-6 p-4 bg-white/5 rounded-lg max-w-md mx-auto border border-white/10">
              <p className="text-white font-medium mb-2 flex items-center justify-center gap-2">
                <svg className="w-5 h-5 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                How to get post URL
              </p>
              <ol className="text-gray-400 text-sm space-y-1 text-left">
                <li>1. Open Instagram post on mobile or desktop</li>
                <li>2. Click the <strong>⋯</strong> (three dots) menu</li>
                <li>3. Select <strong>&quot;Copy link&quot;</strong></li>
                <li>4. Paste the link above and click <strong>Add</strong></li>
              </ol>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Button */}
      {posts.length > 0 && (
        <motion.button
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 bg-gradient-to-r from-pink-500 via-purple-600 to-pink-500 rounded-xl text-white font-bold text-lg shadow-lg hover:shadow-xl disabled:opacity-50 transition-all relative overflow-hidden group"
        >
          {/* Animated background */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          
          {/* Button text */}
          <span className="relative z-10">
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </span>
            ) : (
              `Save ${posts.length} Post${posts.length === 1 ? '' : 's'} to Carousel`
            )}
          </span>
        </motion.button>
      )}
    </div>
  );
}
