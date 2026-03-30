import { MeshStandardNodeMaterial } from "three/webgpu"
import {
  float,
  mix,
  normalView,
  positionLocal,
  positionViewDirection,
  pow,
  smoothstep,
  sub,
  vec3,
} from "three/tsl"

export function createFresnelMaterial({
  heightMax = 1,
  roughness = 1,
  color = vec3(0.23, 0.68, 1),
  emissiveIntensity = 0.75,
}) {
  const material = new MeshStandardNodeMaterial({
    metalness: 0,
    roughness,
  })

  const fresnel = pow(
    sub(float(1), normalView.dot(positionViewDirection.negate())),
    float(1),
  )

  const coreColor = vec3(0.01, 0.05, 0.08)
  const fresnelColor = mix(coreColor, color, fresnel)
  const heightFade = smoothstep(0.5, heightMax, positionLocal.y)
  const finalColor = fresnelColor.mul(heightFade)

  material.colorNode = finalColor
  material.emissiveNode = finalColor.mul(emissiveIntensity)

  return material
}
