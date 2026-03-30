import * as THREE from "three/webgpu"
import { MeshBasicNodeMaterial } from "three/webgpu"
import {
  Fn,
  add,
  float,
  min,
  mul,
  sub,
  texture,
  uv,
  vec2,
  vec3,
} from "three/tsl"

import { fbm } from "../utils/fbm.js"

export class FluidSim {
  constructor(width, height) {
    this.width = width
    this.height = height

    this.#createRenderTargets()
    this.#createFboScene()
  }

  #createRenderTargets() {
    const options = {
      depthBuffer: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      stencilBuffer: false,
    }

    this.targetA = new THREE.RenderTarget(this.width, this.height, options)
    this.targetB = new THREE.RenderTarget(this.width, this.height, options)
    this.prevNode = texture(this.targetA.texture)
    this.maskNode = texture(this.targetA.texture)
  }

  #createFboScene() {
    this.fboScene = new THREE.Scene()
    this.fboCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)
    this.inputNode = texture(new THREE.Texture())

    const material = new MeshBasicNodeMaterial()

    material.colorNode = this.#createFluidShader()

    const geometry = new THREE.PlaneGeometry(2, 2)
    const uvAttribute = geometry.attributes.uv

    for (let index = 0; index < uvAttribute.count; index += 1) {
      uvAttribute.setY(index, 1 - uvAttribute.getY(index))
    }

    this.fboQuad = new THREE.Mesh(geometry, material)
    this.fboScene.add(this.fboQuad)
  }

  #createFluidShader() {
    const blendDarken = Fn(([base, blend]) => min(blend, base))
    const aspect = this.height / this.width
    const aspectVector =
      this.width < this.height ? vec2(1, 1 / aspect) : vec2(aspect, 1)

    return Fn(() => {
      const uvCoord = uv()
      const displacement = mul(mul(fbm(mul(uvCoord, 20), float(4)), aspectVector), 0.01)

      const texel = this.prevNode.sample(uvCoord)
      const texel2 = this.prevNode.sample(vec2(add(uvCoord.x, displacement.x), uvCoord.y))
      const texel3 = this.prevNode.sample(vec2(sub(uvCoord.x, displacement.x), uvCoord.y))
      const texel4 = this.prevNode.sample(vec2(uvCoord.x, add(uvCoord.y, displacement.y)))
      const texel5 = this.prevNode.sample(vec2(uvCoord.x, sub(uvCoord.y, displacement.y)))

      const floodColor = texel.rgb.toVar()

      floodColor.assign(blendDarken(floodColor, texel2.rgb))
      floodColor.assign(blendDarken(floodColor, texel3.rgb))
      floodColor.assign(blendDarken(floodColor, texel4.rgb))
      floodColor.assign(blendDarken(floodColor, texel5.rgb))

      const flippedUv = vec2(uvCoord.x, sub(float(1), uvCoord.y))
      const input = this.inputNode.sample(flippedUv)
      const combined = blendDarken(floodColor, input.rgb)

      return min(vec3(1), add(combined, vec3(0.015)))
    })()
  }

  get texture() {
    return this.maskNode
  }

  update(renderer, trailTexture) {
    this.prevNode.value = this.targetA.texture
    this.inputNode.value = trailTexture

    renderer.setRenderTarget(this.targetB)
    renderer.render(this.fboScene, this.fboCamera)
    renderer.setRenderTarget(null)

    this.maskNode.value = this.targetB.texture

    const nextTarget = this.targetA

    this.targetA = this.targetB
    this.targetB = nextTarget
  }

  onResize(width, height) {
    this.width = width
    this.height = height
    this.targetA.setSize(width, height)
    this.targetB.setSize(width, height)

    if (this.fboQuad) {
      this.fboScene.remove(this.fboQuad)
      this.fboQuad.material.dispose()
      this.fboQuad.geometry.dispose()
    }

    this.#createFboScene()
  }

  dispose() {
    this.targetA.dispose()
    this.targetB.dispose()

    if (this.fboQuad) {
      this.fboQuad.material.dispose()
      this.fboQuad.geometry.dispose()
    }
  }
}
