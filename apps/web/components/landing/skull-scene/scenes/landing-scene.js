import * as THREE from "three/webgpu"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { vec3 } from "three/tsl"

import { CameraRig } from "../utils/camera-rig.js"
import { InstancedModel } from "../utils/instanced-model.js"

export class LandingScene {
  constructor(context, container) {
    this.context = context
    this.container = container

    const { height, width } = this.context.getDimensions()

    this.width = width
    this.height = height
    this.envMap = this.#createEnvironment()
    this.solidScene = this.#createScene()
    this.wireScene = this.#createScene()

    this.#createInstancedModels()
    this.#createCamera()
  }

  #createEnvironment() {
    const pmremGenerator = new THREE.PMREMGenerator(this.context.renderer)
    const envMap = pmremGenerator.fromScene(new RoomEnvironment()).texture

    pmremGenerator.dispose()

    return envMap
  }

  #createScene() {
    const scene = new THREE.Scene()
    const light = new THREE.PointLight(0xffffff, 0.75)

    scene.fog = new THREE.Fog(0x000000, 1, 3)
    scene.background = new THREE.Color(0x000000)
    scene.environment = this.envMap
    scene.environmentIntensity = 0.1

    light.position.set(1, 2, 1)
    scene.add(light)

    return scene
  }

  #createInstancedModels() {
    this.models = [
      new InstancedModel(this.solidScene, {
        color: vec3(0.16, 0.74, 0.96),
        emissiveIntensity: 0.72,
        heightMax: 1,
        meshName: "body",
        roughness: 1,
        url: "/three-skull/man_comp-transformed.glb",
      }),
      new InstancedModel(this.wireScene, {
        color: vec3(0.77, 0.93, 1),
        emissiveIntensity: 0.92,
        heightMax: 0.9,
        meshName: "skeleton",
        roughness: 0.9,
        url: "/three-skull/skeleton_comp-transformed.glb",
      }),
    ]

    this.ready = Promise.all(this.models.map((model) => model.ready))
  }

  #createCamera() {
    this.camera = new THREE.PerspectiveCamera(17, this.width / this.height, 0.1, 100)
    this.cameraRig = new CameraRig(this.camera, this.container)
  }

  animate(delta, elapsed) {
    this.cameraRig.update(delta, elapsed)
  }

  onResize(width, height) {
    this.width = width
    this.height = height
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    this.cameraRig.dispose()
    this.models.forEach((model) => model.dispose())
    this.envMap.dispose()
  }
}
