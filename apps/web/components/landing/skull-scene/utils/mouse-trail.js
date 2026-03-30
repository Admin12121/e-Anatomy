import * as THREE from "three"

export class MouseTrail {
  constructor(width, height) {
    this.currentX = null
    this.currentY = null
    this.lastX = null
    this.lastY = null
    this.opacity = 0
    this.lerpSpeed = 0.075
    this.fadeInSpeed = 0.1
    this.fadeOutSpeed = 0.1
    this.moveThreshold = 0.5

    this.#createCanvas(width, height)
    this.#createTexture()
  }

  #createCanvas(width, height) {
    this.canvas = document.createElement("canvas")
    this.canvas.width = Math.max(1, Math.round(width))
    this.canvas.height = Math.max(1, Math.round(height))
    this.ctx = this.canvas.getContext("2d")
    this.lineWidth = Math.max(this.canvas.width * 0.2, 100)

    this.ctx.fillStyle = "white"
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
  }

  #createTexture() {
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.minFilter = THREE.LinearFilter
    this.texture.magFilter = THREE.LinearFilter
    this.texture.generateMipmaps = false
  }

  update(mouseX, mouseY) {
    const targetX = mouseX * this.canvas.width
    const targetY = (1 - mouseY) * this.canvas.height

    if (this.currentX === null || this.currentY === null) {
      this.currentX = targetX
      this.currentY = targetY
      this.lastX = targetX
      this.lastY = targetY
      return
    }

    this.#lerp(targetX, targetY)
    this.#updateOpacity()
    this.#draw()

    this.lastX = this.currentX
    this.lastY = this.currentY
    this.texture.needsUpdate = true
  }

  #lerp(targetX, targetY) {
    this.currentX += (targetX - this.currentX) * this.lerpSpeed
    this.currentY += (targetY - this.currentY) * this.lerpSpeed
  }

  #updateOpacity() {
    const dx = this.currentX - this.lastX
    const dy = this.currentY - this.lastY
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance > this.moveThreshold) {
      this.opacity = Math.min(1, this.opacity + this.fadeInSpeed)
      return
    }

    this.opacity = Math.max(0, this.opacity - this.fadeOutSpeed)
  }

  #draw() {
    this.ctx.fillStyle = "white"
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    if (this.opacity <= 0.01) {
      return
    }

    this.ctx.beginPath()
    this.ctx.moveTo(this.lastX, this.lastY)
    this.ctx.lineTo(this.currentX, this.currentY)
    this.ctx.lineCap = "round"
    this.ctx.lineWidth = this.lineWidth
    this.ctx.strokeStyle = `rgba(0, 0, 0, ${this.opacity})`
    this.ctx.stroke()
  }

  onResize(width, height) {
    const scaleX = width / this.canvas.width
    const scaleY = height / this.canvas.height

    if (this.currentX !== null && this.lastX !== null) {
      this.currentX *= scaleX
      this.lastX *= scaleX
    }

    if (this.currentY !== null && this.lastY !== null) {
      this.currentY *= scaleY
      this.lastY *= scaleY
    }

    this.canvas.width = Math.max(1, Math.round(width))
    this.canvas.height = Math.max(1, Math.round(height))
    this.lineWidth = Math.max(this.canvas.width * 0.2, 100)
    this.ctx.fillStyle = "white"
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    this.texture.needsUpdate = true
  }

  dispose() {
    this.texture.dispose()
  }
}
