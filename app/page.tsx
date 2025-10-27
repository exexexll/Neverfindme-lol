import { Hero } from '@/components/Hero';
import { Container } from '@/components/Container';
import { Button } from '@/components/Button';
import Link from 'next/link';
import { PixelizedTeamPhoto } from '@/components/PixelizedTeamPhoto';

export default function HomePage() {
  return (
    <>
      <main id="main">
        <Hero />

        {/* More Section */}
        <section id="more" className="relative bg-[#0a0a0c] py-20 sm:py-24 lg:py-32 overflow-hidden">
          {/* Pixelized Team Photo Background */}
          <PixelizedTeamPhoto />
          
          <Container>
            <div className="relative z-10 mx-auto max-w-3xl">
              <h2 className="mb-6 font-playfair text-3xl font-bold tracking-tight sm:text-4xl">
                Meet people near you. Make friends IRL.
              </h2>
              <div className="space-y-6 text-base leading-relaxed text-[#e6e6e9]/90 sm:text-lg">
                <p>
                  <strong className="text-[#ffc46a]">BUMPIN</strong> is a networking platform designed to introduce relationships that last. We believe in the power of serendipity and authenticity few platforms still offer today. Our goal is to provide an algorithm-free, location based matchmaking experience similar to how you bump into people by accidents, but now you can do it anywhere, anytime.
                </p>
                
                <div className="border-l-4 border-[#ffc46a] pl-6 my-6">
                  <h3 className="font-bold text-[#eaeaf0] mb-2">Up to 500 seconds.</h3>
                  <p className="text-[#e6e6e9]/80">
                    Most conversations should happen offline. Omegle made the mistake of allowing up to infinite hours of talking with strangers online who ended up living across states or even countries—that&apos;s time wasted. BUMPIN is strictly a meet and greet site that&apos;s helpful when you are searching for friends nearby.
                  </p>
                </div>

                <div className="border-l-4 border-[#ffc46a] pl-6 my-6">
                  <h3 className="font-bold text-[#eaeaf0] mb-2">No AI.</h3>
                  <p className="text-[#e6e6e9]/80">
                    BUMPIN swore by the principle and movement of NO to AI. AI shouldn&apos;t come in between human affairs, for privacy and practical reasons.
                  </p>
                </div>
              </div>
              
              <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Button variant="primary" href="/onboarding">
                  Start connecting
                </Button>
                <Link 
                  href="/login"
                  className="text-sm font-medium text-[#eaeaf0]/70 hover:text-[#ffc46a] transition-colors"
                >
                  Already have an account? Login
                </Link>
              </div>
              
              {/* FAQ Link */}
              <div className="mt-8 text-center">
                <Link 
                  href="/faq"
                  className="inline-flex items-center gap-2 text-[#ffc46a] hover:underline transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Have questions? Check out our FAQ
                </Link>
              </div>
            </div>
          </Container>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#0a0a0c] py-8">
        <Container>
          <div className="text-center">
            <p className="text-sm text-[#e6e6e9]/70">
              Made with Passion
            </p>
            <div className="mt-4 flex items-center justify-center gap-6 text-sm">
              <Link 
                href="/blacklist"
                className="text-[#e6e6e9]/50 transition-colors hover:text-red-400"
              >
                Blacklist
              </Link>
              <span className="text-[#e6e6e9]/30">•</span>
              <Link 
                href="/manifesto"
                className="text-[#e6e6e9]/50 transition-colors hover:text-[#ffc46a]"
              >
                Meet Who and Do What?
              </Link>
            </div>
            <p className="mt-3 text-xs text-[#e6e6e9]/40">
              Community safety powered by transparency
            </p>
          </div>
        </Container>
      </footer>
    </>
  );
}

