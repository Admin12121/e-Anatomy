import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"

const loader = new GLTFLoader()
const dracoLoader = new DRACOLoader()

dracoLoader.setDecoderPath("/three-skull/draco/")
loader.setDRACOLoader(dracoLoader)

export function loadGltf(url) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        resolve(gltf.scene)
      },
      undefined,
      reject,
    )
  })
}
