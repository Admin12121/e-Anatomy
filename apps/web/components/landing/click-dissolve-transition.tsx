"use client";

import { useEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import * as THREE from "three";

import { cn } from "@/lib/utils";

type ClickDissolveTransitionProps = {
  className?: string;
  runId: number;
  sourceRootRef: RefObject<HTMLElement | null>;
  targetRootRef: RefObject<HTMLElement | null>;
};

type ShaderRuntime = {
  camera: THREE.OrthographicCamera;
  geometry: THREE.PlaneGeometry;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
};

const transitionVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const transitionFragmentShader = `
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform vec2 uImageResolution;
  uniform float uDissolve;
  uniform vec2 uCenter;
  uniform float uTime;
  uniform float uGrayscale;
  uniform float uEdgeIntensity;
  uniform float uEdgeBrightness;
  varying vec2 vUv;

  mat3 sobelX = mat3(
    -1.0, 0.0, 1.0,
    -2.0, 0.0, 2.0,
    -1.0, 0.0, 1.0
  );

  mat3 sobelY = mat3(
    -1.0, -2.0, -1.0,
     0.0,  0.0,  0.0,
     1.0,  2.0,  1.0
  );

  float getLuminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  float sobel(sampler2D tex, vec2 uv, vec2 texelSize) {
    float gx = 0.0;
    float gy = 0.0;

    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        vec2 offset = vec2(float(i), float(j)) * texelSize;
        float lum = getLuminance(texture2D(tex, uv + offset).rgb);
        gx += lum * sobelX[i + 1][j + 1];
        gy += lum * sobelY[i + 1][j + 1];
      }
    }

    return sqrt(gx * gx + gy * gy);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;

    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }

    return value;
  }

  void main() {
    vec2 ratio = vec2(
      min((uResolution.x / uResolution.y) / (uImageResolution.x / uImageResolution.y), 1.0),
      min((uResolution.y / uResolution.x) / (uImageResolution.y / uImageResolution.x), 1.0)
    );

    vec2 uv = vec2(
      vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
      vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
    );

    vec4 texColor = texture2D(uTexture, uv);

    float gray = getLuminance(texColor.rgb);
    vec3 grayscaleColor = vec3(gray);
    texColor.rgb = mix(texColor.rgb, grayscaleColor, uGrayscale);

    vec2 centeredUv = vUv - uCenter;
    float aspect = uResolution.x / uResolution.y;
    centeredUv.x *= aspect;
    float dist = length(centeredUv);
    float angle = atan(centeredUv.y, centeredUv.x);

    float noiseScale = 6.0;
    vec2 pixelatedUv = floor(vUv * uResolution / noiseScale) * noiseScale / uResolution;
    float blockNoise = fbm(pixelatedUv * 100.0) * 0.15;
    float angularNoise = fbm(vec2(angle * 5.0, 0.0)) * 0.15;
    float totalNoise = blockNoise + angularNoise;
    float noisyDist = dist + totalNoise;

    float maxDist = length(vec2(aspect * 0.5, 0.5));
    float normalizedDist = noisyDist / maxDist;
    float dissolveThreshold = uDissolve * 1.5;

    vec2 texelSize = 1.0 / uResolution;
    float edge = sobel(uTexture, uv, texelSize);
    edge = pow(edge, 0.7) * 2.0;
    edge = clamp(edge, 0.0, 1.0);

    float dissolveMask = smoothstep(dissolveThreshold - 0.03, dissolveThreshold, normalizedDist);
    vec3 edgeColor = vec3(1.0, 1.0, 1.0);
    vec3 baseColor = mix(texColor.rgb, vec3(0.0), uGrayscale);
    vec3 finalColor = baseColor;

    float edgeGlowIntensity = uEdgeIntensity * 2.0;
    float edgeGlow = edge * edgeGlowIntensity * (1.0 + uGrayscale * 3.0);
    finalColor += edgeColor * edgeGlow * uEdgeBrightness;

    float edgeZoneWidth = 0.15 * (1.0 - uDissolve) + 0.02;
    float edgeZone = smoothstep(dissolveThreshold - edgeZoneWidth, dissolveThreshold - edgeZoneWidth + 0.04, normalizedDist) *
                     smoothstep(dissolveThreshold + 0.02, dissolveThreshold - 0.02, normalizedDist);
    float sparkle = hash(floor(vUv * uResolution / 4.0)) * edgeZone;

    float edgeBrightness = (1.0 - uDissolve) * uEdgeBrightness * (1.0 + uGrayscale * 2.0);
    finalColor += vec3(sparkle * 3.0 * edgeBrightness);

    float alpha = dissolveMask * texColor.a;

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

const transitionFragmentShaderSecondary = `
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform vec2 uImageResolution;
  uniform float uDissolve;
  uniform vec2 uCenter;
  uniform float uTime;
  uniform float uBrightness;
  uniform float uEdgeIntensity;
  uniform float uDarkness;
  uniform float uGrayscale;
  varying vec2 vUv;

  mat3 sobelX = mat3(
    -1.0, 0.0, 1.0,
    -2.0, 0.0, 2.0,
    -1.0, 0.0, 1.0
  );

  mat3 sobelY = mat3(
    -1.0, -2.0, -1.0,
     0.0,  0.0,  0.0,
     1.0,  2.0,  1.0
  );

  float getLuminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  float sobel(sampler2D tex, vec2 uv, vec2 texelSize) {
    float gx = 0.0;
    float gy = 0.0;

    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        vec2 offset = vec2(float(i), float(j)) * texelSize;
        float lum = getLuminance(texture2D(tex, uv + offset).rgb);
        gx += lum * sobelX[i + 1][j + 1];
        gy += lum * sobelY[i + 1][j + 1];
      }
    }

    return sqrt(gx * gx + gy * gy);
  }

  void main() {
    vec2 ratio = vec2(
      min((uResolution.x / uResolution.y) / (uImageResolution.x / uImageResolution.y), 1.0),
      min((uResolution.y / uResolution.x) / (uImageResolution.y / uImageResolution.x), 1.0)
    );

    vec2 uv = vec2(
      vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
      vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
    );

    vec4 texColor = texture2D(uTexture, uv);

    float gray = getLuminance(texColor.rgb);
    vec3 grayscaleColor = vec3(gray);
    texColor.rgb = mix(texColor.rgb, grayscaleColor, uGrayscale);

    vec2 texelSize = 1.0 / uResolution;
    float edge = sobel(uTexture, uv, texelSize);
    edge = pow(edge, 0.7) * 2.0;
    edge = clamp(edge, 0.0, 1.0);

    vec3 edgeColor = vec3(1.0, 1.0, 1.0);
    vec3 darkBase = vec3(0.0);
    vec3 baseColor = mix(texColor.rgb, darkBase, uDarkness);
    float edgeGlow = edge * uEdgeIntensity * 2.0;
    baseColor += edgeColor * edgeGlow;

    vec3 finalColor = clamp(baseColor, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, texColor.a);
  }
`;

function createFallbackTextureCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;

  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  return canvas;
}

function createCanvasTexture(image: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createRuntime(
  host: HTMLDivElement,
  fragmentShader: string,
  additionalUniforms: Record<string, THREE.IUniform>,
) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.width = "100%";
  host.appendChild(renderer.domElement);

  const geometry = new THREE.PlaneGeometry(2, 2);
  const defaultTexture = createCanvasTexture(createFallbackTextureCanvas());

  const material = new THREE.ShaderMaterial({
    fragmentShader,
    transparent: true,
    uniforms: {
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uDissolve: { value: 0 },
      uImageResolution: { value: new THREE.Vector2(2, 2) },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uTexture: { value: defaultTexture },
      uTime: { value: 0 },
      ...additionalUniforms,
    },
    vertexShader: transitionVertexShader,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  return {
    camera,
    geometry,
    material,
    mesh,
    renderer,
    scene,
  } satisfies ShaderRuntime;
}

function disposeRuntime(runtime: ShaderRuntime | null) {
  if (!runtime) {
    return;
  }

  const texture = runtime.material.uniforms.uTexture.value;

  if (texture instanceof THREE.Texture) {
    texture.dispose();
  }

  runtime.geometry.dispose();
  runtime.material.dispose();
  runtime.renderer.dispose();
  runtime.mesh.removeFromParent();
}

function updateRuntimeTexture(runtime: ShaderRuntime, image: HTMLCanvasElement) {
  const currentTexture = runtime.material.uniforms.uTexture.value;

  if (currentTexture instanceof THREE.Texture) {
    currentTexture.dispose();
  }

  const nextTexture = createCanvasTexture(image);

  runtime.material.uniforms.uTexture.value = nextTexture;
  runtime.material.uniforms.uImageResolution.value.set(image.width, image.height);
}

function querySceneCanvas(root: HTMLElement | null) {
  if (!root) {
    return null;
  }

  const canvas = root.querySelector("canvas");

  return canvas instanceof HTMLCanvasElement ? canvas : null;
}

function drawCanvasCover(
  context: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  width: number,
  height: number,
) {
  const sourceWidth = sourceCanvas.width || sourceCanvas.clientWidth;
  const sourceHeight = sourceCanvas.height || sourceCanvas.clientHeight;

  if (!sourceWidth || !sourceHeight) {
    return;
  }

  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = (width - drawWidth) * 0.5;
  const offsetY = (height - drawHeight) * 0.5;

  try {
    context.drawImage(sourceCanvas, offsetX, offsetY, drawWidth, drawHeight);
  } catch (error) {
    console.warn("Failed to capture transition canvas.", error);
  }
}

function drawLandingBackdrop(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const baseGradient = context.createLinearGradient(0, 0, 0, height);
  baseGradient.addColorStop(0, "#02060c");
  baseGradient.addColorStop(1, "#020617");
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, width, height);

  const indigoGlowLeft = context.createRadialGradient(
    width * 0.18,
    height * 0.2,
    0,
    width * 0.18,
    height * 0.2,
    width * 0.34,
  );
  indigoGlowLeft.addColorStop(0, "rgba(14,165,233,0.22)");
  indigoGlowLeft.addColorStop(1, "rgba(14,165,233,0)");
  context.fillStyle = indigoGlowLeft;
  context.fillRect(0, 0, width, height);

  const indigoGlowRight = context.createRadialGradient(
    width * 0.76,
    height * 0.16,
    0,
    width * 0.76,
    height * 0.16,
    width * 0.28,
  );
  indigoGlowRight.addColorStop(0, "rgba(125,211,252,0.16)");
  indigoGlowRight.addColorStop(1, "rgba(125,211,252,0)");
  context.fillStyle = indigoGlowRight;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = "rgba(255,255,255,0.035)";
  context.lineWidth = 1;

  for (let x = 0; x <= width; x += 96) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  for (let y = 0; y <= height; y += 96) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.restore();
}

function drawStageBackdrop(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  context.fillStyle = "#7e80fc";
  context.fillRect(0, 0, width, height);

  const topGlow = context.createRadialGradient(
    width * 0.5,
    height * 0.1,
    0,
    width * 0.5,
    height * 0.1,
    width * 0.55,
  );
  topGlow.addColorStop(0, "rgba(255,255,255,0.22)");
  topGlow.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = topGlow;
  context.fillRect(0, 0, width, height);

  const centerGlow = context.createRadialGradient(
    width * 0.5,
    height * 0.55,
    0,
    width * 0.5,
    height * 0.55,
    Math.min(width, height) * 0.42,
  );
  centerGlow.addColorStop(0, "rgba(255,255,255,0.08)");
  centerGlow.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = centerGlow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = "rgba(255,255,255,0.04)";
  context.lineWidth = 1;

  for (let x = 0; x <= width; x += 96) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  for (let y = 0; y <= height; y += 96) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.restore();
}

function createSnapshotCanvas(root: HTMLElement | null, variant: "source" | "target") {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const snapshot = document.createElement("canvas");
  snapshot.width = width;
  snapshot.height = height;

  const context = snapshot.getContext("2d");

  if (!context) {
    return snapshot;
  }

  if (variant === "source") {
    drawLandingBackdrop(context, width, height);
  } else {
    drawStageBackdrop(context, width, height);
  }

  const sceneCanvas = querySceneCanvas(root);

  if (sceneCanvas) {
    context.save();
    context.globalAlpha = variant === "source" ? 0.94 : 1;
    drawCanvasCover(context, sceneCanvas, width, height);
    context.restore();
  }

  return snapshot;
}

async function waitForPaint() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function ClickDissolveTransition({
  className,
  runId,
  sourceRootRef,
  targetRootRef,
}: ClickDissolveTransitionProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lowerHostRef = useRef<HTMLDivElement>(null);
  const upperHostRef = useRef<HTMLDivElement>(null);
  const lowerRuntimeRef = useRef<ShaderRuntime | null>(null);
  const upperRuntimeRef = useRef<ShaderRuntime | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    const lowerHost = lowerHostRef.current;
    const upperHost = upperHostRef.current;
    const wrapper = wrapperRef.current;

    if (!lowerHost || !upperHost || !wrapper) {
      return;
    }

    lowerRuntimeRef.current = createRuntime(
      lowerHost,
      transitionFragmentShaderSecondary,
      {
        uBrightness: { value: 0 },
        uDarkness: { value: 1 },
        uEdgeIntensity: { value: 0.65 },
        uGrayscale: { value: 1 },
      },
    );

    upperRuntimeRef.current = createRuntime(
      upperHost,
      transitionFragmentShader,
      {
        uEdgeBrightness: { value: 1 },
        uEdgeIntensity: { value: 0 },
        uGrayscale: { value: 0 },
      },
    );

    gsap.set(wrapper, { autoAlpha: 0 });

    const renderFrame = (time: number) => {
      const currentTime = time * 0.001;
      const lowerRuntime = lowerRuntimeRef.current;
      const upperRuntime = upperRuntimeRef.current;

      if (lowerRuntime) {
        lowerRuntime.material.uniforms.uTime.value = currentTime;
        lowerRuntime.renderer.render(lowerRuntime.scene, lowerRuntime.camera);
      }

      if (upperRuntime) {
        upperRuntime.material.uniforms.uTime.value = currentTime;
        upperRuntime.renderer.render(upperRuntime.scene, upperRuntime.camera);
      }

      rafIdRef.current = requestAnimationFrame(renderFrame);
    };

    rafIdRef.current = requestAnimationFrame(renderFrame);

    const handleResize = () => {
      const lowerRuntime = lowerRuntimeRef.current;
      const upperRuntime = upperRuntimeRef.current;

      for (const runtime of [lowerRuntime, upperRuntime]) {
        if (!runtime) {
          continue;
        }

        runtime.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        runtime.renderer.setSize(window.innerWidth, window.innerHeight);
        runtime.material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }

      timelineRef.current?.kill();
      disposeRuntime(lowerRuntimeRef.current);
      disposeRuntime(upperRuntimeRef.current);
      lowerRuntimeRef.current = null;
      upperRuntimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!runId) {
      return;
    }

    let cancelled = false;

    const playTransition = async () => {
      await waitForPaint();

      if (cancelled) {
        return;
      }

      const wrapper = wrapperRef.current;
      const lowerHost = lowerHostRef.current;
      const upperHost = upperHostRef.current;
      const lowerRuntime = lowerRuntimeRef.current;
      const upperRuntime = upperRuntimeRef.current;

      if (
        !wrapper ||
        !lowerHost ||
        !upperHost ||
        !lowerRuntime ||
        !upperRuntime
      ) {
        return;
      }

      updateRuntimeTexture(
        upperRuntime,
        createSnapshotCanvas(sourceRootRef.current, "source"),
      );
      updateRuntimeTexture(
        lowerRuntime,
        createSnapshotCanvas(targetRootRef.current, "target"),
      );

      upperRuntime.material.uniforms.uDissolve.value = 0;
      upperRuntime.material.uniforms.uGrayscale.value = 0;
      upperRuntime.material.uniforms.uEdgeIntensity.value = 0;
      upperRuntime.material.uniforms.uEdgeBrightness.value = 1;

      lowerRuntime.material.uniforms.uDarkness.value = 1;
      lowerRuntime.material.uniforms.uGrayscale.value = 1;
      lowerRuntime.material.uniforms.uEdgeIntensity.value = 0.65;

      timelineRef.current?.kill();

      gsap.set(wrapper, { autoAlpha: 1 });
      gsap.set([lowerHost, upperHost], { opacity: 1 });

      timelineRef.current = gsap.timeline({
        defaults: {
          ease: "expo.inOut",
        },
        onComplete: () => {
          gsap.set(wrapper, { autoAlpha: 0 });
        },
      });

      timelineRef.current
        .to(
          upperRuntime.material.uniforms.uDissolve,
          {
            duration: 3.5,
            value: 1,
          },
          0,
        )
        .to(
          upperRuntime.material.uniforms.uGrayscale,
          {
            duration: 1.8,
            ease: "power2.inOut",
            value: 1,
          },
          0,
        )
        .to(
          upperRuntime.material.uniforms.uEdgeIntensity,
          {
            duration: 2.1,
            ease: "power2.inOut",
            value: 0.5,
          },
          0,
        )
        .to(
          upperRuntime.material.uniforms.uEdgeBrightness,
          {
            duration: 3.1,
            ease: "power2.inOut",
            value: 0,
          },
          0,
        )
        .to(
          lowerRuntime.material.uniforms.uDarkness,
          {
            duration: 3.35,
            ease: "expo.inOut",
            value: 0,
          },
          0,
        )
        .to(
          lowerRuntime.material.uniforms.uGrayscale,
          {
            duration: 3.05,
            ease: "power2.inOut",
            value: 0,
          },
          0,
        )
        .to(
          lowerRuntime.material.uniforms.uEdgeIntensity,
          {
            duration: 2.7,
            ease: "power2.inOut",
            value: 0,
          },
          0,
        )
        .to(
          upperHost,
          {
            duration: 0.55,
            ease: "power2.out",
            opacity: 0,
          },
          2.88,
        )
        .to(
          lowerHost,
          {
            duration: 0.65,
            ease: "power2.out",
            opacity: 0,
          },
          2.96,
        );
    };

    void playTransition();

    return () => {
      cancelled = true;
    };
  }, [runId, sourceRootRef, targetRootRef]);

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 z-[5]", className)}
    >
      <div ref={lowerHostRef} className="absolute inset-0" />
      <div ref={upperHostRef} className="absolute inset-0" />
    </div>
  );
}
