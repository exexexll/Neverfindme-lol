'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchGIFs, getTrendingGIFs, getGIFCategories } from '@/lib/klipyAPI';
import type { KlipyGIF } from '@/lib/klipyAPI';

interface GIFPickerProps {
  onSelectGIF: (gifUrl: string, gifId: string) => void;
  onClose: () => void;
}

export function GIFPicker({ onSelectGIF, onClose }: GIFPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [gifs, setGifs] = useState<KlipyGIF[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Load trending GIFs on mount
  useEffect(() => {
    loadTrending();
    loadCategories();
  }, []);

  const loadTrending = async () => {
    setLoading(true);
    const trending = await getTrendingGIFs(30);
    setGifs(trending);
    setLoading(false);
  };

  const loadCategories = async () => {
    const cats = await getGIFCategories();
    setCategories(cats);
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      loadTrending();
      return;
    }

    setLoading(true);
    const results = await searchGIFs(query, 30);
    setGifs(results);
    setLoading(false);
  };

  const handleCategoryClick = async (category: string) => {
    setActiveCategory(category);
    setSearchQuery(category);
    setLoading(true);
    const results = await searchGIFs(category, 30);
    setGifs(results);
    setLoading(false);
  };

  const handleSelectGIF = (gif: KlipyGIF) => {
    onSelectGIF(gif.url, gif.id);
    
    // Track impression for Klipy monetization
    import('@/lib/klipyAPI').then(({ trackGIFImpression }) => {
      trackGIFImpression(gif.id);
    });
    
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 p-4">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="w-full max-w-2xl bg-[#0a0a0c] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-white/10 max-h-[80vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="font-playfair text-xl font-bold text-[#eaeaf0]">
            Choose a GIF
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5 text-[#eaeaf0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-white/10">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              handleSearch(e.target.value);
            }}
            placeholder="Search for GIFs..."
            className="w-full rounded-full bg-white/10 px-4 py-2.5 text-sm text-[#eaeaf0] placeholder-[#eaeaf0]/40 focus:outline-none focus:ring-2 focus:ring-[#fcf290]"
            autoFocus
          />
        </div>

        {/* Categories */}
        <div className="px-4 py-3 border-b border-white/10 overflow-x-auto">
          <div className="flex gap-2">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => handleCategoryClick(category)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeCategory === category
                    ? 'bg-[#fcf290] text-[#0a0a0c]'
                    : 'bg-white/10 text-[#eaeaf0] hover:bg-white/20'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

      {/* GIF Grid - Force scrollable with visible scrollbar */}
      <style jsx>{`
        .gif-scroll::-webkit-scrollbar {
          width: 10px;
        }
        .gif-scroll::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 5px;
          margin: 8px;
        }
        .gif-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 155, 107, 0.4);
          border-radius: 5px;
        }
        .gif-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 155, 107, 0.6);
        }
      `}</style>
      <div className="gif-scroll flex-1 overflow-y-scroll p-4" style={{
        WebkitOverflowScrolling: 'touch',
        maxHeight: 'calc(80vh - 240px)',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255, 155, 107, 0.4) rgba(255, 255, 255, 0.05)',
      }}>
        {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#fcf290] border-t-transparent" />
            </div>
          ) : gifs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <p className="text-[#eaeaf0]/60 mb-2">No GIFs found</p>
              <p className="text-sm text-[#eaeaf0]/40">Try a different search term</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {gifs.map(gif => (
                <button
                  key={gif.id}
                  onClick={() => handleSelectGIF(gif)}
                  className="relative aspect-square rounded-lg overflow-hidden bg-white/5 hover:ring-2 hover:ring-[#fcf290] transition-all group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={gif.previewUrl}
                    alt={gif.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10">
          <p className="text-xs text-center text-[#eaeaf0]/40">
            Powered by Klipy
          </p>
        </div>
      </motion.div>
    </div>
  );
}

