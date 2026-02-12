import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function LiquidBackground() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!mountRef.current) return;

    // --- Scene basics ---
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });

    // Importante para laptops sin GPU dedicada:
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);

    mountRef.current.appendChild(renderer.domElement);

    // --- Shader material (versión mínima) ---
    const uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uGrainIntensity: { value: 0.0 }, // grano apagado por defecto
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform vec2 uMouse;

        // ruido simple
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float noise(vec2 p){
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        void main() {
          vec2 uv = vUv;

          // relación de aspecto
          vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

          float t = uTime * 0.12;

          float n1 = noise(p * 2.0 + t);
          float n2 = noise(p * 3.5 - t * 1.2);
          float n3 = noise(p * 6.0 + vec2(t * 0.7, -t * 0.9));

          float flow = (n1 * 0.6 + n2 * 0.3 + n3 * 0.1);

          // paleta (azules/teal acorde a tu UI)
          vec3 c1 = vec3(0.03, 0.06, 0.12);
          vec3 c2 = vec3(0.06, 0.25, 0.35);
          vec3 c3 = vec3(0.20, 0.75, 0.85);

          float m1 = smoothstep(0.15, 0.85, flow);
          float m2 = smoothstep(0.35, 0.95, flow);

          vec3 color = mix(c1, c2, m1);
          color = mix(color, c3, m2 * 0.65);

          // viñeta suave
          float vignette = smoothstep(0.9, 0.2, length(uv - 0.5));
          color *= vignette;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    // --- Events ---
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(w, h);
      uniforms.uResolution.value.set(w, h);
    };

    const onPointerMove = (e: PointerEvent) => {
      // normalizado 0..1
      uniforms.uMouse.value.set(e.clientX / window.innerWidth, 1.0 - e.clientY / window.innerHeight);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    // --- Animation loop ---
    let raf = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      uniforms.uTime.value += clock.getDelta();
      renderer.render(scene, camera);
    };

    // pausa si tab está hidden (menos consumo)
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else animate();
    };
    document.addEventListener("visibilitychange", onVis);

    animate();

    // --- Cleanup (MUY importante en React) ---
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);

      scene.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();

      if (renderer.domElement && mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div className="liquid-bg" ref={mountRef} aria-hidden="true" />;
}
