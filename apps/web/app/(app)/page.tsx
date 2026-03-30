import { SkullFluidReveal } from "@/components/landing/skull-fluid-reveal";
import Preloader, { isInitialLoad } from "@/components/layout/preloader";

export default function HomePage() {
  const heroDelay = isInitialLoad ? 7 : 0.5;
  const footerDelay = isInitialLoad ? 7.5 : 0.75;

  return (
    <main>
      <Preloader />
      <SkullFluidReveal />
      <section className="flex items-center justify-center h-screen absolute w-full">
        <div className="container relative w-full h-full flex flex-col items-center justify-center text-white ">
          <div className="hero-header text-5xl text-center font-bold">
            <h1 className="">e-Anatomy</h1>
          </div>

          <div className="bottom-5 absolute w-full flex items-center justify-between">
            <span className="mono sm">Preserving What Remains</span>
            <span className="mono sm">[ Since 1961 ]</span>
          </div>
        </div>
      </section>
    </main>
  );
}
