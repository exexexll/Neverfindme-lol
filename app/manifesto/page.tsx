'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

// Detect if device is mobile for performance optimization
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
};

const meetPeopleReasons = [
  "to complain about professors.",
  "to split an Uber.",
  "to find someone who hates cardio too.",
  "to skip class together.",
  "to get late-night tacos.",
  "to talk trash about our exes.",
  "to go halfsies on rent.",
  "to try that weird sushi place.",
  "to forget our workout plans.",
  "to share Netflix passwords.",
  "to send dumb memes.",
  "to make fun of couples at the gym.",
  "to order way too much takeout.",
  "to skip leg day and not feel bad.",
  "to people-watch at the mall.",
  "to decide what to eat for 45 minutes.",
  "to do nothing on a Saturday.",
  "to walk aimlessly in Target.",
  "to complain about being broke.",
  "to gossip about people we barely know.",
  "to get matching hoodies we'll never wear.",
  "to argue about pizza toppings.",
  "to cry-laugh over dumb TikToks.",
  "to split a Costco membership.",
  "to go to IKEA and not buy anything.",
  "to make fake plans we'll cancel.",
  "to text \"wyd\" and never follow up.",
  "to stay up when we said we'd sleep.",
  "to ignore red flags together.",
  "to pretend to be productive at a café.",
  "to scroll on our phones side by side.",
  "to buy snacks for a movie we won't watch.",
  "to share one charger and fight over it.",
  "to do \"just one drink\" and end up at karaoke.",
  "to skip the gym and get ice cream.",
  "to talk trash about our hometown.",
  "to fail a DIY project together.",
  "to pretend we're rich while window-shopping.",
  "to take selfies and delete all of them.",
  "to overshare in the parking lot.",
  "to try every boba shop in town.",
  "to sit in a coffee shop for five hours.",
  "to post Instagram stories and delete them.",
  "to buy plants we'll forget to water.",
  "to go to Trader Joe's just for snacks.",
  "to start a podcast we'll never record.",
  "to dress up for a restaurant and end up at McDonald's.",
  "to make a bucket list and do none of it.",
  "to plan a trip and never go.",
  "to stalk our crushes' Instagrams.",
  "to walk 3 miles for coffee we don't like.",
  "to order dessert first.",
  "to lie about going to bed early.",
  "to send voice notes instead of texting.",
  "to complain about how tired we are.",
  "to talk about quitting but never do.",
  "to show up late together.",
  "to hype each other up for no reason.",
  "to make chaotic Amazon purchases.",
  "to text each other every time something mildly annoying happens.",
  "to get lost and blame Google Maps.",
  "to try new hobbies and quit in a week.",
  "to join a gym and never go.",
  "to eat pancakes for dinner.",
  "to watch reality TV \"ironically.\"",
  "to give each other bad advice.",
  "to go out and leave after 20 minutes.",
  "to impulse-book flights and cancel them.",
  "to cry in a drive-thru line.",
  "to make a group chat and never use it.",
  "to show up overdressed to casual things.",
  "to buy matching mugs for no reason.",
  "to talk about moving but never pack.",
  "to try to cook and order pizza instead.",
  "to complain about how expensive everything is.",
  "to skip class and study anyway.",
  "to try meditation and fall asleep.",
  "to talk in movie theaters.",
  "to plan a workout and just stretch.",
  "to post thirst traps and regret it.",
  "to spend three hours deciding what to watch.",
  "to send screenshots instead of typing.",
  "to share one umbrella and both still get wet.",
  "to make matching playlists.",
  "to overpack for a one-day trip.",
  "to get coffee just to hold the cup.",
  "to go to a museum and not read anything.",
  "to talk about astrology like it's science.",
  "to start a group project the night before.",
  "to mispronounce wine names confidently.",
  "to go grocery shopping hungry and regret it.",
  "to overspend at Target.",
  "to walk into a bookstore and buy nothing.",
  "to try to study and end up gossiping.",
  "to show each other cursed memes.",
  "to text \"I'm outside\" and still be five minutes away.",
  "to order matching drinks.",
  "to forget why we came to the mall.",
  "to go for \"one drink\" and stay out all night.",
  "to laugh at the same dumb joke 20 times.",
];

const slangTerms = [
  "LOL", "ROFL", "LMAO", "BRB", "AFK", "TTYL", "SMH", "FTW", "BTW", "OMG",
  "IDK", "IMO", "IMHO", "TBH", "NVM", "WTF", "TL;DR", "ICYMI", "DM", "IRL",
  "NSFW", "GG", "Noob", "1337", "BFF", "JK", "FOMO", "YOLO", "Stan", "Cap",
  "No cap", "Sus", "Slay", "Flex", "Mood", "Vibe", "Salty", "Ghost", "Clout",
  "Drip", "Lit", "Lowkey", "Highkey", "Boujee", "Extra", "Tea", "Receipts",
  "Bet", "Fam", "Shade", "Simp", "Main character",
];

export default function ManifestoPage() {
  const [currentReasonIndex, setCurrentReasonIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile on mount
  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

  // Randomize starting sentence on mount
  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * meetPeopleReasons.length);
    setCurrentReasonIndex(randomIndex);
  }, []);

  // Auto-rotate sentences every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentReasonIndex((prev) => (prev + 1) % meetPeopleReasons.length);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Duplicate slang for infinite scroll (reduce for mobile performance)
  const slangRow = isMobile 
    ? [...slangTerms, ...slangTerms] 
    : [...slangTerms, ...slangTerms, ...slangTerms];

  return (
    <main id="main" className="relative min-h-screen bg-[#0a0a0c] overflow-hidden">
      {/* Top Right Spotlight Effect */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] z-0">
        <div className="w-full h-full bg-gradient-radial from-[#fcf290]/15 via-[#fcf290]/5 to-transparent blur-3xl" />
      </div>

      {/* Animated Slang Background - Full Page Coverage (Optimized for mobile) */}
      <div className="absolute inset-0 z-0 overflow-hidden opacity-8">
        {/* Mobile: Only 4 rows for performance. Desktop: 8 rows */}
        {/* Row 1 - Top - Moving Left */}
        <div className="absolute top-[5%] left-0 whitespace-nowrap will-change-transform">
          <motion.div
            className="flex gap-4"
            animate={{ x: [0, -2400] }}
            transition={{
              duration: 50,
              repeat: Infinity,
              ease: "linear",
            }}
            style={{ willChange: 'transform' }}
          >
            {slangRow.map((slang, i) => (
              <div
                key={`row1-${i}`}
                className="px-5 py-2 bg-white/5 rounded-md border border-white/10 
                           font-mono text-lg font-bold text-white/30"
                style={{ backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
              >
                {slang}
              </div>
            ))}
          </motion.div>
        </div>

        {/* Row 2 - Moving Right */}
        <div className="absolute top-[18%] left-0 whitespace-nowrap will-change-transform">
        <motion.div
            className="flex gap-4"
            animate={{ x: [-2400, 0] }}
            transition={{
              duration: 60,
              repeat: Infinity,
              ease: "linear",
            }}
            style={{ willChange: 'transform' }}
          >
            {slangRow.map((slang, i) => (
              <div
                key={`row2-${i}`}
                className="px-5 py-2 bg-white/5 rounded-md border border-white/10 
                           font-mono text-lg font-bold text-white/30"
                style={{ backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
              >
                {slang}
              </div>
            ))}
        </motion.div>
      </div>

        {/* Row 3 - Moving Left */}
        <div className="absolute top-[31%] left-0 whitespace-nowrap will-change-transform">
          <motion.div
            className="flex gap-4"
            animate={{ x: [0, -2400] }}
            transition={{
              duration: 45,
              repeat: Infinity,
              ease: "linear",
            }}
            style={{ willChange: 'transform' }}
          >
            {slangRow.map((slang, i) => (
              <div
                key={`row3-${i}`}
                className="px-5 py-2 bg-white/5 rounded-md border border-white/10 
                           font-mono text-lg font-bold text-white/30"
                style={{ backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
              >
                {slang}
              </div>
            ))}
          </motion.div>
        </div>

        {/* Row 4 - Moving Right */}
        <div className="absolute top-[44%] left-0 whitespace-nowrap will-change-transform">
          <motion.div
            className="flex gap-4"
            animate={{ x: [-2400, 0] }}
            transition={{
              duration: 55,
              repeat: Infinity,
              ease: "linear",
            }}
            style={{ willChange: 'transform' }}
          >
            {slangRow.map((slang, i) => (
              <div
                key={`row4-${i}`}
                className="px-5 py-2 bg-white/5 rounded-md border border-white/10 
                           font-mono text-lg font-bold text-white/30"
                style={{ backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
              >
                {slang}
              </div>
            ))}
          </motion.div>
        </div>

        {/* Rows 5-8: Desktop only for performance */}
        {!isMobile && (
          <>
            {/* Row 5 - Moving Left */}
            <div className="absolute top-[57%] left-0 whitespace-nowrap will-change-transform">
              <motion.div
                className="flex gap-4"
                animate={{ x: [0, -2400] }}
                transition={{
                  duration: 50,
                  repeat: Infinity,
                  ease: "linear",
                }}
                style={{ willChange: 'transform' }}
              >
                {slangRow.map((slang, i) => (
                  <div
                    key={`row5-${i}`}
                    className="px-5 py-2 bg-white/5 rounded-md border border-white/10 
                               font-mono text-lg font-bold text-white/30"
                    style={{ backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
                  >
                    {slang}
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Row 6 - Moving Right */}
            <div className="absolute top-[70%] left-0 whitespace-nowrap will-change-transform">
              <motion.div
                className="flex gap-4"
                animate={{ x: [-2400, 0] }}
                transition={{
                  duration: 65,
                  repeat: Infinity,
                  ease: "linear",
                }}
                style={{ willChange: 'transform' }}
              >
                {slangRow.map((slang, i) => (
                  <div
                    key={`row6-${i}`}
                    className="px-5 py-2 bg-white/5 rounded-md border border-white/10 
                               font-mono text-lg font-bold text-white/30"
                    style={{ backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
                  >
                    {slang}
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Row 7 - Moving Left */}
            <div className="absolute top-[83%] left-0 whitespace-nowrap will-change-transform">
              <motion.div
                className="flex gap-4"
                animate={{ x: [0, -2400] }}
                transition={{
                  duration: 55,
                  repeat: Infinity,
                  ease: "linear",
                }}
                style={{ willChange: 'transform' }}
              >
                {slangRow.map((slang, i) => (
                  <div
                    key={`row7-${i}`}
                    className="px-5 py-2 bg-white/5 rounded-md border border-white/10 
                               font-mono text-lg font-bold text-white/30"
                    style={{ backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
                  >
                    {slang}
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Row 8 - Bottom - Moving Right */}
            <div className="absolute top-[96%] left-0 whitespace-nowrap will-change-transform">
              <motion.div
                className="flex gap-4"
                animate={{ x: [-2400, 0] }}
                transition={{
                  duration: 60,
                  repeat: Infinity,
                  ease: "linear",
                }}
                style={{ willChange: 'transform' }}
              >
                {slangRow.map((slang, i) => (
                  <div
                    key={`row8-${i}`}
                    className="px-5 py-2 bg-white/5 rounded-md border border-white/10 
                               font-mono text-lg font-bold text-white/30"
                    style={{ backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
                  >
                    {slang}
                  </div>
                ))}
              </motion.div>
            </div>
          </>
        )}
      </div>

      {/* Main Content - Overlaid on top */}
      <div className="relative z-10 min-h-screen flex flex-col items-start justify-center px-6 sm:px-12 lg:px-20 py-20">
        {/* Left-aligned container */}
        <div className="max-w-7xl w-full text-left space-y-1 sm:space-y-2 mb-8 sm:mb-12">
          {/* Just have FUN!! - Large Display */}
          <motion.h1
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ 
              duration: 1,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="font-playfair text-7xl sm:text-8xl md:text-9xl lg:text-[12rem] xl:text-[14rem] 
                       font-bold text-[#eaeaf0] leading-[0.85] tracking-tight"
          >
            Just have
          </motion.h1>
          
          <motion.h1
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ 
              duration: 1,
              delay: 0.1,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="font-playfair text-7xl sm:text-8xl md:text-9xl lg:text-[12rem] xl:text-[14rem] 
                       font-bold text-[#eaeaf0] leading-[0.85] tracking-tight"
          >
            FUN!!
          </motion.h1>

          {/* Meet People: - Medium accent */}
          <motion.h2
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ 
              duration: 1,
              delay: 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="font-playfair text-4xl sm:text-5xl md:text-6xl lg:text-7xl 
                       font-bold text-[#fcf290] leading-tight pt-2 sm:pt-3"
          >
            Meet People:
          </motion.h2>
        </div>

        {/* Rotating Sentence Area - No underline, rolling blur animation */}
        <div className="max-w-7xl w-full text-left mb-16 sm:mb-20">
          <div className="min-h-[100px] sm:min-h-[120px] md:min-h-[150px] lg:min-h-[180px] flex items-center justify-start">
            <AnimatePresence mode="wait">
              <motion.p
                key={currentReasonIndex}
                initial={{ 
                  opacity: 0,
                  scale: 0.9,
                  filter: 'blur(20px)',
                }}
                animate={{ 
                  opacity: 1,
                  scale: 1,
                  filter: 'blur(0px)',
                }}
                exit={{ 
                  opacity: 0,
                  scale: 0.9,
                  filter: 'blur(20px)',
                }}
                transition={{ 
                  duration: 0.8,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="font-inter text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl 
                           font-light text-[#eaeaf0] leading-tight max-w-[90%]"
              >
                {meetPeopleReasons[currentReasonIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Life.webp - Bottom Center */}
      <div className="relative z-10 flex justify-center pb-16 sm:pb-20">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ 
            duration: 1,
            delay: 0.6,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl px-6"
        >
          <Image
            src="/Life.webp"
            alt="Life animation"
            width={800}
            height={800}
            className="w-full h-auto rounded-2xl shadow-2xl"
            unoptimized
          />
        </motion.div>
      </div>
    </main>
  );
}
