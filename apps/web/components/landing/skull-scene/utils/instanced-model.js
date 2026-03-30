import * as THREE from "three/webgpu"

import { createFresnelMaterial } from "../materials/fresnel-material.js"
import { loadGltf } from "./import-gltf.js"

export class InstancedModel {
  constructor(
    scene,
    {
      url,
      meshName,
      heightMax = 1,
      roughness = 1,
      color,
      emissiveIntensity,
      count = 12,
      spacing = 0.65,
    },
  ) {
    this.scene = scene
    this.count = count
    this.spacing = spacing
    this.mesh = null

    this.ready = this.#init({
      color,
      emissiveIntensity,
      heightMax,
      meshName,
      roughness,
      url,
    })
  }

  async #init({ color, emissiveIntensity, heightMax, meshName, roughness, url }) {
    const model = await loadGltf(url)
    let geometry = null

    model.traverse((child) => {
      if (child.isMesh && (!meshName || child.name === meshName) && !geometry) {
        geometry = child.geometry.clone()
      }
    })

    if (!geometry) {
      throw new Error(`Mesh "${meshName}" was not found in ${url}`)
    }

    const material = createFresnelMaterial({
      color,
      emissiveIntensity,
      heightMax,
      roughness,
    })

    this.mesh = new THREE.InstancedMesh(geometry, material, this.count)
    this.#setPositions(this.mesh)
    this.scene.add(this.mesh)
  }

  #setPositions(mesh) {
    const gridSize = Math.ceil(Math.sqrt(this.count))
    const halfSize = ((gridSize - 1) * this.spacing) / 2
    const spacingZ = this.spacing * 0.65
    const halfSizeZ = ((gridSize - 1) * spacingZ) / 2
    const dummy = new THREE.Object3D()

    for (let index = 0; index < this.count; index += 1) {
      const x = index % gridSize
      const z = Math.floor(index / gridSize)
      const xOffset = z % 2 === 1 ? this.spacing / 2 : 0

      dummy.position.set(
        x * this.spacing - halfSize + xOffset,
        0,
        z * spacingZ - halfSizeZ,
      )
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  dispose() {
    if (!this.mesh) {
      return
    }

    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.mesh = null
  }
}
