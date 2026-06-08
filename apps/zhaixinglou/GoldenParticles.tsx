/**
 * GoldenParticles — 高清细腻星光粒子系统
 * 
 * 设计理念：细腻 = 高级感。
 * - 大量极细锐利的星尘微点（高亮白芯，小尺寸）
 * - 极少量柔和大光晕（低透明度，营造纵深）
 * - 十字星芒闪烁（少量，强调仪式感）
 * - 螺旋上升轨迹，呼吸式透明度脉动
 * - 高分辨率 Procedural Texture（128px Canvas 生成）
 */
import React,{ useRef,useEffect } from 'react';
import {
    AdditiveBlending,
    BufferAttribute,
    BufferGeometry,
    CanvasTexture,
    Color,
    PerspectiveCamera,
    Points,
    PointsMaterial,
    Scene,
    WebGLRenderer,
} from 'three';

const DUST_COUNT = 200;  // 微尘星点
const GLOW_COUNT = 15;   // 大光晕
const CROSS_COUNT = 8;   // 十字星

const GoldenParticles: React.FC<{ paused?: boolean }> = ({ paused = false }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<number>(0);
    const pausedRef = useRef(paused);
    const animateFnRef = useRef<(() => void) | null>(null);

    // Keep pausedRef in sync
    useEffect(() => {
        pausedRef.current = paused;
        // If unpausing, restart the loop
        if (!paused && animateFnRef.current) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = requestAnimationFrame(animateFnRef.current);
        }
        // If pausing, cancel current frame
        if (paused) {
            cancelAnimationFrame(frameRef.current);
        }
    }, [paused]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // --- Renderer Setup ---
        const w = container.clientWidth;
        const h = container.clientHeight;
        const scene = new Scene();
        const camera = new PerspectiveCamera(50, w / h, 0.1, 100);
        camera.position.z = 6;

        const renderer = new WebGLRenderer({ alpha: true, antialias: false });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        // ===== Procedural Textures (128px for crisp rendering) =====

        // 1. Sharp star dust — tiny bright core, fast falloff
        const dustCanvas = document.createElement('canvas');
        dustCanvas.width = 128;
        dustCanvas.height = 128;
        const dustCtx = dustCanvas.getContext('2d')!;
        const dustGrad = dustCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
        dustGrad.addColorStop(0, 'rgba(255,255,255,1)');
        dustGrad.addColorStop(0.05, 'rgba(255,250,230,0.95)');
        dustGrad.addColorStop(0.15, 'rgba(255,235,180,0.5)');
        dustGrad.addColorStop(0.35, 'rgba(212,175,55,0.12)');
        dustGrad.addColorStop(0.6, 'rgba(140,107,62,0.03)');
        dustGrad.addColorStop(1, 'rgba(0,0,0,0)');
        dustCtx.fillStyle = dustGrad;
        dustCtx.fillRect(0, 0, 128, 128);
        const dustTexture = new CanvasTexture(dustCanvas);
        dustTexture.needsUpdate = true;

        // 2. Soft bokeh glow — very gentle falloff for depth
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 128;
        glowCanvas.height = 128;
        const glowCtx = glowCanvas.getContext('2d')!;
        const glowGrad = glowCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
        glowGrad.addColorStop(0, 'rgba(255,240,200,0.6)');
        glowGrad.addColorStop(0.2, 'rgba(212,175,55,0.25)');
        glowGrad.addColorStop(0.5, 'rgba(180,140,60,0.08)');
        glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        glowCtx.fillStyle = glowGrad;
        glowCtx.fillRect(0, 0, 128, 128);
        const glowTexture = new CanvasTexture(glowCanvas);
        glowTexture.needsUpdate = true;

        // 3. Cross-star flare — 4-point star
        const crossCanvas = document.createElement('canvas');
        crossCanvas.width = 128;
        crossCanvas.height = 128;
        const crossCtx = crossCanvas.getContext('2d')!;
        crossCtx.clearRect(0, 0, 128, 128);
        // Horizontal beam
        const hGrad = crossCtx.createLinearGradient(0, 64, 128, 64);
        hGrad.addColorStop(0, 'rgba(255,235,180,0)');
        hGrad.addColorStop(0.35, 'rgba(255,235,180,0.15)');
        hGrad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
        hGrad.addColorStop(0.65, 'rgba(255,235,180,0.15)');
        hGrad.addColorStop(1, 'rgba(255,235,180,0)');
        crossCtx.fillStyle = hGrad;
        crossCtx.fillRect(0, 60, 128, 8);
        // Vertical beam
        const vGrad = crossCtx.createLinearGradient(64, 0, 64, 128);
        vGrad.addColorStop(0, 'rgba(255,235,180,0)');
        vGrad.addColorStop(0.35, 'rgba(255,235,180,0.15)');
        vGrad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
        vGrad.addColorStop(0.65, 'rgba(255,235,180,0.15)');
        vGrad.addColorStop(1, 'rgba(255,235,180,0)');
        crossCtx.fillStyle = vGrad;
        crossCtx.fillRect(60, 0, 8, 128);
        // Core glow
        const coreGrad = crossCtx.createRadialGradient(64, 64, 0, 64, 64, 12);
        coreGrad.addColorStop(0, 'rgba(255,255,255,0.8)');
        coreGrad.addColorStop(1, 'rgba(255,235,180,0)');
        crossCtx.fillStyle = coreGrad;
        crossCtx.fillRect(52, 52, 24, 24);
        const crossTexture = new CanvasTexture(crossCanvas);
        crossTexture.needsUpdate = true;

        // ===== Particle Data =====
        const rng = () => Math.random();

        // --- Layer 1: Micro Star Dust (sharp, tiny, many) ---
        const dustData = {
            positions: new Float32Array(DUST_COUNT * 3),
            sizes: new Float32Array(DUST_COUNT),
            speeds: new Float32Array(DUST_COUNT),
            orbits: new Float32Array(DUST_COUNT),
            phases: new Float32Array(DUST_COUNT),
            twinkle: new Float32Array(DUST_COUNT),
        };

        for (let i = 0; i < DUST_COUNT; i++) {
            const angle = rng() * Math.PI * 2;
            const radius = rng() * 3.5 + 0.3;
            dustData.positions[i * 3] = Math.cos(angle) * radius;
            dustData.positions[i * 3 + 1] = (rng() - 0.5) * 9;
            dustData.positions[i * 3 + 2] = Math.sin(angle) * radius + (rng() - 0.5) * 1.5;
            dustData.sizes[i] = rng() * 0.04 + 0.015; // Very small: 0.015–0.055
            dustData.speeds[i] = rng() * 0.2 + 0.05;
            dustData.orbits[i] = radius;
            dustData.phases[i] = angle;
            dustData.twinkle[i] = rng() * Math.PI * 2;
        }

        const dustGeom = new BufferGeometry();
        dustGeom.setAttribute('position', new BufferAttribute(dustData.positions, 3));
        const dustMat = new PointsMaterial({
            map: dustTexture,
            size: 0.06,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.85,
            blending: AdditiveBlending,
            depthWrite: false,
            color: new Color('#FFF5E0'),
        });
        const dustPoints = new Points(dustGeom, dustMat);
        scene.add(dustPoints);

        // --- Layer 2: Large Bokeh Glows (few, soft depth) ---
        const glowData = {
            positions: new Float32Array(GLOW_COUNT * 3),
            baseSizes: new Float32Array(GLOW_COUNT),
            speeds: new Float32Array(GLOW_COUNT),
            phases: new Float32Array(GLOW_COUNT),
        };
        for (let i = 0; i < GLOW_COUNT; i++) {
            const angle = rng() * Math.PI * 2;
            const r = rng() * 2.5 + 1;
            glowData.positions[i * 3] = Math.cos(angle) * r;
            glowData.positions[i * 3 + 1] = (rng() - 0.5) * 7;
            glowData.positions[i * 3 + 2] = Math.sin(angle) * r;
            glowData.baseSizes[i] = rng() * 0.3 + 0.15;
            glowData.speeds[i] = rng() * 0.08 + 0.02;
            glowData.phases[i] = rng() * Math.PI * 2;
        }
        const glowGeom = new BufferGeometry();
        glowGeom.setAttribute('position', new BufferAttribute(glowData.positions, 3));
        const glowMat = new PointsMaterial({
            map: glowTexture,
            size: 0.35,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.15,
            blending: AdditiveBlending,
            depthWrite: false,
            color: new Color('#D4AF37'),
        });
        const glowPoints = new Points(glowGeom, glowMat);
        scene.add(glowPoints);

        // --- Layer 3: Cross-Star Flares (rare, dramatic) ---
        const crossData = {
            positions: new Float32Array(CROSS_COUNT * 3),
            phases: new Float32Array(CROSS_COUNT),
            baseSizes: new Float32Array(CROSS_COUNT),
        };
        for (let i = 0; i < CROSS_COUNT; i++) {
            const angle = rng() * Math.PI * 2;
            const r = rng() * 3 + 0.8;
            crossData.positions[i * 3] = Math.cos(angle) * r;
            crossData.positions[i * 3 + 1] = (rng() - 0.5) * 6;
            crossData.positions[i * 3 + 2] = Math.sin(angle) * r;
            crossData.phases[i] = rng() * Math.PI * 2;
            crossData.baseSizes[i] = rng() * 0.25 + 0.15;
        }
        const crossGeom = new BufferGeometry();
        crossGeom.setAttribute('position', new BufferAttribute(crossData.positions, 3));
        const crossMat = new PointsMaterial({
            map: crossTexture,
            size: 0.25,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.4,
            blending: AdditiveBlending,
            depthWrite: false,
            color: new Color('#FFE8B0'),
        });
        const crossPoints = new Points(crossGeom, crossMat);
        scene.add(crossPoints);

        // ===== Animation Loop =====
        let time = 0;

        const animate = () => {
            time += 0.002;

            // --- Dust: spiral drift + twinkle ---
            const dPos = dustGeom.getAttribute('position') as BufferAttribute;
            for (let i = 0; i < DUST_COUNT; i++) {
                const speed = dustData.speeds[i];
                const orbit = dustData.orbits[i];
                const phase = dustData.phases[i];
                const angle = phase + time * speed;
                dPos.array[i * 3] = Math.cos(angle) * orbit;
                dPos.array[i * 3 + 1] += speed * 0.005;
                dPos.array[i * 3 + 2] = Math.sin(angle) * orbit;
                if (dPos.array[i * 3 + 1] > 4.5) dPos.array[i * 3 + 1] = -4.5;
            }
            dPos.needsUpdate = true;
            // Twinkle: subtle opacity oscillation
            dustMat.opacity = 0.75 + Math.sin(time * 4) * 0.1;

            // --- Glow: gentle float + breathing ---
            const gPos = glowGeom.getAttribute('position') as BufferAttribute;
            for (let i = 0; i < GLOW_COUNT; i++) {
                gPos.array[i * 3 + 1] += glowData.speeds[i] * 0.003;
                if (gPos.array[i * 3 + 1] > 3.5) gPos.array[i * 3 + 1] = -3.5;
            }
            gPos.needsUpdate = true;
            glowMat.opacity = 0.1 + Math.sin(time * 1.5) * 0.05;

            // --- Cross: shimmer pulsation ---
            const cPos = crossGeom.getAttribute('position') as BufferAttribute;
            for (let i = 0; i < CROSS_COUNT; i++) {
                cPos.array[i * 3 + 1] += 0.002;
                if (cPos.array[i * 3 + 1] > 3) cPos.array[i * 3 + 1] = -3;
            }
            cPos.needsUpdate = true;
            // Each cross-star: stagger shimmer via phase
            crossMat.opacity = 0.2 + Math.sin(time * 5) * 0.2;

            renderer.render(scene, camera);
            if (!pausedRef.current) {
                frameRef.current = requestAnimationFrame(animate);
            }
        };

        animateFnRef.current = animate;
        animate();

        // --- Resize ---
        const handleResize = () => {
            if (!container) return;
            const nw = container.clientWidth;
            const nh = container.clientHeight;
            camera.aspect = nw / nh;
            camera.updateProjectionMatrix();
            renderer.setSize(nw, nh);
        };
        window.addEventListener('resize', handleResize);

        // --- Cleanup ---
        return () => {
            cancelAnimationFrame(frameRef.current);
            window.removeEventListener('resize', handleResize);
            renderer.forceContextLoss();
            renderer.dispose();
            dustGeom.dispose(); dustMat.dispose(); dustTexture.dispose();
            glowGeom.dispose(); glowMat.dispose(); glowTexture.dispose();
            crossGeom.dispose(); crossMat.dispose(); crossTexture.dispose();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 pointer-events-none z-[5]"
            style={{ mixBlendMode: 'screen' }}
        />
    );
};

export default React.memo(GoldenParticles);
