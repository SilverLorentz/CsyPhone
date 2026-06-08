/**
 * BurnParticles — 天机焚卷 · 金色光点消散动效
 *
 * 视觉意象：焚烧的卷轴化为金色光尘，螺旋上升后消散于虚空。
 *
 * 三层粒子系统：
 *   Layer 1: 大量极细金色微尘 — 主体光点，从中心向四周扩散上升
 *   Layer 2: 少量柔和大光晕 — 营造魔法纵深感
 *   Layer 3: 极少十字星芒 — 仪式感闪烁
 *
 * 动画阶段：
 *   Phase 0 (0~300ms):  粒子从中心快速迸发，带有初始爆发力
 *   Phase 1 (300~1500ms): 粒子螺旋上升扩散，逐渐减速
 *   Phase 2 (1500~2200ms): 粒子最终消散，尺寸缩小+透明度归零
 *   onComplete 回调
 *
 * 使用方式：
 *   <BurnParticles active={isBurning} onComplete={() => { ... }} />
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

// ── Particle counts ──
const DUST_COUNT = 160;
const GLOW_COUNT = 12;
const CROSS_COUNT = 6;
const EMBER_COUNT = 30; // 余烬火星，增加魔法感

// ── Timing ──
const TOTAL_DURATION_MS = 2400;

interface BurnParticlesProps {
    active: boolean;
    onComplete: () => void;
}

const BurnParticles: React.FC<BurnParticlesProps> = ({ active, onComplete }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const hasCompletedRef = useRef(false);
    const onCompleteRef = useRef(onComplete);

    // Keep onComplete ref in sync without triggering effect re-run
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
        if (!active) {
            hasCompletedRef.current = false;
            return;
        }
        const container = containerRef.current;
        if (!container || hasCompletedRef.current) return;

        // Clear any leftover canvas from previous runs
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        // ═══════════════════════════════════════
        // Renderer Setup
        // ═══════════════════════════════════════
        const w = container.clientWidth;
        const h = container.clientHeight;
        const scene = new Scene();
        const camera = new PerspectiveCamera(60, w / h, 0.1, 100);
        camera.position.z = 5;

        const renderer = new WebGLRenderer({ alpha: true, antialias: false });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        // ═══════════════════════════════════════
        // Procedural Textures (128px high-res)
        // ═══════════════════════════════════════

        // 1. Golden dust — bright white core, golden edge, fast falloff
        const dustCanvas = document.createElement('canvas');
        dustCanvas.width = 128;
        dustCanvas.height = 128;
        const dustCtx = dustCanvas.getContext('2d')!;
        const dustGrad = dustCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
        dustGrad.addColorStop(0, 'rgba(255,255,255,1)');
        dustGrad.addColorStop(0.04, 'rgba(255,250,230,0.97)');
        dustGrad.addColorStop(0.12, 'rgba(255,235,180,0.7)');
        dustGrad.addColorStop(0.25, 'rgba(255,215,100,0.35)');
        dustGrad.addColorStop(0.5, 'rgba(212,175,55,0.1)');
        dustGrad.addColorStop(1, 'rgba(0,0,0,0)');
        dustCtx.fillStyle = dustGrad;
        dustCtx.fillRect(0, 0, 128, 128);
        const dustTexture = new CanvasTexture(dustCanvas);

        // 2. Glow — large soft golden bokeh
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 128;
        glowCanvas.height = 128;
        const glowCtx = glowCanvas.getContext('2d')!;
        const glowGrad = glowCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
        glowGrad.addColorStop(0, 'rgba(255,240,200,0.7)');
        glowGrad.addColorStop(0.15, 'rgba(255,215,100,0.4)');
        glowGrad.addColorStop(0.35, 'rgba(212,175,55,0.15)');
        glowGrad.addColorStop(0.6, 'rgba(180,140,60,0.05)');
        glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        glowCtx.fillStyle = glowGrad;
        glowCtx.fillRect(0, 0, 128, 128);
        const glowTexture = new CanvasTexture(glowCanvas);

        // 3. Cross-star flare — 4-point star
        const crossCanvas = document.createElement('canvas');
        crossCanvas.width = 128;
        crossCanvas.height = 128;
        const crossCtx = crossCanvas.getContext('2d')!;
        crossCtx.clearRect(0, 0, 128, 128);
        // Horizontal beam
        const hGrad = crossCtx.createLinearGradient(0, 64, 128, 64);
        hGrad.addColorStop(0, 'rgba(255,235,180,0)');
        hGrad.addColorStop(0.3, 'rgba(255,235,180,0.2)');
        hGrad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
        hGrad.addColorStop(0.7, 'rgba(255,235,180,0.2)');
        hGrad.addColorStop(1, 'rgba(255,235,180,0)');
        crossCtx.fillStyle = hGrad;
        crossCtx.fillRect(0, 58, 128, 12);
        // Vertical beam
        const vGrad = crossCtx.createLinearGradient(64, 0, 64, 128);
        vGrad.addColorStop(0, 'rgba(255,235,180,0)');
        vGrad.addColorStop(0.3, 'rgba(255,235,180,0.2)');
        vGrad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
        vGrad.addColorStop(0.7, 'rgba(255,235,180,0.2)');
        vGrad.addColorStop(1, 'rgba(255,235,180,0)');
        crossCtx.fillStyle = vGrad;
        crossCtx.fillRect(58, 0, 12, 128);
        // Core glow
        const coreGrad = crossCtx.createRadialGradient(64, 64, 0, 64, 64, 16);
        coreGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
        coreGrad.addColorStop(1, 'rgba(255,235,180,0)');
        crossCtx.fillStyle = coreGrad;
        crossCtx.fillRect(48, 48, 32, 32);
        const crossTexture = new CanvasTexture(crossCanvas);

        // 4. Ember — warm orange-red spark for magic feel
        const emberCanvas = document.createElement('canvas');
        emberCanvas.width = 64;
        emberCanvas.height = 64;
        const emberCtx = emberCanvas.getContext('2d')!;
        const emberGrad = emberCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
        emberGrad.addColorStop(0, 'rgba(255,200,80,1)');
        emberGrad.addColorStop(0.1, 'rgba(255,160,40,0.8)');
        emberGrad.addColorStop(0.3, 'rgba(255,120,20,0.4)');
        emberGrad.addColorStop(0.6, 'rgba(200,80,10,0.1)');
        emberGrad.addColorStop(1, 'rgba(0,0,0,0)');
        emberCtx.fillStyle = emberGrad;
        emberCtx.fillRect(0, 0, 64, 64);
        const emberTexture = new CanvasTexture(emberCanvas);

        // ═══════════════════════════════════════
        // Particle Data Generation
        // ═══════════════════════════════════════
        const rng = () => Math.random();
        const rngRange = (min: number, max: number) => rng() * (max - min) + min;

        // ── Layer 1: Golden Dust ──
        const dustPositions = new Float32Array(DUST_COUNT * 3);
        const dustVelocities: { vx: number; vy: number; vz: number; spin: number; drag: number }[] = [];
        const dustSizes = new Float32Array(DUST_COUNT);
        const dustLifeOffsets = new Float32Array(DUST_COUNT); // stagger birth time

        for (let i = 0; i < DUST_COUNT; i++) {
            // Start clustered around center (simulate emerging from the panel)
            const angle = rng() * Math.PI * 2;
            const radius = rng() * 0.8; // tight cluster initially
            dustPositions[i * 3] = Math.cos(angle) * radius;
            dustPositions[i * 3 + 1] = (rng() - 0.5) * 1.2;
            dustPositions[i * 3 + 2] = Math.sin(angle) * radius * 0.3;

            // Outward burst + upward + spiral
            const burstSpeed = rngRange(0.02, 0.08);
            dustVelocities.push({
                vx: Math.cos(angle) * burstSpeed + rngRange(-0.01, 0.01),
                vy: rngRange(0.015, 0.06), // upward
                vz: Math.sin(angle) * burstSpeed * 0.3,
                spin: rngRange(-0.03, 0.03), // orbital spin speed
                drag: rngRange(0.985, 0.995), // decelerate over time
            });

            dustSizes[i] = rngRange(0.02, 0.07);
            dustLifeOffsets[i] = rng() * 0.15; // staggered birth over first 15% of animation
        }

        const dustGeom = new BufferGeometry();
        dustGeom.setAttribute('position', new BufferAttribute(dustPositions, 3));
        const dustMat = new PointsMaterial({
            map: dustTexture,
            size: 0.08,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0,
            blending: AdditiveBlending,
            depthWrite: false,
            color: new Color('#FFF5E0'),
        });
        const dustPoints = new Points(dustGeom, dustMat);
        scene.add(dustPoints);

        // ── Layer 2: Large Glow Orbs ──
        const glowPositions = new Float32Array(GLOW_COUNT * 3);
        const glowVelocities: { vx: number; vy: number; vz: number }[] = [];

        for (let i = 0; i < GLOW_COUNT; i++) {
            const angle = rng() * Math.PI * 2;
            const radius = rng() * 0.5;
            glowPositions[i * 3] = Math.cos(angle) * radius;
            glowPositions[i * 3 + 1] = (rng() - 0.5) * 0.8;
            glowPositions[i * 3 + 2] = Math.sin(angle) * radius * 0.3;
            glowVelocities.push({
                vx: Math.cos(angle) * rngRange(0.01, 0.03),
                vy: rngRange(0.01, 0.035),
                vz: Math.sin(angle) * rngRange(0.005, 0.015),
            });
        }

        const glowGeom = new BufferGeometry();
        glowGeom.setAttribute('position', new BufferAttribute(glowPositions, 3));
        const glowMat = new PointsMaterial({
            map: glowTexture,
            size: 0.5,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0,
            blending: AdditiveBlending,
            depthWrite: false,
            color: new Color('#D4AF37'),
        });
        const glowPoints = new Points(glowGeom, glowMat);
        scene.add(glowPoints);

        // ── Layer 3: Cross-Star Flares ──
        const crossPositions = new Float32Array(CROSS_COUNT * 3);
        const crossVelocities: { vx: number; vy: number }[] = [];
        const crossPhases = new Float32Array(CROSS_COUNT);

        for (let i = 0; i < CROSS_COUNT; i++) {
            const angle = rng() * Math.PI * 2;
            const radius = rng() * 1.2;
            crossPositions[i * 3] = Math.cos(angle) * radius;
            crossPositions[i * 3 + 1] = (rng() - 0.5) * 1;
            crossPositions[i * 3 + 2] = rng() * 0.3 - 0.15;
            crossVelocities.push({
                vx: Math.cos(angle) * rngRange(0.005, 0.02),
                vy: rngRange(0.012, 0.03),
            });
            crossPhases[i] = rng() * Math.PI * 2;
        }

        const crossGeom = new BufferGeometry();
        crossGeom.setAttribute('position', new BufferAttribute(crossPositions, 3));
        const crossMat = new PointsMaterial({
            map: crossTexture,
            size: 0.35,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0,
            blending: AdditiveBlending,
            depthWrite: false,
            color: new Color('#FFE8B0'),
        });
        const crossPoints = new Points(crossGeom, crossMat);
        scene.add(crossPoints);

        // ── Layer 4: Embers (warm sparks for magic feel) ──
        const emberPositions = new Float32Array(EMBER_COUNT * 3);
        const emberVelocities: { vx: number; vy: number; vz: number; wobble: number }[] = [];

        for (let i = 0; i < EMBER_COUNT; i++) {
            const angle = rng() * Math.PI * 2;
            const radius = rng() * 0.4;
            emberPositions[i * 3] = Math.cos(angle) * radius;
            emberPositions[i * 3 + 1] = (rng() - 0.5) * 0.6;
            emberPositions[i * 3 + 2] = Math.sin(angle) * radius * 0.2;
            emberVelocities.push({
                vx: Math.cos(angle) * rngRange(0.015, 0.05),
                vy: rngRange(0.025, 0.07), // embers rise faster
                vz: Math.sin(angle) * rngRange(0.005, 0.02),
                wobble: rngRange(2, 5), // horizontal wobble frequency
            });
        }

        const emberGeom = new BufferGeometry();
        emberGeom.setAttribute('position', new BufferAttribute(emberPositions, 3));
        const emberMat = new PointsMaterial({
            map: emberTexture,
            size: 0.04,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0,
            blending: AdditiveBlending,
            depthWrite: false,
            color: new Color('#FFB040'),
        });
        const emberPoints = new Points(emberGeom, emberMat);
        scene.add(emberPoints);

        // ═══════════════════════════════════════
        // Animation Loop
        // ═══════════════════════════════════════
        const startTime = performance.now();
        let frameId = 0;

        const animate = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / TOTAL_DURATION_MS, 1); // normalized 0→1

            // ── Phase-based opacity envelope ──
            // Ramp up (0→0.15), sustain (0.15→0.6), fade out (0.6→1.0)
            let masterOpacity: number;
            if (t < 0.12) {
                masterOpacity = t / 0.12; // ramp in
            } else if (t < 0.55) {
                masterOpacity = 1; // full
            } else {
                masterOpacity = 1 - ((t - 0.55) / 0.45); // fade out
                masterOpacity = masterOpacity * masterOpacity; // ease-out curve
            }

            // ── Size decay over time ──
            const sizeFactor = t < 0.3 ? 1 + t * 2 : (1.6 - (t - 0.3) * 1.2);
            const finalSizeFactor = Math.max(sizeFactor, 0.1);

            // ── Update Dust Layer ──
            const dPos = dustGeom.getAttribute('position') as BufferAttribute;
            for (let i = 0; i < DUST_COUNT; i++) {
                const lifeOffset = dustLifeOffsets[i];
                const localT = Math.max(0, t - lifeOffset);
                if (localT <= 0) continue;

                const v = dustVelocities[i];
                // Apply velocity with drag
                dPos.array[i * 3] += v.vx;
                dPos.array[i * 3 + 1] += v.vy;
                dPos.array[i * 3 + 2] += v.vz;

                // Spiral component
                const currentX = dPos.array[i * 3];
                const currentZ = dPos.array[i * 3 + 2];
                const dist = Math.sqrt(currentX * currentX + currentZ * currentZ);
                if (dist > 0.01) {
                    const angle = Math.atan2(currentZ, currentX) + v.spin;
                    dPos.array[i * 3] = Math.cos(angle) * dist;
                    dPos.array[i * 3 + 2] = Math.sin(angle) * dist;
                }

                // Apply drag
                v.vx *= v.drag;
                v.vy *= v.drag;
                v.vz *= v.drag;

                // Slight gravity-defying float (magic feel)
                v.vy += 0.0002;
            }
            dPos.needsUpdate = true;
            dustMat.opacity = masterOpacity * 0.9;
            dustMat.size = 0.08 * finalSizeFactor;

            // Twinkle effect — individual brightness variation via color oscillation
            const twinkle = 0.9 + Math.sin(elapsed * 0.01) * 0.1;
            dustMat.color.setRGB(twinkle, twinkle * 0.96, twinkle * 0.88);

            // ── Update Glow Layer ──
            const gPos = glowGeom.getAttribute('position') as BufferAttribute;
            for (let i = 0; i < GLOW_COUNT; i++) {
                const v = glowVelocities[i];
                gPos.array[i * 3] += v.vx;
                gPos.array[i * 3 + 1] += v.vy;
                gPos.array[i * 3 + 2] += v.vz;
                v.vx *= 0.992;
                v.vy *= 0.993;
                v.vz *= 0.992;
            }
            gPos.needsUpdate = true;
            glowMat.opacity = masterOpacity * 0.25;
            glowMat.size = 0.5 * finalSizeFactor;

            // ── Update Cross-Star Layer ──
            const cPos = crossGeom.getAttribute('position') as BufferAttribute;
            for (let i = 0; i < CROSS_COUNT; i++) {
                const v = crossVelocities[i];
                cPos.array[i * 3] += v.vx;
                cPos.array[i * 3 + 1] += v.vy;
                v.vx *= 0.99;
                v.vy *= 0.99;
            }
            cPos.needsUpdate = true;
            // Cross-stars shimmer independently
            const shimmer = 0.3 + Math.sin(elapsed * 0.008 + crossPhases[0]) * 0.3;
            crossMat.opacity = masterOpacity * shimmer;
            crossMat.size = 0.35 * finalSizeFactor;

            // ── Update Ember Layer ──
            const ePos = emberGeom.getAttribute('position') as BufferAttribute;
            for (let i = 0; i < EMBER_COUNT; i++) {
                const v = emberVelocities[i];
                ePos.array[i * 3] += v.vx + Math.sin(elapsed * 0.001 * v.wobble) * 0.003;
                ePos.array[i * 3 + 1] += v.vy;
                ePos.array[i * 3 + 2] += v.vz;
                v.vx *= 0.988;
                v.vy *= 0.992;
                v.vz *= 0.988;
                // Embers float upward with slight acceleration
                v.vy += 0.0003;
            }
            ePos.needsUpdate = true;
            // Embers flicker
            const flicker = 0.6 + Math.sin(elapsed * 0.015) * 0.3 + Math.sin(elapsed * 0.027) * 0.1;
            emberMat.opacity = masterOpacity * flicker;
            emberMat.size = 0.04 * finalSizeFactor * (1 + Math.sin(elapsed * 0.012) * 0.2);

            // ── Gentle camera drift for cinematic feel ──
            camera.position.x = Math.sin(elapsed * 0.0005) * 0.15;
            camera.position.y = Math.cos(elapsed * 0.0004) * 0.1 + 0.3 * t;
            camera.lookAt(0, 0.5 * t, 0);

            renderer.render(scene, camera);

            if (t < 1) {
                frameId = requestAnimationFrame(animate);
            } else {
                // Animation complete
                hasCompletedRef.current = true;
                onCompleteRef.current();
            }
        };

        frameId = requestAnimationFrame(animate);

        // ── Cleanup function ──
        const cleanup = () => {
            cancelAnimationFrame(frameId);
            renderer.forceContextLoss();
            renderer.dispose();
            dustGeom.dispose(); dustMat.dispose(); dustTexture.dispose();
            glowGeom.dispose(); glowMat.dispose(); glowTexture.dispose();
            crossGeom.dispose(); crossMat.dispose(); crossTexture.dispose();
            emberGeom.dispose(); emberMat.dispose(); emberTexture.dispose();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
        };
        return cleanup;
    }, [active]); // Only depend on `active` — onComplete is accessed via ref

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-[10001] pointer-events-none"
            style={{
                mixBlendMode: 'screen',
                visibility: active ? 'visible' : 'hidden',
            }}
        />
    );
};

export default React.memo(BurnParticles);
