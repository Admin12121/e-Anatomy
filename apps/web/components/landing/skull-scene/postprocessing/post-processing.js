import * as THREE from "three/webgpu"
import { bloom } from "three/addons/tsl/display/BloomNode.js"
import { mx_noise_float } from "three/tsl"
import {
  Fn,
  clamp,
  dot,
  float,
  mix,
  mul,
  pass,
  screenUV,
  sin,
  sub,
  time,
  vec3,
} from "three/tsl"

export class PostProcessing {
  constructor(renderer, solidScene, wireScene, camera, fluidMaskNode) {
    this.pipeline = new THREE.RenderPipeline(renderer)
    this.solidScene = solidScene
    this.wireScene = wireScene
    this.camera = camera
    this.fluidMaskNode = fluidMaskNode

    this.#compose()
  }

  #compose() {
    const solidPass = pass(this.solidScene, this.camera)
    const solidColor = solidPass.getTextureNode("output")
    const wirePass = pass(this.wireScene, this.camera)
    const wireColor = wirePass.getTextureNode("output")

    const bloomPass = bloom(solidColor.sample(screenUV), 0.4, 0.05)
    const scanRaw = sin(mul(screenUV.y, float(1250)))
    const scanDarken = clamp(scanRaw, -1, 0).mul(-0.15)
    const scanLines = sub(float(1), scanDarken)
    const bloomWithScanLines = bloomPass.mul(scanLines)
    const fluidMask = sub(float(1), this.fluidMaskNode.sample(screenUV).r)
    const blended = mix(bloomWithScanLines, wireColor.sample(screenUV), fluidMask)

    const noise = mx_noise_float(vec3(screenUV.mul(2000), time.mul(20))).mul(0.015)
    const withEffects = blended.sub(noise)
    const luminance = dot(withEffects, vec3(0.299, 0.587, 0.114))
    const desaturated = mix(vec3(luminance, luminance, luminance), withEffects, float(0.985))

    this.pipeline.outputNode = Fn(() => mix(vec3(0, 0, 0.2), desaturated, float(0.9)))()
  }

  render() {
    this.pipeline.render()
  }

  dispose() {
    this.pipeline.dispose()
  }
}
