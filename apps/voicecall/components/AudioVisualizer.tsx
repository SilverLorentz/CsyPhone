import React,{ useRef,useEffect } from 'react';

interface AudioVisualizerProps {
    isActive: boolean;
    isSpeaking: boolean;
}

const LOGICAL_WIDTH = 260;
const LOGICAL_HEIGHT = 80;

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isActive, isSpeaking }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number | null>(null);
    const isSpeakingRef = useRef(isSpeaking);
    const isActiveRef = useRef(isActive);

    useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
    useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = LOGICAL_WIDTH * dpr;
        canvas.height = LOGICAL_HEIGHT * dpr;
        ctx.scale(dpr, dpr);

        let time = 0;

        const render = () => {
            time += 0.04;
            ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

            if (!isActiveRef.current) {
                animationRef.current = requestAnimationFrame(render);
                return;
            }

            // 中心基准线
            ctx.beginPath();
            ctx.moveTo(0, LOGICAL_HEIGHT / 2);
            ctx.lineTo(LOGICAL_WIDTH, LOGICAL_HEIGHT / 2);
            ctx.strokeStyle = 'rgba(200, 192, 182, 0.04)';
            ctx.lineWidth = 1;
            ctx.stroke();

            const speaking = isSpeakingRef.current;

            const drawWave = (amplitudeBase: number, frequency: number, phaseOffset: number, color: string, lineWidth: number) => {
                ctx.beginPath();
                ctx.moveTo(0, LOGICAL_HEIGHT / 2);

                for (let i = 0; i < LOGICAL_WIDTH; i++) {
                    const currentAmplitude = speaking
                        ? amplitudeBase + Math.sin(time * 2) * (amplitudeBase * 0.4)
                        : amplitudeBase * 0.12;

                    const xProgress = i / LOGICAL_WIDTH;
                    const edgeDamping = Math.sin(xProgress * Math.PI);
                    const yOffset = Math.sin((i * frequency) + time + phaseOffset) * currentAmplitude * edgeDamping;

                    ctx.lineTo(i, LOGICAL_HEIGHT / 2 + yOffset);
                }

                ctx.strokeStyle = color;
                ctx.lineWidth = lineWidth;
                ctx.stroke();
            };

            // 柔和银灰色发光
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(210, 200, 188, 0.2)';

            drawWave(25, 0.02, 0, 'rgba(220, 215, 208, 0.7)', 2);
            drawWave(20, 0.03, Math.PI / 2, 'rgba(200, 192, 182, 0.35)', 1.5);
            drawWave(32, 0.015, Math.PI, 'rgba(180, 175, 168, 0.2)', 1.5);

            ctx.shadowBlur = 0;

            animationRef.current = requestAnimationFrame(render);
        };

        animationRef.current = requestAnimationFrame(render);

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, []);

    return (
        <div className="w-full flex justify-center py-2 opacity-0 vc-animate-fade" style={{ animationDelay: '0.2s' }}>
            <canvas
                ref={canvasRef}
                style={{ width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT }}
                className="max-w-[260px]"
            />
        </div>
    );
};

export default AudioVisualizer;
