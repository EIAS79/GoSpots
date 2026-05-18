import { LandingPage } from "@/components/landing/landing-page";
import { ModeProvider } from "@/components/landing/mode-context";

export default function HomePage() {
  return (
    <ModeProvider initial="play">
      <LandingPage />
    </ModeProvider>
  );
}
