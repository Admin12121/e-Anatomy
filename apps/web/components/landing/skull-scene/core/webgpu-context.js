import * as THREE from "three/webgpu"

export class WebGPUContext {
  constructor(container) {
    this.container = container
    this.renderer = null
    this.canvas = null
    this.pixelRatio = 1
  }

  async init() {
    this.canvas = document.createElement("canvas")
    this.canvas.setAttribute("aria-hidden", "true")

    Object.assign(this.canvas.style, {
      height: "100%",
      inset: "0",
      pointerEvents: "none",
      position: "absolute",
      width: "100%",
    })

    this.container.appendChild(this.canvas)

    this.renderer = new THREE.WebGPURenderer({
      alpha: true,
      antialias: false,
      canvas: this.canvas,
    })

    await this.renderer.init()

    const { height, width } = this.getDimensions()

    this.onResize(width, height)
    this.renderer.shadowMap.enabled = false
    this.renderer.autoClear = false
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
  }

  getDimensions() {
    const rect = this.container.getBoundingClientRect()

    return {
      height: Math.max(1, Math.round(rect.height || this.container.clientHeight || window.innerHeight)),
      width: Math.max(1, Math.round(rect.width || this.container.clientWidth || window.innerWidth)),
    }
  }

  onResize(width, height) {
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(this.pixelRatio)
  }

  dispose() {
    this.renderer?.dispose()
    this.canvas?.remove()
  }
}
