import { getConsoleFunction, setConsoleFunction } from "three";

type ThreeConsoleFunction = (
  type: "error" | "log" | "warn",
  message: string,
  ...params: unknown[]
) => void;

const CLOCK_DEPRECATION_WARNING =
  "THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.";

let installed = false;

export function installThreeCompatibilityConsoleFilter() {
  if (installed) {
    return;
  }

  installed = true;

  const previousConsoleFunction =
    getConsoleFunction() as ThreeConsoleFunction | null;

  setConsoleFunction((type, message, ...params) => {
    // @react-three/fiber 9.5 still creates THREE.Clock internally. Keep other
    // Three warnings visible while the dependency catches up to THREE.Timer.
    if (type === "warn" && message === CLOCK_DEPRECATION_WARNING) {
      return;
    }

    if (previousConsoleFunction) {
      previousConsoleFunction(type, message, ...params);
      return;
    }

    console[type](message, ...params);
  });
}
