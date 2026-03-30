import * as THREE from "three/webgpu"
import { easing } from "maath"

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export class CameraRig {
  constructor(camera, container) {
    this.camera = camera
    this.container = container

    this.basePos = new THREE.Vector3(1.5, 1.5, 0.55)
    this.lookAt = new THREE.Vector3(-0.52, 0.45, -0.45)

    this.camera.position.copy(this.basePos)
    this.camera.lookAt(this.lookAt)

    this.mouseNormalized = { x: 0.5, y: 0.5 }
    this.mouseTarget = { x: 0.5, y: 0.5 }
    this.pointer = { x: 0, y: 0 }
    this.pointerTarget = { x: 0, y: 0 }

    this.smoothTime = 0.25
    this.touchTime = 0
    this.isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window
    this.isMobile = window.innerWidth < 768
    this._targetPos = [0, 0, 0]

    this.handlePointerMove = this.handlePointerMove.bind(this)
    this.handlePointerLeave = this.handlePointerLeave.bind(this)
    this.handleResize = this.handleResize.bind(this)

    if (!this.isTouch) {
      window.addEventListener("pointermove", this.handlePointerMove)
      window.addEventListener("resize", this.handleResize)
    }
  }

  handlePointerMove(event) {
    const rect = this.container.getBoundingClientRect()

    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      this.handlePointerLeave()
      return
    }

    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const y = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1)

    this.mouseTarget.x = x
    this.mouseTarget.y = y
    this.pointerTarget.x = x * 2 - 1
    this.pointerTarget.y = y * 2 - 1
  }

  handlePointerLeave() {
    this.mouseTarget.x = 0.5
    this.mouseTarget.y = 0.5
    this.pointerTarget.x = 0
    this.pointerTarget.y = 0
  }

  handleResize() {
    this.isMobile = window.innerWidth < 768
  }

  update(delta, elapsed) {
    let pointerX = 0
    let pointerY = 0

    if (this.isTouch) {
      this.touchTime += delta * 0.5
      pointerX = Math.sin(this.touchTime)
      pointerY = Math.sin(this.touchTime * 0.7) * 0.5

      const trailTime = elapsed * 1.3

      this.mouseNormalized.x = 0.5 + Math.sin(trailTime) * 0.5
      this.mouseNormalized.y = 0.5 + Math.sin(trailTime * 2) * 0.5
    } else {
      this.pointer.x += (this.pointerTarget.x - this.pointer.x) * 0.08
      this.pointer.y += (this.pointerTarget.y - this.pointer.y) * 0.08
      this.mouseNormalized.x += (this.mouseTarget.x - this.mouseNormalized.x) * 0.08
      this.mouseNormalized.y += (this.mouseTarget.y - this.mouseNormalized.y) * 0.08

      pointerX = this.pointer.x
      pointerY = this.pointer.y
    }

    const zoom = this.isMobile ? 1.2 : 1

    this._targetPos[0] =
      this.lookAt.x + (this.basePos.x - this.lookAt.x) * zoom + pointerX * 0.125
    this._targetPos[1] =
      this.lookAt.y + (this.basePos.y - this.lookAt.y) * zoom + pointerY * 0.075
    this._targetPos[2] = this.lookAt.z + (this.basePos.z - this.lookAt.z) * zoom

    easing.damp3(this.camera.position, this._targetPos, this.smoothTime, delta)
    this.camera.lookAt(this.lookAt)
  }

  dispose() {
    if (this.isTouch) {
      return
    }

    window.removeEventListener("pointermove", this.handlePointerMove)
    window.removeEventListener("resize", this.handleResize)
  }
}
