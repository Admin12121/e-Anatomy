import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export interface ShinyTextProps {
  text: string;
  duration?: number;
  delay?: number;
  className?: string;
}

const ShinyText = ({
  text,
  duration = 2,
  delay = 0,
  className,
}: ShinyTextProps) => {
  const width = text.length * 2;

  return (
    <motion.p
      initial={{ backgroundPosition: "100% center" }}
      animate={{ backgroundPosition: "0% center" }}
      transition={{
        repeat: Infinity,
        duration,
        repeatDelay: delay,
        ease: "linear",
      }}
      className={cn(
        "relative inline-block bg-[length:250%_100%] bg-no-repeat bg-clip-text text-transparent ",
        className,
      )}
      style={{
        backgroundImage: `
          linear-gradient(
            90deg,
            transparent calc(50% - ${width}px),
            #ffffff 50%,
            transparent calc(50% + ${width}px)
          ),
          linear-gradient(#b5b5b5a4,#b5b5b5a4)
        `,
      }}
    >
      {text}
    </motion.p>
  );
};

export default ShinyText;
