import {
  Fn,
  add,
  cos,
  dot,
  floor,
  fract,
  mix,
  mul,
  sin,
  sub,
  vec2,
  float,
} from "three/tsl"

const rand = Fn(([node]) => {
  const dp = dot(node, vec2(12.9898, 4.1414))

  return fract(mul(sin(dp), 43758.5453))
})

const noise = Fn(([node]) => {
  const ip = floor(node)
  const u = fract(node)
  const uu = mul(mul(u, u), sub(float(3), mul(u, 2)))
  const result = mix(
    mix(rand(ip), rand(add(ip, vec2(1, 0))), uu.x),
    mix(rand(add(ip, vec2(0, 1))), rand(add(ip, vec2(1, 1))), uu.x),
    uu.y,
  )

  return mul(result, result)
})

export const fbm = Fn(([input]) => {
  const value = float(0).toVar()
  const amplitude = float(0.5).toVar()
  const shift = vec2(100)
  const angle = float(0.5)
  const c = cos(angle)
  const s = sin(angle)
  const node = input.toVar()

  value.assign(add(value, mul(amplitude, noise(node))))
  node.assign(add(mul(vec2(sub(mul(node.x, c), mul(node.y, s)), add(mul(node.x, s), mul(node.y, c))), 2), shift))
  amplitude.assign(mul(amplitude, 0.5))

  value.assign(add(value, mul(amplitude, noise(node))))
  node.assign(add(mul(vec2(sub(mul(node.x, c), mul(node.y, s)), add(mul(node.x, s), mul(node.y, c))), 2), shift))
  amplitude.assign(mul(amplitude, 0.5))

  value.assign(add(value, mul(amplitude, noise(node))))
  node.assign(add(mul(vec2(sub(mul(node.x, c), mul(node.y, s)), add(mul(node.x, s), mul(node.y, c))), 2), shift))
  amplitude.assign(mul(amplitude, 0.5))

  value.assign(add(value, mul(amplitude, noise(node))))

  return value
})
