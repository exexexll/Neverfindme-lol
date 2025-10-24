import { Hero } from '@/components/Hero';
import { Container } from '@/components/Container';
import { Button } from '@/components/Button';
import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      <main id="main">
        <Hero />

        {/* More Section */}
        <section id="more" className="bg-[#0a0a0c] py-20 sm:py-24 lg:py-32">
          <Container>
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-6 font-playfair text-3xl font-bold tracking-tight sm:text-4xl">
                What is BUMPIn?
              </h2>
              <div className="space-y-4 text-base leading-relaxed text-[#e6e6e9]/90 sm:text-lg">
                <p>
                  BUMPIn is a 1-1 Video Social Network built for authentic human connection in an age of endless swiping. Every call lasts up to 500 seconds—no more, no less. When the time runs out, the conversation ends, and you decide if you want to connect again.
                </p>
                <p>
                  No profiles to curate. No photos to judge. Just two people, 500 seconds, and a chance to see if something real can happen. Genuine connection shouldn&apos;t require a perfect bio.
                </p>
              </div>
              <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Button variant="primary" href="/onboarding">
                  Start connecting
                </Button>
                <Link 
                  href="/login"
                  className="text-sm font-medium text-[#eaeaf0]/70 hover:text-[#fcf290] transition-colors"
                >
                  Already have an account? Login
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
                className="text-[#e6e6e9]/50 transition-colors hover:text-[#fcf290]"
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

