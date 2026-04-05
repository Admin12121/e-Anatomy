import * as THREE from "three/webgpu"

import { FluidSim } from "../postprocessing/fluid-sim.js"
import { PostProcessing } from "../postprocessing/post-processing.js"
import { LandingScene } from "../scenes/landing-scene.js"
import { MouseTrail } from "../utils/mouse-trail.js"
import { WebGPUContext } from "./webgpu-context.js"

export class LandingSkullScene {
  constructor(container) {
    this.container = container
    this.clock = new THREE.Timer()
    this.frameId = null
    this.resizeObserver = null

    this.animate = this.animate.bind(this)
    this.handleResize = this.handleResize.bind(this)
  }

  async run() {
    this.context = new WebGPUContext(this.container)
    await this.context.init()
    this.clock.connect(document)
    this.clock.reset()

    const { height, width } = this.context.getDimensions()
    const pixelWidth = width * this.context.pixelRatio
    const pixelHeight = height * this.context.pixelRatio

    this.scene = new LandingScene(this.context, this.container)
    this.mouseTrail = new MouseTrail(pixelWidth, pixelHeight)
    this.fluidSim = new FluidSim(pixelWidth, pixelHeight)
    this.postProcessing = new PostProcessing(
      this.context.renderer,
      this.scene.solidScene,
      this.scene.wireScene,
      this.scene.camera,
      this.fluidSim.texture,
    )

    await this.scene.ready
    this.#observeResize()
    this.frameId = window.requestAnimationFrame(this.animate)
  }

  #observeResize() {
    this.resizeObserver = new ResizeObserver(this.handleResize)
    this.resizeObserver.observe(this.container)
  }

  handleResize() {
    if (!this.context || !this.scene || !this.mouseTrail || !this.fluidSim) {
      return
    }

    const { height, width } = this.context.getDimensions()

    this.context.onResize(width, height)
    this.scene.onResize(width, height)
    this.mouseTrail.onResize(width * this.context.pixelRatio, height * this.context.pixelRatio)
    this.fluidSim.onResize(width * this.context.pixelRatio, height * this.context.pixelRatio)
  }

  animate(timestamp) {
    this.clock.update(timestamp)
    const delta = this.clock.getDelta()

    this.scene.animate(delta, this.clock.getElapsed())
    this.mouseTrail.update(this.scene.cameraRig.mouseNormalized.x, this.scene.cameraRig.mouseNormalized.y)
    this.fluidSim.update(this.context.renderer, this.mouseTrail.texture)
    this.postProcessing.render()

    this.frameId = window.requestAnimationFrame(this.animate)
  }

  dispose() {
    if (this.frameId) {
      window.cancelAnimationFrame(this.frameId)
    }

    this.resizeObserver?.disconnect()
    this.clock?.dispose?.()
    this.postProcessing?.dispose()
    this.fluidSim?.dispose()
    this.mouseTrail?.dispose()
    this.scene?.dispose()
    this.context?.dispose()
  }
}
